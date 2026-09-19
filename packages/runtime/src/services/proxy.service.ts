import {
  Counter,
  Gauge,
  Histogram,
  HttpContext,
  Route,
  Service,
  ServiceParameters,
  useCore,
  useCoreEvents,
  WebContext,
  WebdaError
} from "@webda/core";
import * as http from "http";
import * as https from "https";

/**
 * Build a raw HTTP header block from a status line and header map
 * @param line - status line (e.g. "HTTP/1.1 101 Switching Protocols")
 * @param headers - header key-value map (values may be arrays for multi-value headers)
 * @returns formatted header string terminated by CRLFCRLF
 */
export function createHttpHeader(line, headers) {
  return (
    Object.keys(headers)
      .reduce(
        (head, key) => {
          const value = headers[key];

          if (!Array.isArray(value)) {
            head.push(key + ": " + value);
            return head;
          }

          for (let i = 0; i < value.length; i++) {
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

  /**
   * Normalize backend URL and set defaults
   * @param params - raw configuration values
   */
  constructor(params?: any) {
    super();
    this.load(params);
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

  /**
   * Register an HTTP upgrade listener for WebSocket proxying
   * @returns this instance for chaining
   */
  resolve() {
    // Register the proxy on the 'upgrade' event of http socket
    useCoreEvents("Webda.Init.Http" as any, (evt: any) => {
      evt.on("upgrade", (req, socket, head) => {
        this.proxyWS(req, socket, head);
      });
    });
    return super.resolve();
  }

  /**
   * Create the request to the backend
   * @param url - full backend URL to request
   * @param method - HTTP method (GET, POST, etc.)
   * @param headers - headers to forward
   * @param callback - response handler invoked when the backend responds
   * @param options - request options
   * @param options.timeout - request timeout in milliseconds (default 30000)
   * @returns the outgoing ClientRequest
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
   * Filter backend headers to send to the client (strips CORS headers by default)
   *
   * @param responseHeaders - headers from the backend response
   * @returns filtered headers safe to forward to the client
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
   * Forward the response from the backend to the client.
   * Override to intercept or transform the proxied response.
   *
   * @param response - incoming HTTP response from the backend
   * @param context - WebContext to write the proxied response to
   */
  async forwardResponse(response: http.IncomingMessage, context: WebContext) {
    context.writeHead(response.statusCode, this.filterHeaders(response.headers));
    response.pipe(await context.getOutputStream());
  }

  /**
   * Build request headers to forward, adding X-Forwarded-* if configured
   * @param context - the original HTTP context from the client
   * @returns header map to send to the backend including proxy headers
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
   * Proxy the request to a backend after stripping the local URL prefix
   * @param ctx - incoming web context
   * @param host - backend base URL to proxy to
   * @param url - local URL prefix to strip before forwarding
   * @returns promise resolving when the proxied response is fully streamed
   */
  async proxy(ctx: WebContext, host: string, url: string) {
    const subUrl = ctx.getHttpContext().getRelativeUri().substring(url.length);
    return this.rawProxy(ctx, host, subUrl);
  }

  /**
   * Handle proxy request errors (logged at ERROR level)
   * @param e - the error that occurred during proxying
   */
  onError(e) {
    this.log("ERROR", "Proxying error", e);
  }

  /**
   * Handle an HTTP upgrade request and proxy it as a WebSocket connection
   * @param req - raw HTTP incoming message from the upgrade event
   * @param socket - duplex socket from the upgrade event
   * @param head - first packet of the upgraded stream
   * @returns promise resolving when the WebSocket proxy is set up
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
    const webdaContext = await (<any>useCore()).getContextFromRequest(req);
    await webdaContext.init();
    return this.rawProxyWS(
      webdaContext,
      `${this.getBackend(webdaContext)}${req.url.substring(this.parameters.url.length)}`,
      socket
    );
  }

  /**
   * Create the request to the WS backend
   * @param url - full WebSocket backend URL
   * @param context - web context supplying headers and client info
   * @returns an outgoing HTTP client request configured for WS upgrade
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
   * Low-level WebSocket proxy: pipes the client socket to the backend socket
   * @param context - web context for header forwarding
   * @param url - full backend WebSocket URL
   * @param socket - client-side duplex socket from the HTTP upgrade
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
      proxySocket.on("end", () => {
        socket.end();
      });

      // The pipe below will end proxySocket if socket closes cleanly, but not
      // if it errors (eg, vanishes from the net and starts returning
      // EHOSTUNREACH). We need to do that explicitly.
      socket.on("error", () => {
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
   * Low-level HTTP proxy: pipes request body to backend and streams the response back
   * @param ctx - incoming web context
   * @param host - backend base URL
   * @param url - path to append to the host
   * @param headers - extra headers to merge into the forwarded request
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
   * Resolve the backend URL for a given request. Override for dynamic routing.
   * @param _ctx - web context (unused in base implementation)
   * @returns the backend base URL to proxy to
   */
  getBackend(_ctx: WebContext) {
    return this.parameters.backend;
  }

  /**
   * Main proxy route handler — enforces authentication if configured, then proxies
   * @param ctx - incoming web context
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
