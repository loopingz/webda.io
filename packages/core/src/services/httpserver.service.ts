import { Service } from "./service.js";
import { InsufficientScope } from "./scopeauthorizer.js";
import { Command } from "./command.js";
import { WebContext } from "../contexts/webcontext.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Context, ContextProvider, ContextProviderInfo } from "../contexts/icontext.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { emitCoreEvent } from "../events/events.js";
import * as WebdaError from "../errors/errors.js";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createSecureServer, createServer as createHttp2Server, Http2SecureServer } from "node:http2";
import type { Http2Server } from "node:http2";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { AddressInfo, Socket } from "node:net";
import { createSubnetChecker } from "./subnetchecker.js";
import { traceRequest } from "./requesttracer.js";
import { useLog } from "@webda/workout";
import { CancelablePromise, State } from "@webda/utils";
import type { JSONed } from "@webda/models";
import { Writable } from "node:stream";
import { useRouter } from "../rest/hooks.js";
import { useCore } from "../core/hooks.js";
import { runWithContext } from "../contexts/execution.js";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { AsyncResource } from "node:async_hooks";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";
import type { TLSSocket } from "node:tls";
import {
  type ClientCertificate,
  type ClientCertificateHeaderFormat,
  parseClientCertificateHeader,
  toClientCertificate
} from "../contexts/clientcertificate.js";

/**
 * How long a connection to a TLS port may stay silent before it is dropped,
 * while it is not yet known whether it speaks TLS or plain HTTP
 */
