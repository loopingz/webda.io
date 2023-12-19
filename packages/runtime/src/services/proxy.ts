import * as http from "http";
import * as https from "https";
import { Counter, Gauge, Histogram } from "../core";
import { WebdaError } from "../errors";
import { WebContext } from "../utils/context";
import { HttpContext } from "../utils/httpcontext";
import { Route, Service, ServiceParameters } from "./service";

export function createHttpHeader(line, headers) {
  return (
    Object.keys(headers)
      .reduce(
        function (head, key) {
          var value = headers[key];

          if (!Array.isArray(value)) {
            head.push(key + ": " + value);
            return head;
          }

          for (var i = 0; i < value.length; i++) {
            head.push(key + ": " + value[i]);
          }
          return head;
        },
        [line]
      )
      .join("\r\n") + "\r\n\r\n"
  );
}

/**
 * Proxy to a backend service
 */
export class ProxyParameters extends ServiceParameters {
  /**
   * URL to expose
   */
  url?: string;
  /**
   * URL to proxy to
   */
  backend: string;
  /**
   * Helper to refuse any request if user is not auth
   */
  requireAuthentication: boolean;
  /**
   * Add X-Forwarded-* headers
   *
   * @default true
   */
  proxyHeaders: boolean;

  constructor(params: any) {
    super(params);
    if (this.backend?.endsWith("/")) {
      this.backend = this.backend.substring(0, this.backend.length - 1);
    }
    this.proxyHeaders ??= true;
  }
}

/**
 * Proxy to starling computation api
 *
 * @WebdaModda
 */
export class ProxyService<T extends ProxyParameters = ProxyParameters> extends Service<T> {
  metrics: {
    http_request_total: Counter;
    http_request_in_flight: Gauge;
    http_request_duration_milliseconds: Histogram;
    http_errors: Counter;
  };

  /**
   * @override
   */
  initMetrics() {
    super.initMetrics();
    this.metrics.http_request_total = this.getMetric(Counter, {
      name: "proxy_request_total",
      help: "number of request",
      labelNames: ["method", "statuscode", "handler", "host"]
    });
    this.metrics.http_request_in_flight = this.getMetric(Gauge, {
      name: "proxy_request_in_flight",
      help: "number of request in flight",
      labelNames: ["method", "statuscode", "handler", "host"]
    });
    this.metrics.http_request_duration_milliseconds = this.getMetric(Histogram, {
      name: "proxy_request_duration_milliseconds",
      help: "request duration",
      labelNames: ["method", "statuscode", "handler", "host"]
    });
    this.metrics.http_errors = this.getMetric(Counter, {
      name: "proxy_request_errors",
      help: "request errors",
      labelNames: ["method", "statuscode", "handler", "host"]
    });
  }

  /**
   * @override
   */
  loadParameters(params: any) {
    return new ProxyParameters(params);
  }

  resolve() {
    // Register the proxy on the 'upgrade' event of http socket
    this.getWebda().on("Webda.Init.Http", (evt: any) => {
      evt.on("upgrade", (req, socket, head) => {
        this.proxyWS(req, socket, head);
      });
    });
    return super.resolve();
  }

  /**
   * Create the request to the backend
   * @param url
   * @param method
   * @param headers
   * @param callback
   * @returns
   */
  createRequest(
    url: string,
    method: string,
    headers: any,
    callback: (response: http.IncomingMessage) => void,
    options: { timeout?: number } = { timeout: 30000 }
  ) {
    let mod: any = http;
    if (url.startsWith("https://")) {
      mod = https;
    }
    return mod.request(
      url,
      {
        method,
        headers,
        ...options
      },
      callback
    );
  }

  /**
   * Filter backend headers to send to the client
   *
   * @param responseHeaders
   * @returns
   */
  filterHeaders(responseHeaders: http.IncomingHttpHeaders = {}): http.OutgoingHttpHeaders {
    const headers = {};
    Object.keys(responseHeaders)
      // Filter all CORS by default
      .filter(k => !k.startsWith("access") && k !== "")
      .forEach(k => {
        headers[k] = responseHeaders[k];
      });
    return headers;
  }

  /**
   * Forward the response
   * Allow you to intercept and override part of the answer
   *
   * @param response
   * @param context
   */
  forwardResponse(response: http.IncomingMessage, context: WebContext) {
    context.writeHead(response.statusCode, this.filterHeaders(response.headers));
    response.pipe(context.getStream());
  }

  /**
   * Allow subclass to implement custom override
   * @param context
   * @returns
   */
  getRequestHeaders(context: HttpContext) {
    const headers = { ...context.getHeaders() };
    if (this.parameters.proxyHeaders) {
      let xff = context.getHeader("x-forwarded-for");
      if (!xff) {
        xff += `, ${context.getClientIp()}`;
      } else {
        xff = context.getClientIp();
      }
      const protocol = context.getProtocol();
      headers["X-Rewrite-URL"] = context.getRelativeUri();
      headers["X-Forwarded-Host"] = context.getHeader("x-forwarded-host", `${context.getHost()}`);
      headers["X-Forwarded-Proto"] = context.getHeader("x-forwarded-proto", protocol.substring(0, protocol.length - 1));
      headers["X-Forwarded-For"] = xff;
    }
    return headers;
  }

  /**
   * Proxy to an url
   * @param ctx
   * @param host
   * @param url prefix to remove
   */
  async proxy(ctx: WebContext, host: string, url: string) {
    const subUrl = ctx.getHttpContext().getRelativeUri().substring(url.length);
    return this.rawProxy(ctx, host, subUrl);
  }

