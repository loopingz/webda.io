import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { isIP } from "node:net";
import { Writable } from "node:stream";
import { useLog } from "@webda/workout";
import {
  CronService,
  emitCoreEvent,
  HttpContext,
  HttpMethodType,
  runWithContext,
  Service,
  ServiceParameters,
  traceRequest,
  useCore,
  useRouter,
  WebContext,
  WebdaError
} from "@webda/core";

/** Non-HTTP bindings dispatch to services implementing this contract. */
export interface AzureEventsHandler {
  handleAzureEvent(
    source: "servicebus" | "blob" | "timer",
    event: unknown,
    context: InvocationContext
  ): Promise<boolean>;
}

/** Azure Functions HTTP adapter settings. */
export class AzureFunctionServerParameters extends ServiceParameters {
  requestIdHeader = "x-request-id";
}

/** Collect bytes directly, preserving binary responses from write() and streaming routes. */
class AzureFunctionContext extends WebContext {
  readonly chunks: Buffer[];
  private savedHeaders: ReturnType<WebContext["getResponseHeaders"]> = {};
  /**
   * Initialize the Azure integration.
   * @param http - HTTP request context
   */
  constructor(http: HttpContext) {
    const chunks: Buffer[] = [];
    super(
      http,
      new Writable({
        /**
         * Perform write.
         * @override
         */
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        }
      })
    );
    this.chunks = chunks;
  }
  /**
   * Perform write.
   * @override
   */
  write(output: any, encoding?: string, callback?: (error: Error) => void): boolean {
    if (Buffer.isBuffer(output)) {
      if (this.statusCode === 204) this.statusCode = 200;
      return this._stream.write(output);
    }
    const result = super.write(output, encoding, callback);
    if (this._body !== undefined) {
      this._stream.write(this._body);
      this._body = undefined!;
    }
    return result;
  }
  /**
   * Perform reset response.
   * @override
   */
  resetResponse(): void {
    super.resetResponse();
    this.chunks.length = 0;
    this.savedHeaders = {};
  }

  /** Retain headers flushed by streaming routes until the Functions response is returned.
   * @override
   */
  getResponseHeaders(): ReturnType<WebContext["getResponseHeaders"]> {
    return (this.savedHeaders = { ...this.savedHeaders, ...super.getResponseHeaders() });
  }
}

/** Run Webda routes and event handlers inside the Azure Functions v4 runtime.
 * @WebdaModda
 */
export class AzureFunctionServer extends Service<AzureFunctionServerParameters> {
  static Parameters = AzureFunctionServerParameters;

