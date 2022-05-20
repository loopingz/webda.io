import {
  ClientInfo,
  Context,
  Core as Webda,
  HttpContext,
  HttpMethodType,
  ResourceService,
  WaitFor,
  WaitLinearDelay
} from "@webda/core";
import { serialize as cookieSerialize } from "cookie";
import * as http from "http";
import { createChecker } from "is-in-subnet";
import { AddressInfo } from "net";

export enum ServerStatus {
  Stopped = "STOPPED",
  Stopping = "STOPPING",
  Starting = "STARTING",
  Started = "STARTED"
}

export class WebdaServer extends Webda {
  private http: http.Server;
  private io: any;
  protected devMode: boolean;
  protected serverStatus: ServerStatus = ServerStatus.Stopped;
  protected subnetChecker: (address: string) => boolean;
  /**
   * Resource services used to serve static content
   */
  protected resourceService: ResourceService;

  /**
   * Toggle DevMode
   *
   * In DevMode CORS is allowed
   * @param devMode
   */
  setDevMode(devMode: boolean) {
    this.devMode = devMode;
  }

  output(...args) {
    this.log("INFO", ...args);
  }

  /**
   * Initialize a ClientInfo structure based on request
   * @param {http.Request} req
   */
  getClientInfo(req): ClientInfo {
    let res = new ClientInfo();
    res.ip = req.connection.remoteAddress;
    res.userAgent = req.headers["user-agent"];
    res.locale = req.headers["Accept-Language"];
    res.referer = req.headers["Referer"];
    return res;
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
   * Manage the request
   *
   * @param req
   * @param res
   * @param next
   */
  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      res.on("error", this.log.bind(this, "ERROR"));
      // Wait for Webda to be ready
      await this.init();

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
        this.log("WARN", "X-Forwarded-* headers set from an unknown source");
        res.writeHead(400);
        res.end();
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

      let method = req.method;
      let port;
      if (req.socket && req.socket.address()) {
        port = (<AddressInfo>req.socket.address()).port;
      }
      if (req.headers["x-forwarded-port"] !== undefined) {
        port = parseInt(<string>req.headers["x-forwarded-port"]);
      }
      let httpContext = new HttpContext(
        vhost,
        <HttpMethodType>method,
        req.url,
        protocol,
        port,
        req.headers
      ).setClientIp(req.headers["x-forwarded-for"] || req.socket.remoteAddress);
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
      if (["PUT", "PATCH", "POST", "DELETE"].includes(method)) {
        httpContext.setBody(req);
      }
      let ctx = await this.newContext(httpContext, res, true);
      ctx.clientInfo = this.getClientInfo(req);

      if (!this.updateContextWithRoute(ctx)) {
        let routes = this.router.getRouteMethodsFromUrl(httpContext.getRelativeUri());
        if (routes.length === 0) {
          // Static served should not be reachable via XHR
          if (method !== "GET" || !this.resourceService) {
            ctx.writeHead(404);
            await ctx.end();
            return;
          }
          // Try to serve static resource
          await ctx.init();
          ctx.getParameters()["resource"] = ctx.getHttpContext().getUrl().substring(1);
          try {
            this.resourceService._serve(await ctx.init());
          } catch (err) {
            if (typeof err === "number") {
              ctx.writeHead(err);
            } else {
              throw err;
            }
          }
          await ctx.end();
          return;
        }
      }

      await ctx.init();

      // Fallback on reference as Origin is not always set by Edge
      let origin = req.headers.Origin || req.headers.origin || req.headers.Referer;
      try {
        // Set predefined headers for CORS
        if (this.devMode || (await this.checkCORSRequest(ctx))) {
          if (origin) {
            res.setHeader("Access-Control-Allow-Origin", origin);
          }
        } else {
          // Prevent CSRF
          this.log("INFO", "CSRF denied from", origin);
          res.writeHead(401);
          res.end();
          return;
        }
        // Verify if request is authorized
        if (!(await this.checkRequest(ctx))) {
          this.log("WARN", "Request refused");
          throw 403;
        }
      } catch (err) {
        if (typeof err === "number") {
          res.writeHead(err);
          res.end();
          return;
        }
        throw err;
      }

      if (protocol === "https") {
        // Add the HSTS header
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
      }
      // Add correct headers for X-scripting
      if (req.headers["x-forwarded-server"] === undefined) {
        if (this.devMode && req.headers["origin"]) {
          res.setHeader("Access-Control-Allow-Origin", req.headers["origin"]);
        }
      }
      if (req.method === "OPTIONS") {
        let routes = this.router.getRouteMethodsFromUrl(httpContext.getRelativeUri());
        routes.push("OPTIONS");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "content-type");
        res.setHeader("Access-Control-Allow-Methods", routes.join(","));
        res.setHeader("Access-Control-Max-Age", 86400);
        res.setHeader("Allow", routes.join(","));
        res.writeHead(200);
        res.end();
        return;
      }
      await this.emitSync("Webda.Request", { context: ctx });

