import { Service } from "./service.js";
import { Command } from "./command.js";
import { WebContext } from "../contexts/webcontext.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Context, ContextProvider, ContextProviderInfo } from "../contexts/icontext.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { emitCoreEvent } from "../events/events.js";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createSecureServer, createServer as createHttp2Server, Http2SecureServer } from "node:http2";
import type { Http2Server } from "node:http2";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { AddressInfo } from "node:net";
import { createChecker } from "is-in-subnet";
import { useLog } from "@webda/workout";
import type { JSONed } from "@webda/models";
import { Writable } from "node:stream";
import { useRouter } from "../rest/hooks.js";
import { runWithContext } from "../contexts/execution.js";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { serialize as cookieSerialize } from "cookie";

/** Parameters for the HTTP server including request limits, timeouts, TLS, and proxy settings */
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
   * Run this instance as an HTTP/2 cleartext (h2c) server rather than
   * HTTP/1.1. The resulting port accepts only prior-knowledge HTTP/2
   * clients (e.g. `grpcurl -plaintext`). To serve both REST (HTTP/1.1)
   * and gRPC without TLS, configure a second HttpServer service with
   * `h2c: true` on a separate port.
   * @default false
   */
  h2c?: boolean;

  /**
   * TLS key file path — enables HTTPS or HTTP/2
   */
  key?: string;
  /**
   * TLS certificate file path
   */
  cert?: string;
  /**
   * Enable HTTP/2 (default: true when key+cert provided)
   * Set to false for HTTPS without HTTP/2
   */
  http2?: boolean;

  /**
   * Auto-generate a self-signed certificate on startup when `key`/`cert`
   * aren't configured. Dev convenience: gives the main port HTTP/2 via
   * ALPN (plus HTTP/1.1 fallback) with zero setup. Keys are written under
   * `.webda/dev-tls/`.
   *
   * @default false
   */
  autoTls?: boolean;

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
  /** Emitted when new result is sent */
  "Webda.Result": { context: WebContext };
  /** Emitted when new request comes in */
  "Webda.Request": { context: WebContext };
  /** Emitted when a request does not match any route */
  "Webda.404": { context: WebContext };
  /** Sent when route is added to context */
  "Webda.UpdateContextRoute": { context: WebContext };
};

/** HTTP/1.1-only headers that must be filtered for HTTP/2 */
const HTTP1_ONLY_HEADERS = ["keep-alive", "connection", "transfer-encoding"];

/**
 * HTTP server service supporting HTTP/1.1, HTTPS, and HTTP/2
 *
 * @WebdaModda
 */
export class HttpServer<
  P extends HttpServerParameters = HttpServerParameters,
  E extends HttpServerEvents = HttpServerEvents
