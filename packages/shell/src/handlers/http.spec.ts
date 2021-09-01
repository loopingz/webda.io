import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as fetch from "node-fetch";
import { SampleApplicationTest, WebdaSampleApplication } from "../index.spec";
import { ServerStatus, WebdaServer } from "./http";
import * as sinon from "sinon";
import { createImportSpecifier, textChangeRangeIsUnchanged } from "typescript";
@suite
class WebdaServerTest {
  server: WebdaServer;
  port: number;

  async init(deployment: string = undefined, startHttp: boolean = false, websockets: boolean = false) {
    WebdaSampleApplication.loadModules();
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
    stub.restore();
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
    // Test SIGINT
    this.server.onSIGINT();
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
    WebdaSampleApplication.loadModules();
    WebdaSampleApplication.setCurrentDeployment("Dev");
    this.server = new WebdaServer(WebdaSampleApplication);
    await this.server.init();
    sinon.stub(this.server, "getGlobalParams").callsFake(() => {
      throw new Error("Not OK");
    });
    await assert.rejects(() => this.server.serve(this.port, false), /Not OK/);
    assert.strictEqual(this.server.getServerStatus(), ServerStatus.Stopped);
  }
}
