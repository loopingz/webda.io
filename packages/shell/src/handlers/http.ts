import {
  Core as Webda,
  HttpContext,
  HttpMethodType,
  ResourceService,
  WaitFor,
  WaitLinearDelay,
  WebContext,
  WebdaError
} from "@webda/core";
import { serialize as cookieSerialize } from "cookie";
import * as http from "http";
import { createChecker } from "is-in-subnet";
import { AddressInfo } from "net";
import { Writable } from "stream";

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
   * Check if a proxy is a trusted proxy
   * @param ip
   * @returns
   */
  isProxyTrusted(ip: string): boolean {
    // ipv4 mapped to v6
    return this.subnetChecker(ip);
  }

  /**
   * Return a Context object based on a request
   * @param req to initiate object from
   * @param res to add for body
   * @returns
   */
  async getContextFromRequest(req: http.IncomingMessage, res?: http.ServerResponse) {
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
      this.log("WARN", `X-Forwarded-* headers set from an unknown source: ${req.socket.remoteAddress}`);
      res.writeHead(400);
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
    } else if (req.headers["x-forwarded-proto"] !== undefined) {
      // GCP send a proto without port so fallback on default port
      port = protocol === "http" ? 80 : 443;
    }
    let httpContext = new HttpContext(vhost, <HttpMethodType>method, req.url, protocol, port, req.headers);
    httpContext.setClientIp(httpContext.getUniqueHeader("x-forwarded-for", req.socket.remoteAddress));
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
    if (["PUT", "PATCH", "POST", "DELETE"].includes(method)) {
      httpContext.setBody(req);
    }
    return this.newWebContext(httpContext, <Writable>res, true);
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
      let ctx = await this.getContextFromRequest(req, res);
      if (!ctx) {
        return;
      }
      let httpContext = ctx.getHttpContext();

      if (!this.updateContextWithRoute(ctx)) {
        let routes = this.router.getRouteMethodsFromUrl(httpContext.getRelativeUri());
        if (routes.length === 0) {
          // Static served should not be reachable via XHR
          if (httpContext.getMethod() !== "GET" || !this.resourceService) {
            ctx.writeHead(404);
            await ctx.end();
            return;
          }
          // Try to serve static resource
          await ctx.init();
          ctx.getParameters()["resource"] = ctx.getHttpContext().getUrl().substring(1);
          try {
            await this.resourceService._serve(ctx);
          } catch (err) {
            if (typeof err === "number") {
              ctx.writeHead(err);
            } else if (err instanceof WebdaError.HttpError) {
              this.log("DEBUG", "Sending error", err.message);
              ctx.writeHead(err.getResponseCode());
            } else {
              throw err;
            }
          }
          await ctx.end();
          return;
        }
      }

      await ctx.init();
      const origin = <string>(req.headers.Origin || req.headers.origin);
      try {
        // Set predefined headers for CORS
        if (this.devMode || !origin || (await this.checkCORSRequest(ctx))) {
          if (origin) {
            res.setHeader("Access-Control-Allow-Origin", origin);
          }
        } else {
          this.log("INFO", "CORS denied from", origin);
          ctx.writeHead(401);
          await ctx.end();
          return;
        }
        this.log("INFO", "Pre checkRequest", ctx.getHttpContext().getMethod(), ctx.getHttpContext().getUrl());
        // Verify if request is authorized
        if (!(await this.checkRequest(ctx))) {
          this.log("WARN", "Request refused");
          throw 403;
        }
        this.log("INFO", "Post checkRequest", ctx.getHttpContext().getMethod(), ctx.getHttpContext().getUrl());
      } catch (err) {
        if (typeof err === "number") {
          ctx.statusCode = err;
          await ctx.end();
          return;
        } else if (err instanceof WebdaError.HttpError) {
          ctx.statusCode = err.getResponseCode();
          await ctx.end();
          return;
        }
        throw err;
      }
      if (httpContext.getProtocol() === "https:") {
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
        return;
      }
      await this.emitSync("Webda.Request", { context: ctx });

      res.setHeader("Access-Control-Allow-Credentials", "true");
      try {
        this.log("INFO", "Execute", ctx.getHttpContext().getMethod(), ctx.getHttpContext().getUrl());
        await ctx.execute();
        await this.emitSync("Webda.Result", { context: ctx });
        await ctx.end();
      } catch (err) {
        await this.emitSync("Webda.Result", { context: ctx });
        if (typeof err === "number") {
          ctx.statusCode = err;
          this.flushHeaders(ctx);
          return;
        } else if (err instanceof WebdaError.HttpError) {
          this.log("DEBUG", "Sending error", err.message);
          ctx.statusCode = err.getResponseCode();
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

  /**
   * @override
   */
  flushHeaders(ctx: WebContext) {
    if (ctx.hasFlushedHeaders()) {
      return;
    }
    ctx.setFlushedHeaders(true);
    const res = <http.ServerResponse>ctx.getStream();
    const headers = ctx.getResponseHeaders();
    const cookies = ctx.getResponseCookies();
    try {
      for (let i in cookies) {
        res.setHeader("Set-Cookie", cookieSerialize(cookies[i].name, cookies[i].value, cookies[i].options));
      }
      res.writeHead(ctx.statusCode, headers);
    } catch (err) {
      this.log("ERROR", err);
    }
  }

  /**
   * @override
   */
  flush(ctx: WebContext) {
    const res = ctx._stream;
    const body = ctx.getResponseBody();
    if (body !== undefined && body) {
      res.write(body);
    }
  }

  /**
   * @override
   */
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
      this.getGlobalParams().trustedProxies.map(n => (n.indexOf("/") < 0 ? `${n.trim()}/32` : n.trim()))
    );
    if (this.getGlobalParams().website && this.getGlobalParams().website.path && !this.resourceService) {
      this.resourceService = await new ResourceService(this, "websiteResource", {
        folder: this.getAppPath(this.getGlobalParams().website.path)
      })
        .resolve()
        .init();
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
        this.io = new (await import("socket.io")).Server(this.http, {
          cors: {
            // Allow all origin as they should have been filtered by allowRequest
            origin: (origin, callback) => callback(null, origin),
            credentials: true
          },
          allowRequest: async (req, callback) => {
            try {
              // Use our checkRequest filtering system
              const ctx = await this.getContextFromRequest(req);
              // Check CORS and Request at the same time as the origin callback only provide origin string
              if (!(this.devMode || (await this.checkCORSRequest(ctx))) || !(await this.checkRequest(ctx))) {
                this.output("Request refused either CORSFilter or RequestFilter");
                callback("Request not allowed", null);
              } else {
                // Load session
                await ctx.init();
                // Set session on object
                // @ts-ignore
                req.session = ctx.getSession();
                // @ts-ignore
                req.webdaContext = ctx;
                callback(null, true);
              }
            } catch (err) {
              callback(err, null);
            }
          }
        });
        this.emit("Webda.Init.SocketIO", this.io);
      }
      this.logger.logTitle(`Server running at http://0.0.0.0:${port}${websockets ? " with websockets" : ""}`);
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
