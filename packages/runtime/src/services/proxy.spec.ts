import { suite, test } from "@testdeck/mocha";
import { HttpContext, WebdaError } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { EventEmitter } from "events";
import * as http from "http";
import sinon from "sinon";
import { WritableStreamBuffer } from "stream-buffers";
import { WebSocket, WebSocketServer } from "ws";
import { ProxyService, createHttpHeader } from "./proxy";

@suite
class WSProxyTest extends WebdaTest {
  @test
  cov() {
    assert.strictEqual(createHttpHeader("plop", { test: ["1", "2"] }), `plop\r\ntest: 1\r\ntest: 2\r\n\r\n`);
  }

  @test
  async wsProxy() {
    const proxyService = new ProxyService(this.webda, "proxy", {
      url: "/proxy",
      backend: "http://localhost:28888/"
    });
    const socket: any = new EventEmitter();
    socket.destroy = sinon.stub();
    socket.end = sinon.stub();
    proxyService.proxyWS({ url: "/toto" }, socket, undefined);
    assert.ok(!socket.destroy.calledOnce);
    proxyService.proxyWS({ url: "/proxy/", method: "POST" }, socket, undefined);
    assert.ok(socket.destroy.calledOnce);
    socket.destroy.resetHistory();
    proxyService.proxyWS({ url: "/proxy/", method: "GET", headers: {} }, socket, undefined);
    assert.ok(socket.destroy.calledOnce);
    socket.destroy.resetHistory();
    proxyService.proxyWS({ url: "/proxy/", method: "GET", headers: { upgrade: "toto" } }, socket, undefined);
    assert.ok(socket.destroy.calledOnce);
    const proxyRequestSocket: any = <any>new EventEmitter();
    proxyRequestSocket.end = sinon.stub();
    const createRequest = sinon.stub(proxyService, "createWSRequest").callsFake(() => {
      return <any>proxyRequestSocket;
    });
    const ctx = await this.newContext();
    await proxyService.rawProxyWS(ctx, "", socket);
    proxyRequestSocket.emit("error");
    assert.ok(socket.end.calledOnce);

    socket.write = sinon.stub();
    proxyRequestSocket.emit("response", {
      pipe: sinon.stub(),
      headers: {},
      httpVersion: "1.0",
      statusCode: 200,
      statusMessage: "OK"
    });
    assert.ok(socket.write.calledOnce);
    createRequest.restore();
    return new Promise<void>(async (resolve, reject) => {
      try {
        console.log("WS server constructor");
        const wss = new WebSocketServer({ port: 28888 });

        wss.on("connection", function connection(ws) {
          ws.on("error", console.error);

          ws.on("message", function message(data) {
            console.log("received: %s", data);
            ws.send(data);
          });

          ws.send("something");
        });

        this.registerService(proxyService);
        await proxyService.resolve().init();
        console.log("Http server constructor");
        const httpServer = http
          .createServer((req, res) => {
            console.log("Got request", req.url);
          })
          .listen("28887");
        this.webda.emit("Webda.Init.Http", httpServer);
        // @ts-ignore
        this.webda.getContextFromRequest = async (req, res) =>
          this.webda.newWebContext(
            new HttpContext("localhost", "GET", "/proxy/", "http", "28887", req.headers),
            res,
            true
          );

        const ws = new WebSocket("ws://localhost:28887/proxy/");

        ws.on("error", console.error);

        ws.on("open", function open() {
          console.log("connected");
          ws.send(Date.now());
        });

        ws.on("close", function close() {
          console.log("disconnected");
        });

        ws.on("message", function message(data: any) {
          if (isNaN(data)) {
            return;
          }
          console.log(`Round-trip time: ${Date.now() - data} ms`);
          ws.close();
          wss.close();
          httpServer.close();
          resolve();
        });
      } catch (err) {
        console.error(err);
      }
    });
  }
}

@suite
class ProxyTest extends WebdaTest {
  server: http.Server;

  async before() {
    await super.before();
    this.fakeServe();
  }

  fakeServe() {
    this.server = http
      .createServer((req, res) => {
        if (req.url === "/plop404") {
          res.writeHead(404);
          res.end();
          return;
        } else if (req.url === "/plop500") {
          res.end();
          return;
        }
        res.writeHead(200, { "X-URL": req.url });
        // Just simple echo
        req.pipe(res);
      })
      .listen(28888);
  }

  after() {
    this.server?.close();
  }

  @test
  async proxy() {
    const proxyService = new ProxyService(this.webda, "proxy", {
      url: "/proxy",
      backend: "http://localhost:28888/"
    });
    this.registerService(proxyService);
    await proxyService.resolve().init();
    this.webda.getRouter().remapRoutes();
    const ctx = await this.newContext();
    ctx.getHttpContext().setClientIp("127.0.0.1");

    let exec = this.getExecutor(ctx, "test.webda.io", "PUT", "/proxy/test/plop", "Bouzouf");
    await exec.execute(ctx);
    assert.notStrictEqual((<WritableStreamBuffer>ctx.getStream()).size(), 0);
    assert.strictEqual(ctx.getResponseBody().toString(), "Bouzouf");

    exec = this.getExecutor(ctx, "test.webda.io", "PUT", "/proxy/test/plop/toto?query=1&query2=test,test2", "Bouzouf");
    await exec.execute(ctx);
    assert.notStrictEqual((<WritableStreamBuffer>ctx.getStream()).size(), 0);
    assert.strictEqual(ctx.getResponseBody().toString(), "Bouzouf");
    assert.strictEqual(ctx.getResponseHeaders()["x-url"], "/test/plop/toto?query=1&query2=test,test2");

    exec = this.getExecutor(ctx, "test.webda.io", "GET", "/proxy/plop404", "Bouzouf");
    await exec.execute(ctx);
    proxyService.getParameters().backend = "http://256.256.256.256/";
    exec = this.getExecutor(ctx, "test.webda.io", "GET", "/proxy/webda", "Bouzouf");
    await exec.execute(ctx);
    proxyService.getParameters().backend = "https://www.loopingz.com/";
    exec = this.getExecutor(ctx, "test.webda.io", "GET", "/proxy/webda", "Bouzouf");
    await exec.execute(ctx);

    proxyService.getParameters().requireAuthentication = true;
    await assert.rejects(() => this.execute(ctx, "test.webda.io", "GET", "/proxy"), WebdaError.Unauthorized);
    ctx.reinit();
    ctx.getSession().login("test", "test");

    await this.execute(ctx, "test.webda.io", "GET", "/proxy", undefined, {
      "x-forwarded-for": "10.0.0.8"
    });
    //assert.strictEqual(ctx.getResponseHeaders()["x-forwarded-for"], "127.0.0.1, 10.0.0.8");

    // cov
    proxyService.getParameters().url = undefined;
    proxyService.resolve();
  }
}
