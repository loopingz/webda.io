import { Service } from "./service.js";
import { Command } from "./command.js";
import { WebContext } from "../contexts/webcontext.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Context, ContextProvider, ContextProviderInfo } from "../contexts/icontext.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { emitCoreEvent } from "../events/events.js";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { AddressInfo } from "node:net";
import { createChecker } from "is-in-subnet";
import { useLog } from "@webda/workout";
import type { JSONed } from "@webda/models";
import { Writable } from "node:stream";
import { useRouter } from "../rest/hooks.js";
import { runWithContext } from "../contexts/execution.js";

/** Parameters for the HTTP server including request limits, timeouts, and trusted proxy settings */
export class HttpServerParameters extends ServiceParameters {
  /**
   * Will not try to parse request bigger than this
   *
   * This parameter can be overriden by a direct call to
   * getHttpContext().getRawBody(xxx)
   *
   * @default 10Mb
   */
  requestLimit?: number;
  /**
   * Will not take more than this to read a request (unit: milliseconds)
   *
   * This parameter can be overriden by a direct call to
   * getHttpContext().getRawBody(undefined, xxx)
   *
   * @default 60000
   */
  requestTimeout?: number;

  /**
   * Trust this reverse proxies
   */
  trustedProxies: string[];
  /**
   * Allowed origin for referer that match
   * any of this regexp
   *
   * {@link OriginFilter}
   */
  csrfOrigins?: string[];
  /**
   * Default headers to send to the client
   *
   * Having a Cache-Control: private will prevent caching for API
   * If you overwrite this parameter, you will need to add it back
   */
  defaultHeaders?: { [key: string]: string };
  /**
   * Port to listen on
   *
   * @default 18080
   */
  port?: number;

  /**
   * Load parameters with defaults for request limits, timeouts, and proxy configuration
   * @param params - the service parameters
   * @returns this for chaining
   */
  load(params: Omit<JSONed<HttpServerParameters>, "trustedProxies"> & { trustedProxies?: string | string[] }): this {
    super.load(params);
    this.requestLimit ??= 10 * 1024 * 1024;
    this.requestTimeout ??= 60000;
    this.trustedProxies ??= [];
    if (typeof params.trustedProxies === "string") {
      this.trustedProxies = params.trustedProxies.split(",").map(n => n.trim());
    }
    return this;
  }
}

export type HttpServerEvents = {
  /**
   * Emitted when new result is sent
   */
  "Webda.Result": { context: WebContext };
  /**
   * Emitted when new request comes in
   */
  "Webda.Request": { context: WebContext };
  /**
   * Emitted when a request does not match any route
   */
  "Webda.404": { context: WebContext };
  /**
   * Sent when route is added to context
   */
  "Webda.UpdateContextRoute": {
    context: WebContext;
  };
};

/**
 * Basic HTTP server service
 *
 * @WebdaModda
 */
export class HttpServer<
  P extends HttpServerParameters = HttpServerParameters,
  E extends HttpServerEvents = HttpServerEvents
