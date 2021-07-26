import { ClientInfo, Core as Webda, HttpContext, WebdaError, EventWebdaRequest, EventWebdaResult } from "@webda/core";
import * as http from "http";
import { serialize as cookieSerialize } from "cookie";
const path = require("path");

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
  protected staticIndex: string;
  protected serverStatus: ServerStatus = ServerStatus.Stopped;

  setDevMode(devMode: boolean) {
    this.devMode = devMode;
  }

  logRequest(...args) {
    this.logger.logWithContext("INFO", { type: "REQUEST" }, ...args);
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
   * Manage the request
   *
   * @param req
   * @param res
   * @param next
   */
  async handleRequest(req, res, next) {
    try {
      // Wait for Webda to be ready
      await this.init();

      // Handle reverse proxy
      var vhost = req.headers.host.match(/:/g)
        ? req.headers.host.slice(0, req.headers.host.indexOf(":"))
        : req.headers.host;
      if (req.hostname !== undefined) {
        vhost = req.hostname;
      }
      if (req.headers["x-forwarded-host"] !== undefined) {
        vhost = req.headers["x-forwarded-host"];
      }
      var protocol = req.protocol;
      if (req.headers["x-forwarded-proto"] !== undefined) {
        protocol = req.headers["x-forwarded-proto"];
      }

      let method = req.method;
      let port;
      if (req.socket && req.socket.address()) {
        port = req.socket.address().port;
      }
      if (req.headers["x-forwarded-port"] !== undefined) {
        port = parseInt(req.headers["x-forwarded-port"]);
      }
      let httpContext = new HttpContext(vhost, method, req.url, protocol, port, req.body, req.headers, req.files);
      let ctx = await this.newContext(httpContext, res, true);
      ctx.clientInfo = this.getClientInfo(req);

      if (!this.updateContextWithRoute(ctx)) {
        let routes = this.router.getRouteMethodsFromUrl(httpContext.getRelativeUri());
        if (routes.length === 0) {
          return next();
        }
      }

      await ctx.init();
      req.session = ctx.getSession().getProxy();

      // Setup the right session cookie
      //req.session.cookie.domain = vhost;

      // Fallback on reference as Origin is not always set by Edge
      let origin = req.headers.Origin || req.headers.origin || req.headers.Referer;
      // Set predefined headers for CORS

      if (this.devMode || (await this.checkRequest(ctx))) {
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
      await this.emitSync("Webda.Request", <EventWebdaRequest>{ context: ctx });

      res.setHeader("Access-Control-Allow-Credentials", "true");
      try {
        await ctx.execute();
        await this.emitSync("Webda.Result", <EventWebdaResult>{ context: ctx });
        if (!ctx._ended) {
          await ctx.end();
        }
      } catch (err) {
        await this.emitSync("Webda.Result", <EventWebdaResult>{ context: ctx });
        if (typeof err === "number") {
          ctx.statusCode = err;
          this.flushHeaders(ctx);
          return res.end();
        } else {
          this.output("ERROR Exception occured : " + JSON.stringify(err), err.stack);
          res.writeHead(500);
          res.end();
          throw err;
        }
      }
    } catch (err) {
      res.writeHead(500);
      this.output("ERROR Exception occured : " + JSON.stringify(err), err.stack);
      res.end();
    }
  }

  flushHeaders(ctx) {
    var res = ctx._stream;
    var headers = ctx.getResponseHeaders();
    let cookies = ctx.getResponseCookies();
    for (let i in cookies) {
      res.header("Set-Cookie", cookieSerialize(cookies[i].name, cookies[i].value, cookies[i].options));
    }
    res.writeHead(ctx.statusCode, headers);
  }

  flush(ctx) {
    var res = ctx._stream;
    if (ctx._body !== undefined) {
      res.write(ctx._body);
    }
    res.end();
  }

  protected handleStaticIndexRequest(req, res, next) {
    res.sendFile(this.staticIndex);
  }

  /**
   * Serve a static directory
   *
   * @param express
   * @param app
   */
  serveStaticWebsite(express, app) {
    if (this.getGlobalParams().website && this.getGlobalParams().website.path) {
      app.use(express.static(path.join(this.application.getAppPath(), this.getGlobalParams().website.path)));
    }
  }

  /**
   * Serve a static index if page not found, usefull for Single Page Application
   *
   * @param express
   * @param app
   */
  serveIndex(express, app) {
    if (this.getGlobalParams().website && this.getGlobalParams().website.path) {
      let index = path.join(
        this.application.getAppPath(),
        this.getGlobalParams().website.path,
        this.getGlobalParams().website.index || "index.html"
      );
      this.staticIndex = path.resolve(index);
      app.get("*", this.handleStaticIndexRequest.bind(this));
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
      var express = require("express");
      var cookieParser = require("cookie-parser");
      var bodyParser = require("body-parser");
      var multer = require("multer"); // v1.0.5
      var upload = multer(); // for parsing multipart/form-data

      var requestLimit = this.getGlobalParams().requestLimit ? this.getGlobalParams().requestLimit : "20mb";
      var app = express();
      app.use(cookieParser());
      app.use(
        bodyParser.text({
          type: "text/plain"
        })
      );
      app.use(
        bodyParser.json({
          limit: requestLimit
        })
      );
      app.use(
        bodyParser.urlencoded({
          extended: true
        })
      );
      app.use(upload.array("file"));
      // Will lower the limit soon, we should have a library that handle multipart file
      app.use(
        bodyParser.raw({
          type: "*/*",
          limit: requestLimit
        })
      );

      app.set("trust proxy", "loopback, 10.0.0.0/8");
      app.set("x-powered-by", false);

      app.use(this.handleRequest.bind(this));
      this.serveStaticWebsite(express, app);

      this.http = http.createServer(app).listen(port, bind);
      process.on("SIGINT", function () {
        if (this.http) {
          this.http.close();
        }
      });
      this.http.on("close", () => {
        this.serverStatus = ServerStatus.Stopped;
      });
      if (websockets) {
        // Activate websocket
        this.output("Activating socket.io");
        this.io = require("socket.io")(this.http);
        this.emit("Webda.Init.SocketIO", this.io);
      }
      this.serveIndex(express, app);
      this.output("Server running at http://0.0.0.0:" + port);
      this.serverStatus = ServerStatus.Started;
    } catch (err) {
      this.log("ERROR", err);
      this.serverStatus = ServerStatus.Stopped;
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
    let time = 0;
    do {
      if (this.getServerStatus() === status) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      time += 1000;
      if (timeout < time) {
        throw new WebdaError("WAIT_FOR_TIMEOUT", "Timeout");
      }
    } while (true);
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