  /**
   * Proxy request to the backend errored
   * @param e
   */
  onError(e) {
    this.log("ERROR", "Proxying error", e);
  }

  /**
   * Proxy WebService
   */
  async proxyWS(req, socket, head) {
    if (!req.url.startsWith(this.parameters.url)) {
      return;
    }
    if (req.method !== "GET" || !req.headers.upgrade) {
      socket.destroy();
    }

    if (req.headers.upgrade.toLowerCase() !== "websocket") {
      socket.destroy();
    }
    // Proxy WS Only works with a WebdaServer from @webda/shell for now
    const webdaContext = await (<any>this.getWebda()).getContextFromRequest(req);
    await webdaContext.init();
    return this.rawProxyWS(
      webdaContext,
      `${this.getBackend(webdaContext)}${req.url.substring(this.parameters.url.length)}`,
      socket
    );
  }

  /**
   * Create the request to the WS backend
   * @param url
   * @param context
   * @returns
   */
  createWSRequest(url: string, context: WebContext): http.ClientRequest {
    const Url = new URL(url);
    return (Url.protocol === "http:" ? http : https).request({
      path: Url.pathname + Url.search,
      method: "GET",
      headers: { ...this.getRequestHeaders(context.getHttpContext()), host: Url.host },
      host: Url.hostname,
      port: Url.port
    });
  }

  /**
   *
   * @param context
   * @param url
   * @param socket
   */
  async rawProxyWS(context: WebContext, url: string, socket: any) {
    this.log("DEBUG", "Proxying upgrade request", `${url}`);
    const proxyReq = this.createWSRequest(url, context);
    proxyReq.on("response", res => {
      // @ts-ignore
      if (!res.upgrade) {
        socket.write(
          createHttpHeader("HTTP/" + res.httpVersion + " " + res.statusCode + " " + res.statusMessage, res.headers)
        );
        res.pipe(socket);
      }
    });

    const onError = err => {
      this.log("ERROR", err);
      socket.end();
    };

    proxyReq.on("error", onError);

    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      proxySocket.on("error", onError);

      // Allow us to listen when the websocket has completed
      proxySocket.on("end", function () {
        socket.end();
      });

      // The pipe below will end proxySocket if socket closes cleanly, but not
      // if it errors (eg, vanishes from the net and starts returning
      // EHOSTUNREACH). We need to do that explicitly.
      socket.on("error", function () {
        /* c8 ignore next 2 */
        proxySocket.end();
      });

      proxySocket.setTimeout(0);
      proxySocket.setNoDelay(true);
      proxySocket.setKeepAlive(true, 0);

      if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);

      //
      // Remark: Handle writing the headers to the socket when switching protocols
      // Also handles when a header is an array
      //
      socket.write(createHttpHeader("HTTP/1.1 101 Switching Protocols", proxyRes.headers));
      proxySocket.pipe(socket).pipe(proxySocket);
    });
    proxyReq.end();
  }

  /**
   * Proxy an url to the response directly
   * @param ctx
   * @param url
   */
  async rawProxy(ctx: WebContext, host: string, url: string = "/", headers: any = {}) {
    if (!url.startsWith("/")) {
      url = "/" + url;
    }
    this.log("DEBUG", "Proxying to", `${ctx.getHttpContext().getMethod()} ${host} ${url}`);
    this.metrics.http_request_in_flight.inc();
    await new Promise<void>((resolve, reject) => {
      const labels = {
        method: ctx.getHttpContext().getMethod(),
        host,
        handler: url
      };
      const onError = e => {
        this.metrics.http_request_in_flight.dec();
        this.metrics.http_errors.inc({ ...labels, statuscode: -1 });
        this.onError(e);
        resolve();
      };
      let Host;
      try {
        Host = new URL(host).host;
      } catch (err) {
        // Skip wrong host
      }
      try {
        const req = this.createRequest(
          `${host}${url}`,
          ctx.getHttpContext().getMethod(),
          {
            ...this.getRequestHeaders(ctx.getHttpContext()),
            Host,
            ...headers
          },
          res => {
            res.on("end", () => {
              this.metrics.http_request_in_flight.dec();
              resolve();
            });
            res.on("error", onError);
            this.metrics.http_request_total.inc({
              ...labels,
              statuscode: res.statusCode
            });
            if (res.statusCode >= 400) {
              this.metrics.http_errors.inc(labels);
            }
            this.forwardResponse(res, ctx);
          }
        );
        req.on("error", onError);
        ctx.getHttpContext().getRawStream().pipe(req);
      } catch (e) {
        onError(e);
      }
    });
  }

  /**
   * Simplify override for dynamic backend
   * @param _ctx
   * @returns
   */
  getBackend(_ctx: WebContext) {
    return this.parameters.backend;
  }

  /**
   * Proxy route
   * @param ctx
   */
  @Route("./{+path}", ["GET", "POST", "DELETE", "PUT", "PATCH"])
  @Route(".", ["GET", "POST", "DELETE", "PUT", "PATCH"])
  async proxyRoute(ctx: WebContext) {
    if (this.parameters.requireAuthentication && !ctx.getCurrentUserId()) {
      throw new WebdaError.Unauthorized("You need to be authenticated to access this route");
    }
    // Add any additional controls here
    await this.proxy(ctx, this.getBackend(ctx), this.parameters.url);
  }
}
