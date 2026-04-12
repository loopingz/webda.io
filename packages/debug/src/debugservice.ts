import { Service, ServiceParameters, useDynamicService, useCoreEvents, useRouter } from "@webda/core";
import { Command } from "@webda/core";
import { createServer, IncomingMessage, ServerResponse, Server } from "node:http";
import { exec } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { RequestLog } from "./requestlog.js";
import { LogBuffer } from "./logbuffer.js";
import { getModels, getModel, getServices, getOperations, getRoutes, getConfig, getAppInfo } from "./introspection.js";
import { DebugTui } from "./tui/tui.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBUI_DIR = join(__dirname, "..", "webui");

/** Map file extensions to MIME types for static file serving. */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

/**
 * Debug dashboard service that provides an HTTP API for introspection
 * and a WebSocket feed of live request events.
 *
 * @WebdaModda
 */
export class DebugService extends Service {
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
  /** Timing map: requestId -> start timestamp */
  private timings: Map<string, number> = new Map();

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
      useCoreEvents("Webda.Result", evt => {
        const ctx = evt.context;
        const id = ctx.getExtension<string>("debugRequestId");
        if (!id) return;
        const start = this.timings.get(id);
        const duration = start ? Date.now() - start : 0;
        this.timings.delete(id);
        const statusCode = ctx.statusCode ?? 200;
        this.requestLog.completeRequest(id, statusCode, duration);
      })
    );

    this.unsubscribers.push(
      useCoreEvents("Webda.404", evt => {
        const ctx = evt.context;
        const id = ctx.getExtension<string>("debugRequestId");
        if (!id) return;
        this.timings.delete(id);
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
   * Start the application HTTP server and the debug HTTP+WS server.
   *
   * @param port - Port for the debug dashboard API
   * @param servePort - Port for the application HTTP server
   * @param web - Disable TUI and only serve the web dashboard
   */
  @Command("debug", { description: "Start dev server with debug dashboard", requires: ["router", "rest-domain", "http-server"] })
  async debug(
    /** @alias p @description Debug dashboard port */
    port: number = 18181,
    /** @alias s @description Application server port */
    servePort: number = 18080,
    /** @description Disable TUI and only serve the web dashboard */
    web?: boolean
  ): Promise<void> {
    // Start the main application server
    const httpServer = useDynamicService<any>("HttpServer");
    if (httpServer?.serve) {
      await httpServer.serve(undefined, servePort);
      this.log("INFO", `Application server started on port ${servePort}`);
    }

    // Start the debug HTTP + WebSocket server
    await this.startDebugServer(port);
    this.log("INFO", `Debug dashboard API listening on port ${port}`);

    // Launch TUI by default, unless --web is passed
    if (!web) {
      const tui = new DebugTui(port);
      await tui.start();
    } else {
      this.openBrowser(`http://localhost:${port}`);
    }
  }

  /**
   * Open a URL in the default browser.
   * @param url - URL to open
   */
  private openBrowser(url: string): void {
    const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
    exec(`${cmd} ${url}`);
  }

  /**
   * Create and start the debug HTTP server with WebSocket support.
   * @param port - Port to listen on
   */
  async startDebugServer(port: number): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
    });

    await new Promise<void>(resolve => {
      this.server!.listen(port, () => resolve());
    });
  }

  /**
   * Route incoming HTTP requests to introspection handlers.
   * @param req - Incoming HTTP request
   * @param res - Server response
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || "/";
    const pathname = url.split("?")[0];

    try {
      // Route to handlers
      if (pathname === "/api/info") {
        this.sendJson(res, getAppInfo());
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
        this.sendJson(res, this.requestLog.getEntries());
      } else if (pathname === "/api/logs") {
        const searchParams = new URL(url, "http://localhost").searchParams;
        const query = searchParams.get("q") || "";
        this.sendJson(res, query ? this.logBuffer.search(query) : this.logBuffer.getEntries());
      } else {
        this.serveStaticFile(pathname, res);
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
   * Serve a static file from the webui directory.
   * Falls back to index.html for SPA-style routing.
   * @param pathname - Request pathname
   * @param res - Server response
   */
  private serveStaticFile(pathname: string, res: ServerResponse): void {
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
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      const mime = MIME_TYPES[ext] || "application/octet-stream";
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
    await super.stop();
  }
}