> extends Service<P, E> {
  /** Registered context providers */
  private contextProviders: ContextProvider[] = [
    {
      getContext: (info: ContextProviderInfo) => {
        if (info.http) {
          return new WebContext(info.http, info.stream);
        }
        return new OperationContext(info.stream);
      }
    }
  ];
  server: Server | Http2SecureServer | Http2Server;
  protected subnetChecker: (address: string) => boolean;
  /** Whether this server uses HTTP/2 */
  protected isHttp2 = false;
  /**
   * Extra request handlers — matched first, before the default web request
   * pipeline. Used to plug in alternate wire protocols (gRPC) that share the
   * same port. Each interceptor returns true when it handles the request.
   */
  private interceptors: Array<(req: IncomingMessage, res: ServerResponse) => boolean> = [];

  /**
   * Register an additional low-level request handler. Interceptors are
   * checked in registration order; the first one that returns true short-
   * circuits the default pipeline. Typical use: gRPC dispatcher that matches
   * `content-type: application/grpc`.
   * @param handler - returns true when it has taken ownership of the request
   */
  registerRequestInterceptor(handler: (req: IncomingMessage, res: ServerResponse) => boolean): void {
    this.interceptors.push(handler);
  }

  /**
   * Flush response headers from WebContext to the underlying response stream.
   * Handles both HTTP/1.1 (writeHead) and HTTP/2 (setHeader + statusCode) patterns.
   *
   * @param ctx - the web context with stored headers
   */
  flushHeaders(ctx: WebContext): void {
    const res = ctx._stream as ServerResponse;
    if (res.headersSent) return;

    const headers = ctx.getResponseHeaders();
    const cookies = ctx.getResponseCookies?.() || {};

    if (this.isHttp2) {
      // HTTP/2: use setHeader individually, filter HTTP/1.1-only headers
      for (const [name, value] of Object.entries(headers)) {
        if (HTTP1_ONLY_HEADERS.includes(name.toLowerCase())) continue;
        res.setHeader(name, value as string | string[]);
      }
      for (const i in cookies) {
        res.setHeader("Set-Cookie", cookieSerialize(cookies[i].name, cookies[i].value, cookies[i].options));
      }
      res.statusCode = ctx.getResponseCode();
    } else {
      // HTTP/1.1: use writeHead
      for (const i in cookies) {
        headers["Set-Cookie"] = cookieSerialize(cookies[i].name, cookies[i].value, cookies[i].options);
      }
      res.writeHead(ctx.getResponseCode(), headers);
    }
  }

  /**
   * Flush the response body and close the response.
   *
   * @param ctx - the web context with buffered output
   */
  flush(ctx: WebContext): void {
    const res = ctx._stream as ServerResponse;
    if (res.writableEnded) return;
    this.flushHeaders(ctx);
    res.end(ctx.getOutput() || "");
  }

  /**
   * Handle an incoming HTTP request: create context, route, flush response.
   *
   * @param req - the incoming message
   * @param res - the server response
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Alternate protocols (e.g. gRPC) get first crack at the request — they
    // return true to claim it, otherwise we fall through to the normal web
    // pipeline.
    for (const interceptor of this.interceptors) {
      try {
        if (interceptor(req, res)) return;
      } catch (err) {
        useLog("ERROR", "Request interceptor failed", err);
      }
    }
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
          try { emitCoreEvent("Webda.Request", { context: webCtx }); } catch { /* listener error */ }
          await useRouter().execute(webCtx);
          try { emitCoreEvent("Webda.Result", { context: webCtx }); } catch { /* listener error */ }
        } catch (err) {
          webCtx.statusCode = err?.getResponseCode?.() || 500;
          const method = webCtx.getHttpContext().getMethod();
          const url = webCtx.getHttpContext().getUrl();
          // Log 5xx at ERROR and 4xx at DEBUG so validation failures are still
          // visible during development but don't drown the normal log stream.
          if (webCtx.statusCode >= 500) {
            useLog("ERROR", `${method} ${url} → ${webCtx.statusCode}`, err);
          } else if (webCtx.statusCode >= 400) {
            useLog("WARN", `${method} ${url} → ${webCtx.statusCode}: ${err?.message ?? err}`);
          }
        }
      });
      // Flush response — skip if pipeline/streaming already handled it
      if (!res.writableEnded && !res.headersSent) {
        this.flush(webCtx);
      } else if (!res.writableEnded) {
        // Headers sent (by flushHeaders in pipeline path) but body not ended
        res.end(webCtx.getOutput() || "");
      }
    } catch (err) {
      useLog("ERROR", "Unhandled error in HTTP request handler", err);
      if (!res.writableEnded) {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }
    }
  }

  /**
   * Start the HTTP server
   * @param bind - the bind address
   * @param port - the port number
   */
  @Command("serve", { description: "Start the HTTP server", requires: ["router", "rest-domain"] })
  async serve(bind?: string, port?: number) {
    this.parameters.with(params => {
      const listenPort = port || params.port || 18080;
      useLog("INFO", `Starting HTTP server on ${bind ?? "0.0.0.0"}:${listenPort}`);

      // Node.js pipeline() emits ERR_STREAM_PREMATURE_CLOSE as uncaughtException
      // when piping to ServerResponse. Suppress this specific error.
      if (!process.listeners("uncaughtExceptionMonitor").find((l: any) => l._webda)) {
        const monitor = function _webdaMonitor() {};
        (monitor as any)._webda = true;
        process.on("uncaughtExceptionMonitor", monitor);
      }
      if (!process.listeners("uncaughtException").find((l: any) => l._webda)) {
        const handler = function _webdaHandler(err: any) {
          if (err?.code === "ERR_STREAM_PREMATURE_CLOSE") return;
          useLog("ERROR", "Uncaught exception", err);
          process.exit(1);
        };
        (handler as any)._webda = true;
        process.on("uncaughtException", handler);
      }


      if (this.server) {
        this.server.close();
      }

      // Auto-generate a dev self-signed cert when autoTls is on and nothing is
      // already configured — gives the port HTTP/2 via ALPN for free.
      if (params.autoTls && !(params.key && params.cert)) {
        const { key, cert } = this.ensureDevTlsCert();
        params.key = key;
        params.cert = cert;
      }

      // Create server based on configuration. The same HttpServer class runs
      // in three modes — one instance per mode, one port per instance. Mix
      // modes by configuring multiple HttpServer services (e.g. a TLS one
      // for REST/GraphQL and a second h2c one for gRPC without TLS).
      if (params.key && params.cert) {
        // TLS — HTTP/2 via ALPN with HTTP/1.1 fallback (or plain HTTPS).
        const tlsOptions = {
          key: readFileSync(params.key),
          cert: readFileSync(params.cert),
          allowHTTP1: true
        };
        if (params.http2 !== false) {
          this.isHttp2 = true;
          this.server = createSecureServer(tlsOptions, (req, res) => {
            if (req.headers[":authority"]) {
              const [host] = (req.headers[":authority"] as string).split(":");
              req.headers.host = host;
            }
            this.handleRequest(req as any, res as any);
          });
        } else {
          this.server = createHttpsServer(tlsOptions, (req, res) => this.handleRequest(req, res));
        }
      } else if (params.h2c) {
        // Prior-knowledge HTTP/2 cleartext — for gRPC clients without TLS.
        this.isHttp2 = true;
        this.server = createHttp2Server((req, res) => this.handleRequest(req as any, res as any));
      } else {
        // Plain HTTP/1.1
        this.server = createServer((req, res) => this.handleRequest(req, res));
      }

      // Ensure routes are mapped before accepting requests
      useRouter().remapRoutes();
      this.server.listen(listenPort, bind);

      // Emit on both channels: core event for decoupled listeners (gRPC
      // interceptor, graphql ws handler) and the service-level event for
      // anyone still listening via `this.on(...)`.
      this.emit("Webda.Init.Http" as any, this.server as any);
      emitCoreEvent("Webda.Init.Http" as any, this.server as any);
    });

    // Set up trusted proxy checker
    this.parameters.with(params => {
      this.subnetChecker = createChecker(
        params.trustedProxies.map(n => (n.indexOf("/") < 0 ? `${n.trim()}/32` : n.trim()))
      );
    });
  }

  /** @override */
  async stop(): Promise<void> {
    await super.stop();
    this.server?.close();
  }

  /**
   * Ensure a self-signed TLS key+cert exists under `.webda/dev-tls/` and
   * return their paths. Used by {@link HttpServerParameters.autoTls} to bring
   * up HTTPS/HTTP2 on the dev server with zero setup. Dev-only — real
   * deploys should supply a proper cert via `key`/`cert` params.
   *
   * @returns absolute paths to the generated key and cert files
   */
  protected ensureDevTlsCert(): { key: string; cert: string } {
    const dir = join(process.cwd(), ".webda", "dev-tls");
    const key = join(dir, "key.pem");
    const cert = join(dir, "cert.pem");
    if (existsSync(key) && existsSync(cert)) {
      return { key, cert };
    }
    mkdirSync(dir, { recursive: true });
    // SAN on localhost/127.0.0.1 so browsers and grpcurl skip hostname
    // complaints when -k / -insecure is used.
    try {
      execFileSync(
        "openssl",
        [
          "req", "-x509", "-newkey", "rsa:2048",
          "-keyout", key,
          "-out", cert,
          "-days", "365",
          "-nodes",
          "-subj", "/CN=localhost",
          "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:0.0.0.0"
        ],
        { stdio: "pipe" }
      );
    } catch (err) {
      throw new Error(`autoTls: failed to generate self-signed cert via openssl — ${err}`);
    }
    this.log("INFO", `generated self-signed dev cert at ${dir}`);
    return { key, cert };
  }

  /**
   * Create a WebContext from an HTTP request
   * @param req - the incoming message
   * @param res - the server response
   * @returns the context, or undefined if request should be rejected
   */
  async getContextFromRequest(req: IncomingMessage, res?: ServerResponse) {
    let vhost: string = req.headers.host?.match(/:/g)
      ? req.headers.host.slice(0, req.headers.host.indexOf(":"))
      : req.headers.host || "localhost";

    if (
      (req.headers["x-forwarded-for"] ||
        req.headers["x-forwarded-host"] ||
        req.headers["x-forwarded-proto"] ||
        req.headers["x-forwarded-port"]) &&
      !this.isProxyTrusted(req.socket?.remoteAddress)
    ) {
      this.log("WARN", `X-Forwarded-* headers set from an unknown source: ${req.socket?.remoteAddress}`);
      res?.writeHead(400);
      return;
    }

    if (req.headers["x-forwarded-host"] !== undefined) {
      vhost = <string>req.headers["x-forwarded-host"];
    }
    let protocol: "http" | "https" = this.isHttp2 ? "https" : "http";
    if (req.headers["x-forwarded-proto"] !== undefined) {
      protocol = <"http" | "https">req.headers["x-forwarded-proto"];
    }

    let port;
    if (req.socket && req.socket.address()) {
      port = (<AddressInfo>req.socket.address()).port;
    }
    if (req.headers["x-forwarded-port"] !== undefined) {
      port = parseInt(<string>req.headers["x-forwarded-port"]);
    } else if (req.headers["x-forwarded-proto"] !== undefined) {
      port = protocol === "http" ? 80 : 443;
    }

    // Filter HTTP/2 pseudo-headers from the headers object
    const headers = this.isHttp2
      ? Object.fromEntries(Object.entries(req.headers).filter(([k]) => !k.startsWith(":")))
      : req.headers;

    const httpContext = new HttpContext(vhost, <HttpMethodType>req.method, req.url, protocol, port, headers as any);
    httpContext.setClientIp(httpContext.getUniqueHeader("x-forwarded-for", req.socket?.remoteAddress));

    if (["PUT", "PATCH", "POST", "DELETE"].includes(req.method)) {
      httpContext.setBody(req);
    }
    return this.newContext({ http: httpContext, stream: <Writable>res });
  }

  /**
   * Check if a proxy is a trusted proxy
   * @param ip - the IP address
   * @returns true if the proxy is trusted
   */
  isProxyTrusted(ip: string): boolean {
    return this.subnetChecker?.(ip) ?? false;
  }

  /**
   * Create a context from provider info
   * @param info - the context provider info
   * @param noInit - skip initialization
   * @returns the created context
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
   * Register a new context provider (prepended, higher priority)
   * @param provider - the context provider
   */
  registerContextProvider(provider: ContextProvider) {
    this.contextProviders ??= [];
    this.contextProviders.unshift(provider);
  }
}

