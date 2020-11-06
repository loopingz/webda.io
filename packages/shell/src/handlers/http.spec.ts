import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as fetch from "node-fetch";
import { SampleApplicationTest, WebdaSampleApplication } from "../index.spec";
import { ServerStatus, WebdaServer } from "./http";

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
    await this.server.stop();
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
      headers: { origin: "bouzouf" }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Access-Control-Allow-Origin"), "bouzouf");
    assert.strictEqual(await res.text(), "Tested");
  }

  @test
  async testSampleApplicationStatic() {
    await this.init("Production", true, true);
    let app = new SampleApplicationTest(`http://localhost:${this.port}`);
    await app.testStatic();
  }
}
