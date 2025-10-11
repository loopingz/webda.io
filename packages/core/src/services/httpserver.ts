import { Service } from "./service.js";
import { WebContext } from "../contexts/webcontext.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Context, ContextProvider, ContextProviderInfo } from "../contexts/icontext.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { emitCoreEvent } from "../events/events.js";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { AddressInfo } from "node:net";
import { createChecker } from "is-in-subnet";
import { JSONed } from "@webda/models";
import { Writable } from "node:stream";

class HttpServerParameters extends ServiceParameters {
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


  async init(): Promise<this> {
    await super.init();
    this.parameters.with(async params => {
      if (this.server) {
        await new Promise(resolve => this.server.close(resolve));
      }
      this.server = createServer(async (req, res) => {
        // TODO Initiate the httpContext
        const context = await this.getContextFromRequest(req, res);
        await emitCoreEvent("Webda.Request", { context: context as WebContext });
        res.on("close", async () => {
        });
        await emitCoreEvent("Webda.Result", { context: context as WebContext });
      });
      this.server.listen(params.port || 18080);
    });
    // We do not want to stop server if other params are changed
    this.parameters.with(params => {
      this.subnetChecker = createChecker(
        params.trustedProxies.map(n => (n.indexOf("/") < 0 ? `${n.trim()}/32` : n.trim()))
      );
    })
    return this;
  }

  async stop(): Promise<void> {
    await super.stop();
    this.server?.close();
  }


  /**
   * Return a Context object based on a request
   * @param req to initiate object from
   * @param res to add for body
   * @returns
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
    return this.newContext({http: httpContext, stream: <Writable>res});
  }

  /**
   * Check if a proxy is a trusted proxy
   * @param ip
   * @returns
   */
  isProxyTrusted(ip: string): boolean {
    // ipv4 mapped to v6
    return this.subnetChecker(ip);
  }

  /**
   * Get a context based on the info
   * @param info
   * @returns
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
   * @param provider
   * @TODO Move to the HttpServer service
   */
  registerContextProvider(provider: ContextProvider) {
    this.contextProviders ??= [];
    this.contextProviders.unshift(provider);
  }
}
