import * as http from "http";
import * as https from "https";
import { Counter, Gauge, Histogram } from "../core";
import { WebdaError } from "../errors";
import { WebContext } from "../utils/context";
import { Route, Service, ServiceParameters } from "./service";

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

  constructor(params: any) {
    super(params);
    if (this.backend?.endsWith("/")) {
      this.backend = this.backend.substring(0, this.backend.length - 1);
    }
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

  /**
   * Create the request to the backend
   * @param url
   * @param method
   * @param headers
   * @param callback
   * @returns
   */
  createRequest(url: string, method: string, headers: any, callback: (response: http.IncomingMessage) => void) {
    let mod: any = http;
    if (url.startsWith("https://")) {
      mod = https;
    }
    return mod.request(
      url,
      {
        method,
        headers
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
  getRequestHeaders(context: WebContext) {
    return context.getHttpContext().getHeaders();
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
   * Proxy an url to the response directly
   * @param ctx
   * @param url
   */
  async rawProxy(ctx: WebContext, host: string, url: string, headers: any = {}) {
    this.log("DEBUG", "Proxying to", `${ctx.getHttpContext().getMethod()} ${url}`);
    this.metrics.http_request_in_flight.inc();
    await new Promise<void>((resolve, reject) => {
      let xff = ctx.getHttpContext().getHeader("x-forwarded-for");
      if (!xff) {
        xff += `, ${ctx.getHttpContext().getClientIp()}`;
      } else {
        xff = ctx.getHttpContext().getClientIp();
      }
      const protocol = ctx.getHttpContext().getProtocol();
      const labels = {
        method: ctx.getHttpContext().getMethod(),
        host,
        handler: url
      };
      const onError = e => {
        this.metrics.http_request_in_flight.dec();
        this.metrics.http_errors.inc({ ...labels, statuscode: -1 });
        this.log("ERROR", "Proxying error", e);
        resolve();
      };
      try {
        const req = this.createRequest(
          `${host}${url}`,
          ctx.getHttpContext().getMethod(),
          {
            ...this.getRequestHeaders(ctx),
            "X-Rewrite-URL": ctx.getHttpContext().getRelativeUri(),
            "X-Forwarded-Host": ctx.getHttpContext().getHeader("x-forwarded-host", `${ctx.getHttpContext().getHost()}`),
            "X-Forwarded-Proto": ctx
              .getHttpContext()
              .getHeader("x-forwarded-proto", protocol.substring(0, protocol.length - 1)),
            "X-Forwarded-For": xff,
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
    await this.proxy(ctx, this.parameters.backend, this.parameters.url);
  }
}
