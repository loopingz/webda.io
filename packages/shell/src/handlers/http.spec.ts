import { suite, test } from "@testdeck/mocha";
import { HttpContext, ResourceService, WebdaError } from "@webda/core";
import * as assert from "assert";
import * as http from "http";
import { createChecker } from "is-in-subnet";
import fetch from "node-fetch";
import * as sinon from "sinon";
import { SampleApplicationTest, WebdaSampleApplication } from "../index.spec";
import { ServerStatus, WebdaServer } from "./http";
@suite
class WebdaServerTest {
  server: WebdaServer;
  port: number;
  badCheck: boolean = false;

  async init(deployment: string = undefined, startHttp: boolean = false) {
    await WebdaSampleApplication.load();
    WebdaSampleApplication.setCurrentDeployment(deployment);
    this.server = new WebdaServer(WebdaSampleApplication);
    await this.server.init();
    if (startHttp) {
      this.server.serve(this.port);
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
  async testIsDebug() {
    await WebdaSampleApplication.load();
    WebdaSampleApplication.setCurrentDeployment("Dev");
    this.server = new WebdaServer(WebdaSampleApplication);
    assert.strictEqual(this.server.isDebug(), false);
    this.server["devMode"] = true;
    assert.strictEqual(this.server.isDebug(), true);
    this.server["devMode"] = false;
    assert.strictEqual(this.server.isDebug(), false);
  }

  @test
  async testAlreadyBind() {
    const server = http.createServer(() => {}).listen(this.port);
    const logs = [];
    await WebdaSampleApplication.load();
    WebdaSampleApplication.setCurrentDeployment("Dev");
    this.server = new WebdaServer(WebdaSampleApplication);
    await this.server.init();
    const stub = sinon.stub(this.server, "log").callsFake((...args) => {
      logs.push(args);
    });
    // @ts-ignore
    this.server.serverStatus = ServerStatus.Starting;
    try {
      this.server.serve(this.port);
      await this.server.waitForStatus(ServerStatus.Stopped);
    } catch (err) {
      // ignore if failed
    }
    stub.restore();
    server.close();
    assert.deepStrictEqual(logs, [["ERROR", "listen EADDRINUSE: address already in use :::28080"]]);
  }

  @test
  async testSampleApplicationApi() {
    await this.init("Dev", true);
    const app = new SampleApplicationTest(`http://localhost:${this.port}`);
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
    const stub = sinon
      // @ts-ignore
      .stub(this.server.getService("CustomService"), "test")
      .callsFake(async () => {
        throw 404;
      });
    this.server.getRouter().removeRoute("/test");
    this.server.getRouter().addRoute("/test", {
      _method: async (ctx: HttpContext) => {
        await stub();
      },
      methods: ["GET"],
      executor: "CustomService"
    });
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 404);
    stub.callsFake(() => {
      throw new WebdaError.Redirect("Need Auth", "https://google.com");
    });
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" },
      redirect: "manual"
    });
    assert.strictEqual(res.status, 302);
    // Depending on node-fetch library the / will be appended or not to the url
    assert.ok(res.headers.get("Location")?.startsWith("https://google.com"));

    stub.callsFake(() => {
      throw new Error();
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
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });

    stub.restore();

    this.server.setDevMode(true);
    // @ts-ignore
    this.server._requestFilters = [
      {
        checkRequest: async () => false
      }
    ];
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    // Status should be the same for now
    assert.strictEqual(res.status, 403);
    // Remove request accept
    // @ts-ignore
    this.server._requestFilters = [];
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    // Status should be the same for now
    assert.strictEqual(res.status, 500);

    // @ts-ignore
    this.server.subnetChecker = createChecker(["127.0.0.2/32"]);
    res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 400);
  }

  async checkRequest(): Promise<boolean> {
    if (this.badCheck) {
      throw new Error("Unknown");
    }
    throw 410;
  }

  @test
  isInSubnet() {
    const checker = createChecker(["127.0.0.1/32"]);
    assert.strictEqual(checker("127.0.0.1"), true);
    assert.strictEqual(checker("::ffff:127.0.0.1"), true);
    assert.strictEqual(checker("127.0.0.2"), false);
    assert.strictEqual(checker("192.168.0.2"), false);
  }

  @test
  async testSampleApplicationStatic() {
    await this.init("Production", true);
    const app = new SampleApplicationTest(`http://localhost:${this.port}`);
    await app.testStatic();
    const stub = sinon.stub(this.server, "newContext").callsFake(() => {
      throw new Error("Bad context");
    });
    let res = await fetch(`http://localhost:${this.port}/test`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 500);
    stub.restore();
    const resourceService = new ResourceService(this.server, "static", {
      folder: "test"
    });
    // @ts-ignore
    this.server.resourceService = resourceService;
    const stub2 = sinon.stub(resourceService, "_serve").callsFake(() => {
      throw 409;
    });
    res = await fetch(`http://localhost:${this.port}/index.html`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" },
      method: "PUT"
    });
    assert.strictEqual(res.status, 404);
    res = await fetch(`http://localhost:${this.port}/index.html`, {
      headers: { origin: "bouzouf", "x-forwarded-port": "443" }
    });
    assert.strictEqual(res.status, 409);
    stub2.callsFake(() => {
      throw new Error("Random");
    });
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
    const ctx = await this.server.newWebContext(new HttpContext("test.webda.io", "GET", "/"));
    ctx.setFlushedHeaders();
    // Test we do not double flush headers
    this.server.flushHeaders(ctx);
    // Test the catch
    ctx.setFlushedHeaders(false);
    // @ts-ignore
    ctx.getStream = () => {
      return {
        setHeader: () => {
          throw new Error("Plop");
        }
      };
    };
    this.server.flushHeaders(ctx);
  }

  @test
  async stop() {
    await this.init("Dev", true);
    const stub = sinon.stub(this.server, "waitForStatus").callsFake(async () => {});
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
    await assert.rejects(() => this.server.serve(this.port), TypeError);
    assert.strictEqual(this.server.getServerStatus(), ServerStatus.Stopped);
  }
}
