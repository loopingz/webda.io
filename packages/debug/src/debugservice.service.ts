import { Service, ServiceParameters, useDynamicService, useCoreEvents, useRouter, useApplication } from "@webda/core";
import { Command } from "@webda/core";
import { createServer, IncomingMessage, ServerResponse, Server } from "node:http";
import type { Duplex } from "node:stream";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {
  DEBUG_API_VERSION,
  WS_PROTOCOL,
  buildDebugUrl,
  extractBearerToken,
  extractWsToken,
  generateToken,
  injectToken,
  isAllowedHost,
  isAllowedOrigin,
  openInBrowser,
  resolveTelemetry,
  safeEqual
} from "./security.js";
import { RequestLog, type RequestLogDetails, type RequestLogError } from "./requestlog.js";
import { LogBuffer } from "./logbuffer.js";
import { captureBody, normalizeHeaders } from "./bodycapture.js";
import { getModels, getModel, getServices, getOperations, getRoutes, getConfig, getAppInfo } from "./introspection.js";
import { DebugTui } from "./tui/tui.js";
import { CancelablePromise } from "@webda/utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBUI_DIR = join(__dirname, "..", "webui");

export { isAllowedOrigin, DEBUG_API_VERSION } from "./security.js";

/**
 * Version of this package, read once from its package.json.
 * @returns the version string, or "unknown" when the file cannot be read
 */
function readDebugVersion(): string {
  try {
    return JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).version || "unknown";
  } catch {
    return "unknown";
  }
}

const DEBUG_VERSION = readDebugVersion();

/**
 * Version of the framework the application runs on.
 * @returns the `@webda/core` version, or `undefined` when unavailable
 */
function frameworkVersion(): string | undefined {
  try {
    return useApplication().getWebdaVersion();
  } catch {
    return undefined;
  }
}

/** Map file extensions to MIME types for static file serving. */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

/**
 * Configuration parameters for the {@link DebugService}.
 *
 * All capture knobs default to safe values — capture is enabled with a
 * 64 KB inline body limit and a 4-byte hex preview for binary payloads.
 */
export class DebugServiceParameters extends ServiceParameters {
  /**
   * Whether to capture request/response headers and bodies for the debug UI.
   * If `false`, only status code and duration are recorded.
   */
  captureRequests: boolean = true;
  /**
   * Maximum number of bytes to keep inline for text bodies. Larger payloads
   * are truncated to this size and reported as `text-truncated`.
   */
  captureBodyLimit: number = 65536;
  /**
   * Number of leading bytes to include in the hex preview for binary bodies.
   */
  captureBinaryPreview: number = 4;
}

/**
 * Debug dashboard service that provides an HTTP API for introspection
 * and a WebSocket feed of live request events.
 *
 * @WebdaModda
 */
export class DebugService extends Service<DebugServiceParameters> {
  static Parameters = DebugServiceParameters;
  /** Ring buffer of recent HTTP requests */
  requestLog: RequestLog = new RequestLog();
  /** Ring buffer of application log entries */
  private logBuffer: LogBuffer = new LogBuffer();
  /** HTTP server for the debug API */
  private server?: Server;
  /** WebSocket server for live event push */
  private wss?: WebSocketServer;
  /** Connected WebSocket clients */
  private clients: Set<WebSocket> = new Set();
  /** Unsubscribe functions for core event listeners */
  private unsubscribers: (() => void)[] = [];
  /** Terminal UI of the running debug command */
  private tui?: DebugTui;
  /** Settle the running debug command */
  private running?: () => void;
  /** Timing map: requestId -> start timestamp */
  private timings: Map<string, number> = new Map();
  /** Per-session token required on the API and the websocket */
  private token: string = generateToken();
  /** Port the debug server actually listens on (resolved after listen) */
  private listeningPort: number = 0;
  /** URL opened by the last `debug --web` run */
  private dashboardUrl?: string;

