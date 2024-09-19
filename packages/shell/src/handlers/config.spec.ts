import { suite, test } from "@testdeck/mocha";
import { FileUtils } from "@webda/core";
import * as assert from "assert";
import fetch from "node-fetch";
import { WebdaSampleApplication } from "../index.spec";
import { WebdaConfiguration } from "./config";
import { ServerStatus } from "./http";

const DEFAULT_CONFIG_HOST = "http://localhost:18181";

@suite
class WebdaConfigurationServerTest {
  server: WebdaConfiguration;

  async init(deployment: string = undefined) {
    await WebdaSampleApplication.load();
    WebdaSampleApplication.setCurrentDeployment(deployment);
    this.server = new WebdaConfiguration(WebdaSampleApplication);
    await this.server.init();
    this.server.serve().catch(console.error);
    console.log(new Date(), "Waiting for server to start");
    await this.server.waitForStatus(ServerStatus.Started);
    console.log(new Date(), "Server started");
  }

  async before() {
    await this.init(undefined);
  }

  async after() {
    if (!this.server) {
      return;
    }
    try {
      console.log(new Date(), "Stopping server");
      await this.server.stop();
      console.log(new Date(), "Server stopped");
    } catch (err) {}
    this.server = undefined;
  }

  async fetch(path: string = "/", options: any = {}): Promise<any> {
    const res = await fetch(`http://localhost:18181${path}`, {
      ...options,
      headers: {
        Host: "localhost",
        Origin: "localhost:18181",
        ...options.headers
      }
    });
    if (res.status < 300 && res.status >= 200 && res.headers.get("content-type") === "application/json") {
      return await res.json();
    }
    return res;
  }

  @test
  async testConfigurationApi() {
    let res = await this.fetch("/configuration");
    const cfg = FileUtils.load(WebdaSampleApplication.configurationFile);
    delete res.cachedModules;
    cfg.parameters = {
      import1: true,
      import2: true,
      trustedProxies: "127.0.0.1, ::1"
    };
    cfg.imports = ["./webda.import.jsonc", "./webda.import2.jsonc"];
    assert.deepStrictEqual(res, cfg);
    res = await this.fetch("/configuration", { method: "PUT" });
    assert.throws(() => this.server.getModel("unknown"), /Undefined model/);
  }

  @test
  async checkRequest() {
    console.log(new Date(), "Fetching /configuration");
    // Will config.webda.io will host later on the configuration tool
    const res = await this.fetch(`/configuration`, {
      headers: {
        Origin: "https://config.webda.io"
      }
    });
    console.log(new Date(), "Fetched with", res.status);
    assert.strictEqual(res.status, 401);
  }

  @test
  async testNpm() {
    const res = await this.fetch("/npm", { method: "POST" });
  }

  @test
  async testApplicationApi() {
    const res = await this.fetch("/application");
  }

  @test
  async testWebdaApi() {
    const res = await this.fetch("/webda");
  }
}
