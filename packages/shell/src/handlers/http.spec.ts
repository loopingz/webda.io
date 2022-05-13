import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as fetch from "node-fetch";
import { SampleApplicationTest, WebdaSampleApplication } from "../index.spec";
import { ServerStatus, WebdaServer } from "./http";
import * as sinon from "sinon";
import * as http from "http";
import { HttpContext, ResourceService } from "@webda/core";
@suite
class WebdaServerTest {
  server: WebdaServer;
  port: number;
  badCheck: boolean = false;

  async init(deployment: string = undefined, startHttp: boolean = false, websockets: boolean = false) {
    await WebdaSampleApplication.load();
    WebdaSampleApplication.setCurrentDeployment(deployment);
    this.server = new WebdaServer(WebdaSampleApplication);
    await this.server.init();
    if (startHttp) {
      this.server.serve(this.port, websockets);
      await this.server.waitForStatus(ServerStatus.Started);
    }
  }

  before() {
    this.port = 28080;
  }

  async after() {
    if (!this.server) {
      return;
    }
    try {
      await this.server.stop();
    } catch (err) {
      if (err.code !== "ERR_SERVER_NOT_RUNNING") {
        throw err;
      }
    }
    this.server = undefined;
  }

  @test
  async testAlreadyBind() {
    let server = http.createServer(() => {}).listen(this.port);
    const logs = [];
    await WebdaSampleApplication.load();
    WebdaSampleApplication.setCurrentDeployment("Dev");
    this.server = new WebdaServer(WebdaSampleApplication);
    await this.server.init();
    let stub = sinon.stub(this.server, "log").callsFake((...args) => {
      logs.push(args);
    });
    // @ts-ignore
    this.server.serverStatus = ServerStatus.Starting;
    try {
      this.server.serve(this.port, false);
      await this.server.waitForStatus(ServerStatus.Stopped);
    } catch (err) {
      // ignore if failed
    }
    stub.restore();
    server.close();
    assert.deepStrictEqual(logs, [
      ["INFO", "Server running at http://0.0.0.0:28080"],
      ["ERROR", "listen EADDRINUSE: address already in use :::28080"]
    ]);
  }

  @test
  async testSampleApplicationApi() {
    await this.init("Dev", true);
    let app = new SampleApplicationTest(`http://localhost:${this.port}`);
    await app.testApi();
    // Should disable CSRF check on DevMode
    this.server.setDevMode(true);
    let res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Access-Control-Allow-Origin"), "bouzouf");
    assert.strictEqual(await res.text(), "Tested");

    // Test errors system
    // @ts-ignore
    let stub = sinon.stub(this.server.getService("CustomService"), "test").callsFake(async () => {
      throw 404;
    });
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 404);
    stub.callsFake(() => {
      throw new Error("Unknown");
    });
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 500);

    // Test hard stop on CSRF checkRequest
    this.server.setDevMode(false);
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 401);
    this.server.registerCORSFilter(this);
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 410);
    this.badCheck = true;
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 500);

    stub.restore();

    this.server.setDevMode(true);
    // Remove request accept
    // @ts-ignore
    this.server._requestFilters = [];
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 403);
  }

  async checkRequest(): Promise<boolean> {
    if (this.badCheck) {
      throw new Error("Unknown");
    }
    throw 410;
  }

  @test
  async testSampleApplicationStatic() {
    await this.init("Production", true, true);
    let app = new SampleApplicationTest(`http://localhost:${this.port}`);
    await app.testStatic();
    let stub = sinon.stub(this.server, "newContext").callsFake(() => {
      throw new Error("Bad context");
    });
    let res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 500);
    stub.restore();
    let resourceService =  new ResourceService(this.server, "static", {
      folder: "test"
    });
    // @ts-ignore
    this.server.resourceService = resourceService;
    let stub2 = sinon.stub(resourceService, "_serve").callsFake(() => {
      throw 404;
    })
    res = await fetch(`http://localhost:${this.port}/index.html`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 404);
    stub2.callsFake(() => {
      throw new Error("Random")
    })
    res = await fetch(`http://localhost:${this.port}/index.html`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 500);
    stub2.restore();
    // Test SIGINT
    this.server.onSIGINT();
  }

  @test
  async flushHeaders() {
    await this.init("Dev", false);
    let ctx = await this.server.newContext(new HttpContext("test.webda.io", "GET", "/"));
    ctx.setFlushedHeaders();
    // Test we do not double flush headers
    this.server.flushHeaders(ctx);
  }

  @test
  async stop() {
    await this.init("Dev", true);
    let stub = sinon.stub(this.server, "waitForStatus").callsFake(async () => {});
    // @ts-ignore
    this.server.serverStatus = ServerStatus.Starting;
    await this.server.stop();
    assert.strictEqual(stub.callCount, 1);
  }

  @test
  async initError() {
    await WebdaSampleApplication.load();
    WebdaSampleApplication.setCurrentDeployment("Dev");
    this.server = new WebdaServer(WebdaSampleApplication);
    await this.server.init();
    // To Trigger a bad reference access
    this.server.onSIGINT = null;
    await assert.rejects(() => this.server.serve(this.port, false), TypeError);
    assert.strictEqual(this.server.getServerStatus(), ServerStatus.Stopped);
  }
}