  /**
   * Session token required on every `/api/*` request and websocket connection.
   *
   * It is generated when the service is created and never logged.
   * @returns the token
   */
  getToken(): string {
    return this.token;
  }

  /**
   * Resolve the typed parameters and the capture knobs (with safe defaults
   * when the surrounding test environment does not load real parameters).
   *
   * @returns The effective `{ captureRequests, captureBodyLimit, captureBinaryPreview }` triple.
   */
  private getCaptureSettings(): { captureRequests: boolean; bodyLimit: number; binaryPreview: number } {
    const params = (this.parameters || {}) as Partial<DebugServiceParameters>;
    return {
      captureRequests: params.captureRequests !== false,
      bodyLimit: typeof params.captureBodyLimit === "number" ? params.captureBodyLimit : 65536,
      binaryPreview: typeof params.captureBinaryPreview === "number" ? params.captureBinaryPreview : 4
    };
  }

  /**
   * Subscribe to core events to populate the request log.
   * @returns this for chaining
   */
  resolve() {
    super.resolve();
    this.subscribeToEvents();
    return this;
  }

  /**
   * Wire up core event listeners for request tracking.
   */
  private subscribeToEvents(): void {
    this.unsubscribers.push(
      useCoreEvents("Webda.Request", evt => {
        const id = Math.random().toString(36).substring(2);
        const ctx = evt.context;
        ctx.setExtension("debugRequestId", id);
        const http = ctx.getHttpContext?.();
        const method = http?.getMethod?.() ?? "UNKNOWN";
        const url = http?.getUrl?.() ?? "/";
        this.timings.set(id, Date.now());
        this.requestLog.startRequest(id, method, url);
      })
    );

    this.unsubscribers.push(
      useCoreEvents("Webda.Result", async evt => {
        const ctx = evt.context;
        const id = ctx.getExtension<string>("debugRequestId");
        if (!id) return;
        const start = this.timings.get(id);
        const duration = start ? Date.now() - start : 0;
        this.timings.delete(id);
        const statusCode = ctx.statusCode ?? 200;

        // Capture headers/bodies first so that `attachDetails` runs before
        // `completeRequest` notifies subscribers — this keeps the UI's view
        // of "the entry that just got a status code" consistent with the
        // captured body.
        const details = await this.collectDetails(ctx);
        if (details) {
          this.requestLog.attachDetails(id, details);
        }

        this.requestLog.completeRequest(id, statusCode, duration);
      })
    );

    this.unsubscribers.push(
      useCoreEvents("Webda.404", async evt => {
        const ctx = evt.context;
        const id = ctx.getExtension<string>("debugRequestId");
        if (!id) return;
        this.timings.delete(id);

        // Even on 404 we can capture the request side (and any response
        // headers Webda may have set) so the UI can show what was asked.
        const details = await this.collectDetails(ctx);
        if (details) {
          this.requestLog.attachDetails(id, details);
        }

        this.requestLog.markNotFound(id);
      })
    );

    // Forward request log events to WebSocket clients
    this.requestLog.onEvent(event => {
      this.broadcast(event);
    });

    // Capture application logs and forward to WebSocket clients
    this.logBuffer.subscribe();
    this.logBuffer.onEvent(event => {
      this.broadcast(event);
    });
  }