> extends Service<P, E> {
  /**
   * Registered context providers
   */
  private contextProviders: ContextProvider[] = [
    {
      getContext: (info: ContextProviderInfo) => {
        // If http is defined, return a WebContext
        if (info.http) {
          return new WebContext(info.http, info.stream);
        }
        return new OperationContext(info.stream);
      }
    }
  ];
  server: Server;
  protected subnetChecker: (address: string) => boolean;

  /**
   * Start the HTTP server, handling incoming requests and routing them through Webda
   * @param bind - the bind address
   * @param port - the port number
   * @returns the result
   */
  @Command("serve", { description: "Start the HTTP server", requires: ["router", "rest-domain"] })
  async serve(bind?: string, port?: number) {
    return this.parameters.with(async params => {
      useLog("INFO", `Starting HTTP server on ${bind ?? "0.0.0.0"}:${port ?? params.port ?? 18080}`);
      if (this.server) {
        await new Promise(resolve => this.server.close(resolve));
      }
      this.server = createServer(async (req, res) => {
        try {
          const ctx = await this.getContextFromRequest(req, res);
          if (!ctx) {
            res.writeHead(500);
            res.end();
            return;
          }
          const webCtx = ctx as WebContext;
          await runWithContext(webCtx, async () => {
            try {
              await emitCoreEvent("Webda.Request", { context: webCtx });
              await useRouter().execute(webCtx);
              await emitCoreEvent("Webda.Result", { context: webCtx });
            } catch (err) {
              webCtx.statusCode = err?.getResponseCode?.() || 500;
            }
          });
          // Flush headers and body to the HTTP response
          if (!res.headersSent) {
            res.writeHead(webCtx.statusCode || 200, webCtx.getResponseHeaders());
          }
          const body = webCtx.getOutput();
          if (body) {
            res.end(body);
          } else {
            res.end();
          }
        } catch (err) {
          // Ensure the response is always closed
          if (!res.headersSent) {
            res.writeHead(500);
          }
          res.end();
        }
      });
      // Ensure routes are mapped before accepting requests
      useRouter().remapRoutes();
      this.server.listen(port || params.port || 18080);
    });
    // We do not want to stop server if other params are changed
    this.parameters.with(params => {
      this.subnetChecker = createChecker(
        params.trustedProxies.map(n => (n.indexOf("/") < 0 ? `${n.trim()}/32` : n.trim()))
      );
    });
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    await super.stop();
    this.server?.close();
  }

  /**
   * Return a Context object based on a request
   * @param req to initiate object from
   * @param res to add for body
   * @returns the result
   */
  async getContextFromRequest(req: IncomingMessage, res?: ServerResponse) {
    // Handle reverse proxy
    let vhost: string = req.headers.host.match(/:/g)
      ? req.headers.host.slice(0, req.headers.host.indexOf(":"))
      : req.headers.host;
    if (
      (req.headers["x-forwarded-for"] ||
        req.headers["x-forwarded-host"] ||
        req.headers["x-forwarded-proto"] ||
        req.headers["x-forwarded-port"]) &&
      !this.isProxyTrusted(req.socket.remoteAddress)
    ) {
      // Do not even let the query go through
      this.log("WARN", `X-Forwarded-* headers set from an unknown source: ${req.socket.remoteAddress}`);
      res.writeHead(400);
      return;
    }
    // Might want to add some whitelisting
    if (req.headers["x-forwarded-host"] !== undefined) {
      vhost = <string>req.headers["x-forwarded-host"];
    }
    let protocol: "http" | "https" = "http";
    if (req.headers["x-forwarded-proto"] !== undefined) {
      protocol = <"http" | "https">req.headers["x-forwarded-proto"];
    }

    const method = req.method;
    let port;
    if (req.socket && req.socket.address()) {
      port = (<AddressInfo>req.socket.address()).port;
    }
    if (req.headers["x-forwarded-port"] !== undefined) {
      port = parseInt(<string>req.headers["x-forwarded-port"]);
    } else if (req.headers["x-forwarded-proto"] !== undefined) {
      // GCP send a proto without port so fallback on default port
      port = protocol === "http" ? 80 : 443;
    }
    const httpContext = new HttpContext(vhost, <HttpMethodType>method, req.url, protocol, port, req.headers);
    httpContext.setClientIp(httpContext.getUniqueHeader("x-forwarded-for", req.socket.remoteAddress));
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
    if (["PUT", "PATCH", "POST", "DELETE"].includes(method)) {
      httpContext.setBody(req);
    }
    return this.newContext({ http: httpContext, stream: <Writable>res });
  }

  /**
   * Check if a proxy is a trusted proxy
   * @param ip - the IP address
   * @returns true if the condition is met
   */
  isProxyTrusted(ip: string): boolean {
    // ipv4 mapped to v6
    return this.subnetChecker(ip);
  }

  /**
   * Get a context based on the info
   * @param info - the information object
   * @returns the result
   * @param noInit - whether to skip initialization
   * @TODO Move to the HttpServer service
   */
  async newContext<T extends Context>(info: ContextProviderInfo, noInit: boolean = false): Promise<Context> {
    let context: Context;
    this.contextProviders.find(provider => (context = <Context>provider.getContext(info)) !== undefined);
    if (!noInit) {
      await context.init();
    }
    await emitCoreEvent("Webda.NewContext", { context, info });
    return <T>context;
  }

  /**
   * Register a new context provider
   * @param provider - the provider name
   * @TODO Move to the HttpServer service
   */
  registerContextProvider(provider: ContextProvider) {
    this.contextProviders ??= [];
    this.contextProviders.unshift(provider);
  }
}