const TLS_GATE_TIMEOUT = 30000;

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
   * When not set, the `PORT` environment variable is used (Knative, Cloud Run and most PaaS inject it),
   * then 18080. An explicit value always wins over the environment.
   *
   * @default 18080
   */
  port?: number;

  /**
   * Path of the readiness and liveness probe, disabled when unset
   *
   * Answered before the routing, without a context: `200 {"status":"ok"}` once Core is ready, `503` while
   * it is starting (`{"status":"starting"}`) or the server is draining (`{"status":"stopping"}`).
   * The `WEBDA_HEALTH_PATH` environment variable enables it when not configured: the Knative deployer sets
   * it for the readiness probe of its revisions.
   */
  healthPath?: string;

  /**
   * Milliseconds the server waits for its in-flight requests when it stops, before closing their connections
   *
   * Stopping first refuses new connections and answers `503` on `healthPath`, so a load balancer stops
   * routing to the instance. Keep it below the termination grace period of the pod (30s on Kubernetes).
   *
   * @default 10000
   */
  shutdownGracePeriod?: number;

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
   * CA file(s) used to verify client certificates — enables mTLS on the TLS port
   */
  clientCa?: string | string[];
  /**
   * Client certificate request on the TLS port: "none" does not ask for one, "optional" asks and accepts clients
   * without one or with an unverified one (see ClientCertificate.verified), "require" refuses the TLS handshake of
   * clients without a certificate signed by `clientCa`
   *
   * Defaults to "optional" when clientCa is set, "none" otherwise
   */
  clientAuth?: "none" | "optional" | "require";
  /**
   * Header carrying the client certificate verified by a reverse proxy, disabled when undefined
   *
   * Only accepted from `trustedProxies`: a request carrying it from another source is refused (400)
   *
   * @example "x-forwarded-tls-client-cert" (Traefik), "x-ssl-client-cert" (nginx), "x-forwarded-client-cert" (Envoy)
   */
  clientCertHeader?: string;
  /**
   * Format of `clientCertHeader`
   *
   * @default "traefik"
   */
  clientCertHeaderFormat?: ClientCertificateHeaderFormat;

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
    this.clientAuth ??= this.clientCa ? "optional" : "none";
    this.clientCertHeaderFormat ??= "traefik";
    this.healthPath ??= process.env.WEBDA_HEALTH_PATH || undefined;
    this.shutdownGracePeriod ??= 10000;
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
  /**
   * Resolvers of the pending serve() promises, settled when the service stops
   */
  protected serving: Set<() => void> = new Set();
  /**
   * Set while the server drains: it refuses new connections and answers 503 on the health path
   */
  protected draining = false;
  /**
   * Open HTTP/2 sessions, closed when the server drains (they have no closeAllConnections)
   */
  protected sessions: Set<{ close(): void; destroy(): void }> = new Set();
  /**
   * Requests being handled by the web pipeline: the drain waits for them, not for the streams
   * owned by the interceptors (gRPC) or kept open after their handler returned (SSE)
   */
  protected inflight = 0;
  /** In TLS mode, the server answering plain HTTP with a redirect */
  protected redirectServer?: Server;
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
    // One Set-Cookie header per cookie
    const setCookies = ctx.getSetCookieHeaders();

    if (this.isHttp2) {
      // HTTP/2: use setHeader individually, filter HTTP/1.1-only headers
      for (const [name, value] of Object.entries(headers)) {
        if (HTTP1_ONLY_HEADERS.includes(name.toLowerCase())) continue;
        res.setHeader(name, value as string | string[]);
      }
      if (setCookies.length) {
        res.setHeader("Set-Cookie", setCookies);
      }
      res.statusCode = ctx.getResponseCode();
    } else {
      // HTTP/1.1: use writeHead
      if (setCookies.length) {
        headers["Set-Cookie"] = setCookies;
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
    // Probes come first: they must not depend on the routing, the context or the authentication
    if (this.parameters.healthPath && req.url?.split("?")[0] === this.parameters.healthPath) {
      this.answerHealth(res);
      return;
    }
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
    this.inflight++;
    try {
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !k.startsWith(":")));
      const defaultScheme = this.isHttp2 ? "https" : "http";
      const forwarded = headers["x-forwarded-proto"];
      const proto = (
        typeof forwarded === "string" ? forwarded.split(",")[0].trim().toLowerCase() : undefined
      ) as string;
      const scheme: "http" | "https" =
        (proto === "http" || proto === "https") && this.isProxyTrusted(req.socket?.remoteAddress)
          ? proto
          : defaultScheme;
      let clientIp: string | undefined;
      try {
        clientIp = this.resolveClientIp(req);
      } catch (err) {
        useLog("WARN", "Cannot resolve the client address", err);
      }
      await traceRequest(
        {
          protocol: "http",
          method: req.method,
          path: (req.url ?? "").split("?")[0],
          scheme,
          protocolVersion: req.httpVersion,
          headers,
          clientIp
        },
        async handle => {
          await this.handleWebRequest(req, res);
          try {
            handle.setStatus(res.statusCode);
          } catch (err) {
            useLog("WARN", "Request tracer failed to record the status", err);
          }
        }
      );
    } finally {
      this.inflight--;
    }
  }

  /**
   * Run the web pipeline of a request: create the context, route, flush the response
   *
   * @param req - the incoming message
   * @param res - the server response
   */
  protected async handleWebRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
          emitCoreEvent("Webda.Request", { context: webCtx });
        } catch {
          /* listener error */
        }
        try {
          await useRouter().execute(webCtx);
        } catch (err) {
          webCtx.statusCode = err?.getResponseCode?.() || 500;
          // A Redirect carries its target: without the Location header the client only gets the JSON body
          if (err instanceof WebdaError.Redirect && err.location && !webCtx.hasFlushedHeaders?.()) {
            webCtx.setHeader("Location", err.location);
          }
          // RFC 6750: tell the client which scope the refused operation needs
          if (err instanceof InsufficientScope && !webCtx.hasFlushedHeaders?.()) {
            webCtx.setHeader("WWW-Authenticate", `Bearer error="insufficient_scope", scope="${err.operation}"`);
          }
          const method = webCtx.getHttpContext().getMethod();
          const url = webCtx.getHttpContext().getUrl();
          // Log 5xx at ERROR and 4xx at DEBUG so validation failures are still
          // visible during development but don't drown the normal log stream.
          if (webCtx.statusCode >= 500) {
            useLog("ERROR", `${method} ${url} → ${webCtx.statusCode}`, err);
          } else if (webCtx.statusCode >= 400) {
            useLog("WARN", `${method} ${url} → ${webCtx.statusCode}: ${err?.message ?? err}`);
          }
          // Stash the error on the context so listeners (e.g. debug capture)
          // can include it in the request log entry.
          webCtx.setExtension("error", err);
          // Write a body so the client actually sees the failure. For 4xx we
          // include the message + structured details (e.g. AJV errors[] from
          // input-schema validation). For 5xx we hide internal details.
          if (!webCtx.hasFlushedHeaders?.() && (webCtx.getOutput?.() ?? "") === "") {
            if (webCtx.statusCode >= 500) {
              webCtx.write({
                error: {
                  code: err?.code ?? "INTERNAL_SERVER_ERROR",
                  message: "Internal server error"
                }
              });
            } else {
              const body: any = {
                code: err?.code ?? "BAD_REQUEST",
                message: err?.message ?? String(err)
              };
              if (err?.details !== undefined) body.details = err.details;
              // RFC 6750 clients read the OAuth error object itself: `{ error, operation }`
              webCtx.write(err instanceof InsufficientScope ? err.details : { error: body });
            }
          }
        }
        // The SessionManager writes the session cookie: save the session before the headers are flushed
        await webCtx.saveSession();
        // Always emit the Result event — both success and error paths converge
        // here so that subscribers see every request reach a terminal state.
        try {
          emitCoreEvent("Webda.Result", { context: webCtx });
        } catch {
          /* listener error */
        }
      });
      // Flush response — skip if pipeline/streaming already handled it (a streamed response is ended by its
      // operation, or gone with its client)
      if (res.writableEnded || res.destroyed || (res as any).stream?.destroyed) {
        return;
      }
      if (!res.headersSent) {
        this.flush(webCtx);
      } else {
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
   * Serve HTTP until the service stops
   *
   * The returned promise stays pending while the server runs: it resolves when the
   * service stops, and cancelling it closes the server.
   * Use {@link start} to only wait for the server to listen.
   *
   * @param bind - the bind address
   * @param port - the port number
   * @returns a promise settled once the server is stopped
   */
  @Command("serve", { description: "Start the HTTP server", requires: ["router", "rest-domain"] })
  serve(bind?: string, port?: number): CancelablePromise<void> {
    return new CancelablePromise<void>(
      (resolve, reject) => {
        this.start(bind, port).then(() => {
          this.serving.add(resolve);
        }, reject);
      },
      async () => {
        await this.closeServer();
      }
    );
  }

  /**
   * Start the HTTP server
   * @param bind - the bind address
   * @param port - the port number
   * @returns a promise resolved once the server listens
   */
  async start(bind?: string, port?: number): Promise<void> {
    this.parameters.with(params => {
      // `??`, not `||`: port 0 asks the OS for a free port
      const listenPort = this.getListenPort(port);
      useLog("INFO", `Starting HTTP server on ${bind ?? "0.0.0.0"}:${listenPort}`);
      this.draining = false;

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
          allowHTTP1: true,
          ...this.getClientAuthOptions(params)
        };
        let tlsServer: Server | Http2SecureServer;
        if (params.http2 !== false) {
          this.isHttp2 = true;
          tlsServer = createSecureServer(tlsOptions, (req, res) => {
            if (req.headers[":authority"]) {
              const [host] = (req.headers[":authority"] as string).split(":");
              req.headers.host = host;
            }
            this.handleRequest(req as any, res as any);
          });
        } else {
          tlsServer = createHttpsServer(tlsOptions, (req, res) => this.handleRequest(req, res));
        }
        this.redirectPlainHttp(tlsServer);
        this.server = tlsServer;
      } else if (params.clientCa || (params.clientAuth ?? "none") !== "none") {
        throw new Error("clientCa/clientAuth require TLS: set key and cert (or autoTls)");
      } else if (params.h2c) {
        // Prior-knowledge HTTP/2 cleartext — for gRPC clients without TLS.
        this.isHttp2 = true;
        this.server = createHttp2Server((req, res) => this.handleRequest(req as any, res as any));
      } else {
        // Plain HTTP/1.1
        this.server = createServer((req, res) => this.handleRequest(req, res));
      }

      if (this.isHttp2) {
        this.trackSessions(this.server as Http2Server);
      }

      // Ensure routes are mapped before accepting requests
      useRouter().remapRoutes();
      this.server.listen(listenPort, bind);
      if (params.key && params.cert) {
        useLog("INFO", `Serving https://${bind ?? "localhost"}:${listenPort} (http:// redirects to https)`);
      }

      // Emit on both channels: core event for decoupled listeners (gRPC
      // interceptor, graphql ws handler) and the service-level event for
      // anyone still listening via `this.on(...)`.
      this.emit("Webda.Init.Http" as any, this.server as any);
      emitCoreEvent("Webda.Init.Http" as any, this.server as any);
    });

    // Set up trusted proxy checker
    this.parameters.with(params => {
      this.subnetChecker = createSubnetChecker(params.trustedProxies);
    });

    const server = this.server;
    if (!server.listening) {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          server.off("listening", onListening);
          reject(err);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("listening", onListening);
        server.once("error", onError);
      });
    }
  }

  /**
   * TLS options requesting and verifying client certificates
   * @param params - the server parameters
   * @returns the options to merge in the TLS server options
   * @throws Error when a client certificate is requested without CA to verify it
   */
  protected getClientAuthOptions(params: HttpServerParameters): {
    ca?: Buffer[];
    requestCert?: boolean;
    rejectUnauthorized?: boolean;
  } {
    const clientAuth = params.clientAuth ?? (params.clientCa ? "optional" : "none");
    if (clientAuth === "none") {
      return {};
    }
    if (!params.clientCa) {
      throw new Error(`clientAuth "${clientAuth}" requires clientCa`);
    }
    const files = Array.isArray(params.clientCa) ? params.clientCa : [params.clientCa];
    return {
      ca: files.map(file => readFileSync(file)),
      requestCert: true,
      rejectUnauthorized: clientAuth === "require"
    };
  }

  /**
   * Client certificate of a request: forwarded by a trusted proxy in `clientCertHeader`, or presented on the TLS
   * socket
   *
   * With `clientCertHeader`, a request from a trusted proxy only uses the header: the socket certificate is the
   * proxy's own (re-encrypted backend connection), never the client's
   * @param req - the incoming message
   * @returns the certificate, undefined when none was presented
   * @throws WebdaError.BadRequest when `clientCertHeader` comes from a source that is not a trusted proxy
   */
  extractClientCertificate(req: IncomingMessage): ClientCertificate | undefined {
    const header = this.parameters.clientCertHeader?.toLowerCase();
    const forwarded = header ? req.headers[header] : undefined;
    const trusted = header ? this.isProxyTrusted(req.socket?.remoteAddress) : false;
    if (forwarded !== undefined) {
      if (!trusted) {
        this.log("WARN", `${header} header set from an unknown source: ${req.socket?.remoteAddress}`);
        throw new WebdaError.BadRequest(`${header} header set from an unknown source`);
      }
      const value = Array.isArray(forwarded) ? forwarded[forwarded.length - 1] : forwarded;
      try {
        const x509 = parseClientCertificateHeader(value, this.parameters.clientCertHeaderFormat);
        return x509 ? toClientCertificate(x509, true, "proxy") : undefined;
      } catch (err) {
        this.log("WARN", `Cannot parse the client certificate of ${header}`, err?.message);
        return undefined;
      }
    }
    if (trusted) {
      return undefined;
    }
    const socket = req.socket as TLSSocket;
    if (typeof socket?.getPeerCertificate !== "function") {
      return undefined;
    }
    const peer = socket.getPeerCertificate(false);
    if (!peer?.raw) {
      return undefined;
    }
    return toClientCertificate(new X509Certificate(peer.raw), socket.authorized === true, "tls");
  }

  /**
   * Port to listen on: the argument, then the `port` parameter, then the `PORT` environment variable, then 18080
   * @param port - the port from the command line
   * @returns the port
   */
  getListenPort(port?: number): number {
    // `??`, not `||`: port 0 asks the OS for a free port
    const envPort = /^\d+$/.test(process.env.PORT ?? "") ? parseInt(process.env.PORT) : undefined;
    return port ?? this.parameters.port ?? envPort ?? 18080;
  }

  /**
   * Readiness of the application: `ok` once Core is ready, `starting` before, `stopping` while the server drains
   * @returns the status
   */
  getHealthStatus(): "ok" | "starting" | "stopping" {
    if (this.draining) {
      return "stopping";
    }
    return State.getCurrentState(useCore()) === "ready" ? "ok" : "starting";
  }

  /**
   * Answer a readiness or liveness probe: 200 when the application is ready, 503 otherwise
   * @param res - the response
   */
  protected answerHealth(res: ServerResponse): void {
    const status = this.getHealthStatus();
    res.writeHead(status === "ok" ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ status }));
  }

  /**
   * Keep track of the HTTP/2 sessions of a server, to close them when it drains
   * @param server - the HTTP/2 server
   */
  protected trackSessions(server: Http2Server): void {
    server.on("session", session => {
      this.sessions.add(session);
      session.on("close", () => this.sessions.delete(session));
    });
  }

  /**
   * Close the HTTP server: refuse new connections, wait for the in-flight requests up to
   * `shutdownGracePeriod`, then close every connection
   *
   * Only the requests in the web pipeline hold the drain: the long-lived streams (gRPC through an
   * interceptor, SSE kept open after the handler returned, idle keep-alive connections) are closed as
   * soon as those requests are answered, so a stop never waits for a stream that would not end.
   * @returns a promise resolved once the server is closed
   */
  protected async closeServer(): Promise<void> {
    this.draining = true;
    // Its connections never reach `server`: close them too (clients keep them alive)
    this.redirectServer?.closeAllConnections();
    const server = this.server as Server;
    if (!server?.listening) {
      return;
    }
    // Stop accepting connections, tell the HTTP/2 clients to open no more streams
    const closed = new Promise<void>(resolve => server.close(() => resolve()));
    server.closeIdleConnections?.();
    this.sessions.forEach(session => session.close());
    const deadline = Date.now() + this.parameters.shutdownGracePeriod;
    while (this.inflight > 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (this.inflight > 0) {
      useLog(
        "WARN",
        `Closing ${this.inflight} requests still in flight after ${this.parameters.shutdownGracePeriod}ms`
      );
    }
    server.closeAllConnections?.();
    this.sessions.forEach(session => session.destroy());
    // A TLS HTTP/2 server has no closeAllConnections for its HTTP/1 connections: do not wait for them forever
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000).unref())]);
  }

  /**
   * Address the server is listening on, or null before it listens
   * @returns the bound address
   */
  address() {
    return this.server?.address() ?? null;
  }

  /**
   * Accept plain HTTP on a TLS port. TLS handshakes go to the TLS server as
   * before; anything else gets a 308 redirect to the same URL over https,
   * where a browser typing `localhost:<port>` would otherwise get an empty
   * response.
   *
   * Node's TLS server wraps each accepted socket in its single `connection`
   * listener; that listener is wrapped so the server keeps owning the port
   * (`listening`, `address()` and the `Webda.Init.Http` hooks are unchanged).
   * @param tlsServer - the TLS server handling the application
   */
  protected redirectPlainHttp(tlsServer: Server | Http2SecureServer): void {
    const listeners = tlsServer.listeners("connection");
    if (listeners.length !== 1) {
      useLog("WARN", "Cannot redirect plain HTTP to https on this Node.js version");
      return;
    }
    const handshake = listeners[0] as (socket: Socket) => void;
    const redirect = (this.redirectServer = createServer((req, res) => {
      res.writeHead(308, { Location: `https://${req.headers.host ?? "localhost"}${req.url ?? "/"}` });
      res.end();
    }));
    tlsServer.removeListener("connection", handshake);
    tlsServer.on("connection", (socket: Socket) => {
      // Until the first bytes arrive, nobody else owns the socket
      const drop = () => socket.destroy();
      socket.on("error", drop);
      socket.setTimeout(TLS_GATE_TIMEOUT, drop);
      // Hand the socket over in this callback's async context, as the TLS
      // server would have: request handling needs Webda's instance storage
      socket.once(
        "data",
        AsyncResource.bind((chunk: Buffer) => {
          socket.off("error", drop);
          socket.setTimeout(0);
          socket.pause();
          socket.unshift(chunk);
          // 0x16 opens a TLS handshake record
          if (chunk[0] === 0x16) {
            handshake.call(tlsServer, socket);
          } else {
            redirect.emit("connection", socket);
          }
          process.nextTick(() => socket.resume());
        })
      );
    });
  }

  /** @override */
  async stop(): Promise<void> {
    await super.stop();
    await this.closeServer();
    // Settle the pending serve() promises
    for (const resolve of this.serving) {
      resolve();
    }
    this.serving.clear();
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
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-keyout",
          key,
          "-out",
          cert,
          "-days",
          "365",
          "-nodes",
          "-subj",
          "/CN=localhost",
          "-addext",
          "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:0.0.0.0"
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

    let clientCertificate: ClientCertificate | undefined;
    try {
      clientCertificate = this.extractClientCertificate(req);
    } catch (err) {
      if (err instanceof WebdaError.BadRequest) {
        res?.writeHead(400);
        return;
      }
      throw err;
    }

    const httpContext = new HttpContext(vhost, <HttpMethodType>req.method, req.url, protocol, port, headers as any);
    httpContext.setClientIp(httpContext.getUniqueHeader("x-forwarded-for", req.socket?.remoteAddress));
    httpContext.setClientCertificate(clientCertificate);

    if (["PUT", "PATCH", "POST", "DELETE"].includes(req.method)) {
      httpContext.setBody(req);
    }
    return this.newContext({ http: httpContext, stream: <Writable>res });
  }

  /**
   * Resolve the address of the client of a request
   *
   * The `X-Forwarded-For` header is walked from the right, skipping the trusted proxies, and only read when the
   * socket peer is itself a trusted proxy. When every hop is trusted, the leftmost one is returned.
   * @param req - the incoming message
   * @returns the client address, undefined when unknown
   */
  resolveClientIp(req: IncomingMessage): string | undefined {
    const peer = req.socket?.remoteAddress;
    const header = req.headers["x-forwarded-for"];
    if (!header || !this.isProxyTrusted(peer)) {
      return peer;
    }
    const hops = (Array.isArray(header) ? header.join(",") : header)
      .split(",")
      .map(h => h.trim())
      .filter(h => h !== "");
    for (let i = hops.length - 1; i >= 0; i--) {
      if (!this.isProxyTrusted(hops[i])) return hops[i];
    }
    return hops[0] ?? peer;
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