  /**
   * Collect headers, bodies, and any error from a finished context.
   *
   * Returns `undefined` if capture is disabled via configuration. Resolves
   * once both request body (read via the HttpContext, which caches its
   * Buffer after the first read) and response body (read from the
   * WebContext's buffered output stream) have been captured. Failures
   * during capture (e.g. a body that can't be read or that times out) are
   * swallowed so the debug service never breaks the request itself.
   *
   * @param ctx - The finished web context.
   * @returns A {@link RequestLogDetails} payload, or `undefined` when capture is off.
   */
  private async collectDetails(ctx: any): Promise<RequestLogDetails | undefined> {
    const settings = this.getCaptureSettings();
    if (!settings.captureRequests) return undefined;

    const details: RequestLogDetails = {};

    // ----- Request headers + body -------------------------------------------
    try {
      const http = ctx.getHttpContext?.();
      if (http) {
        if (typeof http.getHeaders === "function") {
          details.requestHeaders = normalizeHeaders(http.getHeaders());
        }
        // Webda's HttpContext caches the raw body Buffer the first time it
        // is read, so awaiting getRawBody here is safe whether or not a
        // route handler already consumed the stream. We cap at the body
        // limit to avoid pulling huge uploads back into memory just for
        // the debug log.
        let buf: Buffer | undefined;
        try {
          if (typeof http.getRawBody === "function") {
            const result = await http.getRawBody(settings.bodyLimit);
            buf = result ?? Buffer.alloc(0);
          } else if (typeof ctx.getRawInput === "function") {
            const result = await ctx.getRawInput(settings.bodyLimit);
            buf = result ?? Buffer.alloc(0);
          }
        } catch {
          buf = undefined;
        }
        const reqContentType =
          typeof http.getUniqueHeader === "function" ? http.getUniqueHeader("content-type") : undefined;
        if (buf !== undefined) {
          details.requestBody = captureBody(buf, reqContentType, settings.bodyLimit, settings.binaryPreview);
        }
      }
    } catch {
      /* ignore — request capture is best-effort */
    }

    // ----- Response headers + body ------------------------------------------
    try {
      const responseHeaders = typeof ctx.getResponseHeaders === "function" ? ctx.getResponseHeaders() : {};
      details.responseHeaders = normalizeHeaders(responseHeaders);

      let respBuf: Buffer | undefined;
      try {
        if (typeof ctx.getResponseBody === "function") {
          const body = ctx.getResponseBody();
          if (body === undefined || body === null) {
            respBuf = Buffer.alloc(0);
          } else if (Buffer.isBuffer(body)) {
            respBuf = body;
          } else if (typeof body === "string") {
            respBuf = Buffer.from(body, "utf8");
          } else {
            respBuf = Buffer.from(String(body), "utf8");
          }
        } else if (typeof ctx.getOutput === "function") {
          const out = ctx.getOutput();
          respBuf = out ? Buffer.from(String(out), "utf8") : Buffer.alloc(0);
        }
      } catch {
        respBuf = undefined;
      }

      const respContentType =
        (responseHeaders && (responseHeaders["Content-Type"] ?? responseHeaders["content-type"])) || undefined;
      if (respBuf !== undefined) {
        details.responseBody = captureBody(
          respBuf,
          typeof respContentType === "string" ? respContentType : undefined,
          settings.bodyLimit,
          settings.binaryPreview
        );
      }
    } catch {
      /* ignore — response capture is best-effort */
    }

    // ----- Error ------------------------------------------------------------
    const err = (ctx as any).error || ctx.getExtension?.("error");
    if (err) {
      const captured: RequestLogError = { message: err.message ?? String(err) };
      if (err.stack) captured.stack = err.stack;
      details.error = captured;
    }

    return details;
  }

  /**
   * Start the application HTTP server and the debug HTTP+WS server.
   *
   * @param port - Port for the debug dashboard API
   * @param servePort - Port for the application HTTP server
   * @param web - Disable TUI and open the web dashboard instead
   * @param local - Serve the bundled dashboard from the debug server instead of the hosted one
   * @param open - Open the dashboard in the default browser (`--no-open` to disable)
   * @param telemetry - Allow usage analytics on the hosted dashboard (`--no-telemetry` to disable)
   * @returns a promise settled once the service stops or the TUI quits
   */
  @Command("debug", {
    description: "Start dev server with debug dashboard",
    requires: ["router", "rest-domain", "http-server"]
  })
  debug(
    /** @alias p @description Debug dashboard port */
    port: number = 18181,
    /** @alias s @description Application server port */
    servePort: number = 18080,
    /** @description Disable TUI and open the web dashboard (hosted on webda.io) */
    web?: boolean,
    /** @description With --web: serve the bundled dashboard from the debug port instead of webda.io */
    local?: boolean,
    /** @description With --web: open the dashboard in the browser (--no-open to only print the URL) */
    open: boolean = true,
    /** @description With --web: allow usage analytics on the hosted dashboard (--no-telemetry or WEBDA_TELEMETRY=0 to disable) */
    telemetry: boolean = true
  ): CancelablePromise<void> {
    // Stays pending until the service stops or the TUI quits
    return new CancelablePromise<void>(
      (resolve, reject) => {
        this.running = resolve;
        this.startDebug(port, servePort, web, local, open, telemetry).catch(reject);
      },
      async () => {
        this.tui?.stop();
      }
    );
  }

