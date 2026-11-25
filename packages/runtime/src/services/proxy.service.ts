import {
  Counter,
  Gauge,
  Histogram,
  HttpContext,
  Route,
  SecretString,
  Service,
  ServiceParameters,
  useCore,
  useCoreEvents,
  WebContext,
  WebdaError
} from "@webda/core";
import * as http from "http";
import * as https from "https";
import type { Duplex } from "stream";

/**
 * Build a raw HTTP header block from a status line and header map
 * @param line - status line (e.g. "HTTP/1.1 101 Switching Protocols")
 * @param headers - header key-value map (values may be arrays for multi-value headers)
 * @returns formatted header string terminated by CRLFCRLF
 */
export function createHttpHeader(line: string, headers: http.IncomingHttpHeaders | http.OutgoingHttpHeaders): string {
  const clean = (v: unknown) => String(v).replace(/[\r\n]+/g, "");
  return (
    Object.keys(headers)
      .reduce(
        (head, key) => {
          const value = headers[key];
          const safeKey = clean(key);

          if (!Array.isArray(value)) {
            head.push(safeKey + ": " + clean(value));
            return head;
          }

          for (let i = 0; i < value.length; i++) {
            head.push(safeKey + ": " + clean(value[i]));
          }
          return head;
        },
        <string[]>[clean(line)]
      )
      .join("\r\n") + "\r\n\r\n"
  );
}

/**
 * Hop-by-hop headers (RFC 9110 section 7.6.1): they describe the client connection, not the request,
 * so they are never forwarded. `transfer-encoding` is kept: Node frames the piped body from it.
 */
export const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "upgrade"
];

/**
 * Client credentials, only forwarded when `forwardCredentials` is set
 */
export const CREDENTIAL_HEADERS = ["authorization", "cookie"];

/**
 * Copy a header map with every key lowercased, so a later header cannot sit beside another casing
 * @param headers - header map
 * @returns the same headers, keys lowercased
 */
export function lowercaseHeaders(headers: { [key: string]: any } = {}): { [key: string]: any } {
  const result: { [key: string]: any } = {};
  for (const key in headers) {
    result[key.toLowerCase()] = headers[key];
  }
  return result;
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
   *
   * Can be encrypted with `webda config encrypt` (when it holds credentials)
   */
  backend: string | SecretString;
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
   * Forward the client `Authorization` and `Cookie` headers to the backend
   *
   * They carry the caller's credentials for this application (session cookie, bearer token):
   * enable it only when the backend is trusted with them
   *
   * @default false
   */
  forwardCredentials: boolean;

  /**
   * Load parameters, normalize backend URL and set defaults
   * @param params - raw configuration values
   * @returns this instance for chaining
   */
  load(params?: any): this {
    super.load(params);
    // An encrypted backend is normalized when read, in getBackend
    if (typeof this.backend === "string" && this.backend.endsWith("/")) {
      this.backend = this.backend.substring(0, this.backend.length - 1);
    }
    this.proxyHeaders ??= true;
    this.forwardCredentials ??= false;
    return this;
  }
}

/**
 * Proxy to starling computation api
 *
 * @WebdaModda
 */