      res.setHeader("Access-Control-Allow-Credentials", "true");
      try {
        await ctx.execute();
        await this.emitSync("Webda.Result", { context: ctx });
        await ctx.end();
      } catch (err) {
        await this.emitSync("Webda.Result", { context: ctx });
        if (typeof err === "number") {
          ctx.statusCode = err;
          this.flushHeaders(ctx);
          return;
        }
        throw err;
      }
    } catch (err) {
      res.writeHead(500);
      this.output("ERROR Exception occured : " + JSON.stringify(err), err.stack);
    }
  }

  flushHeaders(ctx: Context) {
    if (ctx.hasFlushedHeaders()) {
      return;
    }
    ctx.setFlushedHeaders(true);
    let res = <http.ServerResponse>ctx.getStream();
    var headers = ctx.getResponseHeaders();
    let cookies = ctx.getResponseCookies();
    for (let i in cookies) {
      res.setHeader("Set-Cookie", cookieSerialize(cookies[i].name, cookies[i].value, cookies[i].options));
    }
    res.writeHead(ctx.statusCode, headers);
  }

  flush(ctx: Context) {
    var res = ctx._stream;
    if (ctx.getResponseBody() !== undefined) {
      res.write(ctx.getResponseBody());
    }
    res.end();
  }

  async init() {
    // Avoid reinit everytime
    if (this._init) {
      return this._init;
    }
    await super.init();
    this.getGlobalParams().trustedProxies ??= "127.0.0.1";
    if (typeof this.getGlobalParams().trustedProxies === "string") {
      this.getGlobalParams().trustedProxies = this.getGlobalParams().trustedProxies.split(",");
    }
    this.subnetChecker = createChecker(
      this.getGlobalParams().trustedProxies.map(n => (n.indexOf("/") < 0 ? `${n}/32` : n))
    );
    if (this.getGlobalParams().website && this.getGlobalParams().website.path && !this.resourceService) {
      this.resourceService = new ResourceService(this, "websiteResource", {
        folder: this.getAppPath(this.getGlobalParams().website.path)
      });
      this.resourceService.resolve();
      await this.resourceService.init();
    }
  }
  /**
   * Start listening to serve request
   *
   * @param port to listen to
   * @param websockets to enable websockets
   * @param bind address to bind
   */
  async serve(port: number = 18080, websockets: boolean = false, bind: string = undefined) {
    this.serverStatus = ServerStatus.Starting;
    try {
      this.http = http
        .createServer((req, res) => {
          this.handleRequest(req, res).finally(() => {
            res.end();
          });
        })
        .listen(port, bind);
      process.on("SIGINT", this.onSIGINT.bind(this));
      this.http.on("close", () => {
        this.serverStatus = ServerStatus.Stopped;
      });
      this.http.on("error", err => {
        this.log("ERROR", err.message);
        this.serverStatus = ServerStatus.Stopped;
      });
      if (websockets) {
        // Activate websocket
        this.output("Activating socket.io");
        this.io = require("socket.io")(this.http);
        this.emit("Webda.Init.SocketIO", this.io);
      }
      this.output("Server running at http://0.0.0.0:" + port);
      this.serverStatus = ServerStatus.Started;
    } catch (err) {
      this.log("ERROR", err);
      this.serverStatus = ServerStatus.Stopped;
      throw err;
    }
  }

  /**
   * Close server and exit
   */
  onSIGINT() {
    if (this.http) {
      this.http.close();
    }
  }

  /**
   * Get server status
   */
  getServerStatus() {
    return this.serverStatus;
  }

  /**
   * Wait for the server to be in a desired state
   *
   * @param status to wait for
   * @param timeout max number of ms to wait for
   */
  async waitForStatus(status: ServerStatus.Stopped | ServerStatus.Started, timeout: number = 60000) {
    return WaitFor(
      async resolve => {
        if (this.getServerStatus() === status) {
          resolve();
          return true;
        }
      },
      timeout / 1000,
      "Waiting for server status",
      undefined,
      WaitLinearDelay(1000)
    );
  }

  /**
   * Stop the http server
   */
  async stop() {
    if (this.http && this.serverStatus === ServerStatus.Starting) {
      await this.waitForStatus(ServerStatus.Started);
    }
    this.serverStatus = ServerStatus.Stopping;
    if (this.http) {
      await new Promise<void>((resolve, reject) => {
        this.http.close(err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
    this.serverStatus = ServerStatus.Stopped;
    this.http = undefined;
  }
}
