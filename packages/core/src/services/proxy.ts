import * as http from "http";
import { Context } from "../utils/context";
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
}

/**
 * Proxy to starling computation api
 *
 * @WebdaModda
 */
export class ProxyService<T extends ProxyParameters = ProxyParameters> extends Service<T> {
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
    return http.request(
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
  forwardResponse(response: http.IncomingMessage, context: Context) {
    context.writeHead(response.statusCode, this.filterHeaders(response.headers));
    response.pipe(context.getStream());
  }

  /**
   * Allow subclass to implement custom override
   * @param context
   * @returns
   */
  getRequestHeaders(context: Context) {
    return context.getHttpContext().getHeaders();
  }

  /**
   * Proxy to an url
   * @param ctx
   * @param host
   * @param url
   */
  async proxy(ctx: Context, host: string, url: string) {
    const subUrl = ctx.getHttpContext().getRelativeUri().substring(url.length);
    this.log("DEBUG", "Proxying to", `${ctx.getHttpContext().getMethod()} ${host}${subUrl}`);
    await new Promise((resolve, reject) => {
      let xff = ctx.getHttpContext().getHeader("x-forwarded-for");
      if (!xff) {
        xff += `, ${ctx.getHttpContext().getClientIp()}`;
      } else {
        xff = ctx.getHttpContext().getClientIp();
      }
      const protocol = ctx.getHttpContext().getProtocol();
      let req = this.createRequest(
        `${host}${subUrl}`,
        ctx.getHttpContext().getMethod(),
        {
          ...this.getRequestHeaders(ctx),
          "X-Rewrite-URL": ctx.getHttpContext().getRelativeUri(),
          "X-Forwarded-Host": ctx.getHttpContext().getHeader("x-forwarded-host", `${ctx.getHttpContext().getHost()}`),
          "X-Forwarded-Proto": ctx
            .getHttpContext()
            .getHeader("x-forwarded-proto", protocol.substring(0, protocol.length - 1)),
          "X-Forwarded-For": xff
        },
        res => {
          res.on("end", resolve);
          res.on("error", reject);
          this.forwardResponse(res, ctx);
        }
      );
      req.on("error", reject);
      ctx.getHttpContext().getRawStream().pipe(req);
    });
  }

  /**
   * Proxy to starling
   * @param ctx
   */
  @Route("./{path}", ["GET", "POST", "DELETE", "PUT", "PATCH"], true)
  @Route(".", ["GET", "POST", "DELETE", "PUT", "PATCH"])
  async proxyRoute(ctx: Context) {
    if (this.parameters.requireAuthentication && !ctx.getCurrentUserId()) {
      throw 401;
    }
    // Add any additional controls here
    await this.proxy(ctx, this.parameters.backend, this.parameters.url);
  }
}