export class ProxyService<T extends ProxyParameters = ProxyParameters> extends Service<T> {
  static Parameters = ProxyParameters;
  /**
   * Metrics
   */
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
   * Register an HTTP upgrade listener for WebSocket proxying
   * @returns this instance for chaining
   */
  resolve() {
    // Register the proxy on the 'upgrade' event of http socket
    useCoreEvents("Webda.Init.Http" as any, (evt: any) => {
      evt.on("upgrade", (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
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
    const headers: http.OutgoingHttpHeaders = {};
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
    // statusCode is always set on a client response; fallback to Bad Gateway otherwise
    context.writeHead(response.statusCode ?? 502, this.filterHeaders(response.headers));
    response.pipe(await context.getOutputStream());
  }

  /**
   * Build request headers to forward, adding X-Forwarded-* if configured
   *
   * Keys are lowercased. Hop-by-hop headers (and those the client lists in `Connection`) are dropped,
   * and so are `Authorization` and `Cookie` unless `forwardCredentials` is set
   * @param context - the original HTTP context from the client
   * @returns header map to send to the backend including proxy headers
   */
  getRequestHeaders(context: HttpContext) {
    const headers: { [key: string]: any } = lowercaseHeaders(context.getHeaders());
    const connection = headers["connection"];
    const stripped = [
      ...HOP_BY_HOP_HEADERS,
      ...(this.parameters.forwardCredentials ? [] : CREDENTIAL_HEADERS),
      // Headers the client declared as hop-by-hop
      ...(Array.isArray(connection) ? connection.join(",") : (connection ?? ""))
        .split(",")
        .map((h: string) => h.trim().toLowerCase())
    ];
    for (const name of stripped) {
      delete headers[name];
    }
    if (this.parameters.proxyHeaders) {
      const existing = context.getHeader("x-forwarded-for");
      const previous = Array.isArray(existing) ? existing.join(", ") : existing;
      // Append the client to the chain built by upstream proxies, or start the chain
      const xff = previous ? `${previous}, ${context.getClientIp()}` : context.getClientIp();
      const protocol = context.getProtocol();
      const forwarded: Record<string, string | string[]> = {
        "X-Rewrite-URL": context.getRelativeUri(),
        // Keep the values set by an upstream proxy, they describe the original request
        "X-Forwarded-Host": context.getHeader("x-forwarded-host", `${context.getHost()}`),
        "X-Forwarded-Proto": context.getHeader("x-forwarded-proto", protocol.substring(0, protocol.length - 1)),
        "X-Forwarded-Port": context.getHeader("x-forwarded-port", `${context.getPortNumber()}`),
        "X-Forwarded-For": xff
      };
      Object.assign(headers, lowercaseHeaders(forwarded));
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
  onError(e: unknown) {
    this.log("ERROR", "Proxying error", e);
  }

  /**
   * Handle an HTTP upgrade request and proxy it as a WebSocket connection
   * @param req - raw HTTP incoming message from the upgrade event
   * @param socket - duplex socket from the upgrade event
   * @param head - first packet of the upgraded stream
   * @returns promise resolving when the WebSocket proxy is set up
   */
  async proxyWS(req: http.IncomingMessage, socket: Duplex, head: Buffer) {
    const prefix = this.parameters.url;
    if (prefix === undefined || !req.url?.startsWith(prefix)) {
      return;
    }
    if (req.method !== "GET" || !req.headers.upgrade) {
      socket.destroy();
      return;
    }

    if (req.headers.upgrade.toLowerCase() !== "websocket") {
      socket.destroy();
      return;
    }
    // Proxy WS Only works with a WebdaServer from @webda/shell for now
    const webdaContext = await (<any>useCore()).getContextFromRequest(req);
    await webdaContext.init();
    return this.rawProxyWS(webdaContext, `${this.getBackend(webdaContext)}${req.url.substring(prefix.length)}`, socket);
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
      // The upgrade headers are hop-by-hop: set them again for the backend connection
      headers: {
        ...this.getRequestHeaders(context.getHttpContext()),
        host: Url.host,
        connection: "Upgrade",
        upgrade: "websocket"
      },
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

    const onError = (err: Error) => {
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
      const onError = (e: unknown) => {
        this.metrics.http_request_in_flight.dec();
        this.metrics.http_errors.inc({ ...labels, statuscode: -1 });
        this.onError(e);
        resolve();
      };
      let Host: string | undefined;
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
            host: Host,
            // Lowercased so the headers given here replace the client ones
            ...lowercaseHeaders(headers)
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
            if (res.statusCode !== undefined && res.statusCode >= 400) {
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
  getBackend(_ctx: WebContext): string {
    const backend = SecretString.unwrap(this.parameters.backend) as string;
    return backend?.endsWith("/") ? backend.substring(0, backend.length - 1) : backend;
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
    await this.proxy(ctx, this.getBackend(ctx), this.parameters.url ?? "");
  }
}