  /**
   * Execute an Azure HTTP request through the Webda router.
   * @param request - Azure Functions HTTP request
   * @param invocation - Azure invocation metadata
   * @returns The handle request result
   */
  async handleRequest(request: HttpRequest, invocation: InvocationContext): Promise<HttpResponseInit> {
    const url = new URL(request.url),
      headers = Object.fromEntries(request.headers.entries());
    const http = new HttpContext(
      url.host,
      request.method as HttpMethodType,
      url.pathname + url.search,
      url.protocol === "http:" ? "http" : "https",
      Number(url.port || (url.protocol === "http:" ? 80 : 443)),
      headers
    );
    if (!["GET", "HEAD"].includes(request.method)) http.setBody(Buffer.from(await request.arrayBuffer()));
    const context = new AzureFunctionContext(http);
    await context.init();
    await emitCoreEvent("Webda.NewContext", { context, info: { http } });
    return traceRequest(
      {
        protocol: "http",
        method: request.method,
        path: url.pathname,
        scheme: url.protocol === "http:" ? "http" : "https",
        headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
        clientIp: this.getClientIp(headers)
      },
      async handle => {
        const result = await runWithContext(context, async () => {
          try {
            await emitCoreEvent("Webda.Request", { context });
            if (this.parameters.requestIdHeader)
              context.setHeader(this.parameters.requestIdHeader, invocation.invocationId);
            const origin = headers.origin;
            if (origin) {
              if (!(await useRouter()["checkCORSRequest"](context))) {
                // No Access-Control-* for a refused origin, but the answer still depends on it
                context.setHeader("Vary", "Origin");
                throw new WebdaError.Unauthorized("Origin not allowed");
              }
              // Access-Control-Allow-Origin/-Credentials are set by the Router
            }
            if (url.protocol === "https:")
              context.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
            await useRouter().execute(context);
          } catch (error) {
            if (error instanceof WebdaError.HttpError) {
              context.statusCode = error.getResponseCode();
              if (error instanceof WebdaError.Redirect) context.setHeader("Location", error.location);
            } else if (typeof error === "number") context.statusCode = error;
            else {
              context.statusCode = 500;
              this.log("ERROR", "Azure Function request failed");
            }
          }
          await emitCoreEvent("Webda.Result", { context });
          const responseHeaders = { ...context.getResponseHeaders() };
          await context.end();
          const merged = { ...responseHeaders, ...context.getResponseHeaders() };
          const resultHeaders = Object.fromEntries(
            Object.entries(merged)
              .filter(
                ([name, value]) =>
                  value !== undefined &&
                  (name.toLowerCase() !== "set-cookie" || !Object.keys(context.getResponseCookies() ?? {}).length)
              )
              .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)])
          );
          const cookies = Object.values(context.getResponseCookies() ?? {}).map(cookie => {
            const options = cookie.options ?? {};
            const sameSite = options.sameSite === true ? "strict" : options.sameSite;
            return {
              name: cookie.name,
              value: cookie.value,
              domain: options.domain,
              path: options.path,
              secure: options.secure,
              httpOnly: options.httpOnly,
              expires: options.expires,
              maxAge: options.maxAge,
              sameSite:
                typeof sameSite === "string"
                  ? ((sameSite[0].toUpperCase() + sameSite.slice(1).toLowerCase()) as "Strict" | "Lax" | "None")
                  : undefined
            };
          });
          const body = Buffer.concat(context.chunks);
          return {
            status: context.getResponseCode(),
            headers: resultHeaders,
            cookies,
            body: request.method === "HEAD" || body.length === 0 ? undefined : body
          };
        });
        try {
          handle.setStatus(result.status);
        } catch (err) {
          useLog("WARN", "Request tracer failed to record the status", err);
        }
        return result;
      }
    );
  }

  /**
   * Resolve the client address from the rightmost X-Forwarded-For entry, without any port. Never throws.
   * @param headers - the request headers
   * @returns the address, undefined if unknown or invalid
   */
  protected getClientIp(headers: Record<string, string>): string | undefined {
    try {
      let last = Object.entries(headers)
        .find(([name]) => name.toLowerCase() === "x-forwarded-for")?.[1]
        ?.split(",")
        .pop()
        ?.trim();
      if (!last) return undefined;
      // [v6]:port, v4:port (a bare v6 contains several colons and is kept as is)
      const bracketed = last.match(/^\[([^\]]+)\](?::\d+)?$/);
      if (bracketed) last = bracketed[1];
      else if (last.split(":").length === 2) last = last.split(":")[0];
      return isIP(last) ? last : undefined;
    } catch (err) {
      useLog("WARN", "Cannot resolve the client address", err);
      return undefined;
    }
  }

  /**
   * Dispatch an Azure binding event to configured handler services.
   * @param source - Azure binding event source
   * @param event - Received event payload
   * @param context - Webda or Azure invocation context
   */
  async handleEvent(
    source: "servicebus" | "blob" | "timer",
    event: unknown,
    context: InvocationContext
  ): Promise<void> {
    let handled = false;
    for (const service of Object.values(useCore().getServices())) {
      if (typeof (service as unknown as AzureEventsHandler).handleAzureEvent === "function") {
        handled =
          (await (service as unknown as AzureEventsHandler).handleAzureEvent(source, event, context)) || handled;
      }
    }
    if (!handled) throw new WebdaError.NotImplemented(`No Azure ${source} event handler is configured`);
  }

  /**
   * Execute only the declared cron matching the exported identifier, through its operation
   * @param id - Secret name or exported cron identifier
   */
  async handleCron(id: string): Promise<void> {
    const crons = CronService.resolveCrons().filter(cron => CronService.getExportId(cron) === id);
    if (!crons.length) throw new WebdaError.NotFound("Azure timer does not match a declared Webda cron");
    for (const cron of crons) await CronService.execute(cron, true);
  }
}