  /**
   * Start the application server, the debug server and the TUI or browser
   *
   * @param port - Port for the debug dashboard API
   * @param servePort - Port for the application HTTP server
   * @param web - Disable TUI and open the web dashboard
   * @param local - Serve the bundled dashboard instead of the hosted one
   * @param open - Open the browser
   * @param telemetry - Allow usage analytics on the hosted dashboard
   */
  protected async startDebug(
    port: number,
    servePort: number,
    web?: boolean,
    local?: boolean,
    open: boolean = true,
    telemetry: boolean = true
  ): Promise<void> {
    // Start the main application server
    const httpServer = useDynamicService<any>("HttpServer");
    if (httpServer?.start) {
      await httpServer.start(undefined, servePort);
      this.log("INFO", `Application server started on port ${servePort}`);
    }

    // Start the debug HTTP + WebSocket server
    await this.startDebugServer(port);
    this.log("INFO", `Debug dashboard API listening on port ${this.listeningPort}`);

    // Launch TUI by default, unless --web is passed
    if (!web) {
      this.tui = new DebugTui(this.listeningPort, this.token);
      // Quitting the TUI ends the command
      this.tui.onStop = () => this.settle();
      await this.tui.start();
      return;
    }

    const url = buildDebugUrl({
      port: this.listeningPort,
      token: this.token,
      local,
      telemetry: resolveTelemetry(telemetry, process.env),
      hostedBase: process.env.WEBDA_DEBUG_UI_URL
    });
    this.dashboardUrl = url;
    this.printDashboardUrl(url);
    // Headless callers (CI, Playwright's `webServer`, scripted smoke
    // tests) set WEBDA_DEBUG_NO_BROWSER=1 to suppress the auto-open —
    // they manage their own browser instance and don't want the local
    // Chrome to pop a stray tab on every server start.
    if (open && !process.env.WEBDA_DEBUG_NO_BROWSER) {
      this.openBrowser(url);
    }
  }

  /**
   * Print the dashboard URL for the user.
   *
   * The hosted URL carries the session token in its fragment, so it is written
   * straight to stdout rather than through the logger: log output is captured
   * by the log buffer, broadcast to the dashboard and may be persisted by other
   * loggers.
   * @param url - the dashboard URL
   */
  protected printDashboardUrl(url: string): void {
    process.stdout.write(`\nWebda debug dashboard: ${url}\n\n`);
  }

  /**
   * Settle the running debug command
   */
  private settle(): void {
    this.running?.();
    this.running = undefined;
  }

  /**
   * Open a URL in the default browser.
   * @param url - URL to open
   */
  private openBrowser(url: string): void {
    openInBrowser(url);
  }

  /**
   * Create and start the debug HTTP server with WebSocket support.
   *
   * The server binds to the IPv4 loopback only; the websocket upgrade is
   * handled by hand so that the `Host` and token checks run before `ws`
   * completes the handshake.
   * @param port - Port to listen on
   */
  async startDebugServer(port: number): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));
    this.wss = new WebSocketServer({
      noServer: true,
      handleProtocols: protocols => (protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false)
    });

    this.wss.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
    });

    this.server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) =>
      this.handleUpgrade(req, socket, head)
    );

    await new Promise<void>(resolve => {
      this.server!.listen(port, "127.0.0.1", () => {
        const address = this.server!.address();
        this.listeningPort = typeof address === "object" && address ? address.port : port;
        resolve();
      });
    });
  }

  /**
   * Authenticate a websocket upgrade before handing it to `ws`.
   * @param req - the upgrade request
   * @param socket - the underlying socket
   * @param head - the first packet of the upgraded stream
   */
  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const reject = (status: number, reason: string) => {
      socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    if (!isAllowedHost(req.headers.host, this.listeningPort)) {
      reject(403, "Forbidden");
      return;
    }
    if (!safeEqual(extractWsToken(req.headers["sec-websocket-protocol"]), this.token)) {
      reject(401, "Unauthorized");
      return;
    }
    this.wss!.handleUpgrade(req, socket, head, ws => {
      this.wss!.emit("connection", ws, req);
    });
  }

  /**
   * Route incoming HTTP requests to introspection handlers.
   * @param req - Incoming HTTP request
   * @param res - Server response
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // DNS rebinding: a page on evil.com whose DNS answer flips to 127.0.0.1
    // still sends `Host: evil.com`; only loopback hosts are served.
    if (!isAllowedHost(req.headers.host, this.listeningPort)) {
      this.sendJson(res, { error: "Forbidden" }, 403);
      return;
    }

    // CORS: echo the origin back only if it is on the allowlist.
    // If there is no matching origin the browser will block cross-origin access,
    // which is the desired behaviour. We also set Vary: Origin so that CDN /
    // proxy caches do not serve a response with an allowed origin header to a
    // different (disallowed) origin.
    const origin = req.headers.origin;
    const originAllowed = isAllowedOrigin(origin);
    if (originAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin!);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
      // Private Network Access: the hosted dashboard (public) talks to
      // localhost (local); Chrome asks for this on the preflight.
      if (req.method === "OPTIONS" && req.headers["access-control-request-private-network"] === "true") {
        res.setHeader("Access-Control-Allow-Private-Network", "true");
      }
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || "/";
    const pathname = url.split("?")[0];

    if (!pathname.startsWith("/api/")) {
      this.serveStaticFile(pathname, req, res);
      return;
    }

    // Every API response needs the session token; no data leaves without it.
    if (!safeEqual(extractBearerToken(req.headers.authorization), this.token)) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="webda-debug"');
      this.sendJson(res, { error: "Unauthorized" }, 401);
      return;
    }

    try {
      // Route to handlers
      if (pathname === "/api/info") {
        this.sendJson(res, {
          ...getAppInfo(),
          debugApiVersion: DEBUG_API_VERSION,
          debugVersion: DEBUG_VERSION,
          frameworkVersion: frameworkVersion()
        });
      } else if (pathname === "/api/models") {
        this.sendJson(res, getModels());
      } else if (pathname.startsWith("/api/models/")) {
        const id = decodeURIComponent(pathname.slice("/api/models/".length));
        const model = getModel(id);
        if (model) {
          this.sendJson(res, model);
        } else {
          this.sendJson(res, { error: "Model not found" }, 404);
        }
      } else if (pathname === "/api/services") {
        this.sendJson(res, getServices());
      } else if (pathname === "/api/operations") {
        this.sendJson(res, getOperations());
      } else if (pathname === "/api/routes") {
        this.sendJson(res, getRoutes());
      } else if (pathname === "/api/config") {
        this.sendJson(res, getConfig());
      } else if (pathname === "/api/openapi") {
        this.sendJson(res, this.getOpenAPISpec());
      } else if (pathname === "/api/requests") {
        // List endpoint stays cheap — summaries only (no headers/bodies).
        this.sendJson(res, this.requestLog.getSummaries());
      } else if (pathname.startsWith("/api/requests/")) {
        const id = decodeURIComponent(pathname.slice("/api/requests/".length));
        const entry = this.requestLog.getEntry(id);
        if (entry) {
          this.sendJson(res, entry);
        } else {
          this.sendJson(res, { error: "Request not found" }, 404);
        }
      } else if (pathname === "/api/logs") {
        const searchParams = new URL(url, "http://localhost").searchParams;
        const query = searchParams.get("q") || "";
        this.sendJson(res, query ? this.logBuffer.search(query) : this.logBuffer.getEntries());
      } else {
        this.sendJson(res, { error: "Not found" }, 404);
      }
    } catch (err: any) {
      this.log("ERROR", `Debug API error: ${err.message}`);
      this.sendJson(res, { error: err.message || "Internal server error" }, 500);
    }
  }

  /**
   * Build an OpenAPI spec from the router.
   * @returns OpenAPI document or a stub if the router is unavailable
   */
  private getOpenAPISpec(): Record<string, any> {
    try {
      const router = useRouter();
      const doc: any = {
        openapi: "3.0.3",
        info: { title: "Webda Application", version: "1.0.0" },
        paths: {},
        tags: []
      };
      router.completeOpenAPI(doc);
      return doc;
    } catch {
      return { openapi: "3.0.3", info: { title: "Webda Application", version: "1.0.0" }, paths: {} };
    }
  }

  /**
   * Whether the session token may be injected into the page for this request.
   *
   * Only top-level navigations on the debug origin get it: a cross-site
   * `fetch` carries an `Origin` header and `Sec-Fetch-Site: cross-site` (or
   * `same-site` from the docs dev server on another port), and gets a clean page.
   * @param req - the incoming request
   * @returns `true` for same-origin navigations
   */
  private canReceiveToken(req: IncomingMessage): boolean {
    if (req.headers.origin) return false;
    const site = req.headers["sec-fetch-site"];
    return site === undefined || site === "none" || site === "same-origin";
  }

  /**
   * Serve a static file from the webui directory.
   * Falls back to index.html for SPA-style routing; the page gets the session
   * token injected (see {@link canReceiveToken}) so the bundled dashboard can
   * authenticate without the token ever appearing in a URL.
   * @param pathname - Request pathname
   * @param req - Incoming request
   * @param res - Server response
   */
  private serveStaticFile(pathname: string, req: IncomingMessage, res: ServerResponse): void {
    // Prevent directory traversal
    const safePath = pathname.replace(/\.\./g, "").replace(/\/+/g, "/");
    let filePath = join(WEBUI_DIR, safePath === "/" ? "index.html" : safePath);

    // If the file doesn't exist, serve index.html (SPA fallback)
    if (!existsSync(filePath)) {
      filePath = join(WEBUI_DIR, "index.html");
    }

    if (!existsSync(filePath)) {
      this.sendJson(res, { error: "Not found" }, 404);
      return;
    }

    try {
      const ext = extname(filePath);
      const mime = MIME_TYPES[ext] || "application/octet-stream";
      if (ext === ".html") {
        let html = readFileSync(filePath, "utf8");
        if (this.canReceiveToken(req)) {
          html = injectToken(html, this.token);
        }
        res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
        res.end(html);
        return;
      }
      const content = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mime });
      res.end(content);
    } catch {
      this.sendJson(res, { error: "Internal server error" }, 500);
    }
  }

  /**
   * Write a JSON response.
   * @param res - Server response
   * @param data - Data to serialize
   * @param statusCode - HTTP status code
   */
  private sendJson(res: ServerResponse, data: unknown, statusCode: number = 200): void {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  /**
   * Broadcast a message to all connected WebSocket clients.
   * @param data - Data to send (will be JSON-serialized)
   */
  broadcast(data: unknown): void {
    const message = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Clean up HTTP server and WebSocket connections.
   */
  async stop(): Promise<void> {
    // Unsubscribe from core events and log buffer
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.logBuffer.unsubscribe();

    // Close WebSocket connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    // Close servers
    if (this.wss) {
      this.wss.close();
      this.wss = undefined;
    }
    if (this.server) {
      await new Promise<void>(resolve => this.server!.close(() => resolve()));
      this.server = undefined;
    }

    this.timings.clear();
    this.tui?.stop();
    this.tui = undefined;
    this.settle();
    await super.stop();
  }
}
