import * as assert from "assert";
import * as fs from "fs";
import { suite, test } from "@testdeck/mocha";
import * as fetch from "node-fetch";
import { WebdaSampleApplication } from "../index.spec";
import { WebdaConfiguration } from "./config";
import { ServerStatus } from "./http";
import { FileUtils } from "@webda/core";

const DEFAULT_CONFIG_HOST = "http://localhost:18181";

@suite
class WebdaConfigurationServerTest {
  server: WebdaConfiguration;

  async init(deployment: string = undefined) {
    await WebdaSampleApplication.load();
    WebdaSampleApplication.setCurrentDeployment(deployment);
    this.server = new WebdaConfiguration(WebdaSampleApplication);
    await this.server.init();
    this.server.serve();
    await this.server.waitForStatus(ServerStatus.Started);
  }

  async before() {
    await this.init(undefined);
  }

  async after() {
    if (!this.server) {
      return;
    }
    try {
      await this.server.stop();
    } catch (err) {}
    this.server = undefined;
  }

  async fetch(path: string = "/", options: any = {}): Promise<any> {
    let res = await fetch(`http://localhost:18181${path}`, {
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
    res.parameters.sessionSecret = "PLOP";
    let cfg = FileUtils.load(WebdaSampleApplication.configurationFile);
    delete res.cachedModules;
    cfg.parameters = {
      sessionSecret: "PLOP",
      import1: true,
      import2: true
    };
    cfg.imports = ["./webda.import.jsonc", "./webda.import2.jsonc"];
    assert.deepStrictEqual(res, cfg);
    res = await this.fetch("/configuration", { method: "PUT" });
  }

  @test
  async checkRequest() {
    // Will config.webda.io will host later on the configuration tool
    let res = await this.fetch(`/configuration`, {
      headers: {
        Origin: "https://config.webda.io"
      }
    });
    assert.strictEqual(res.status, 401);
  }

  @test
  async testNpm() {
    let res = await this.fetch("/npm", { method: "POST" });
  }

  @test
  async testApplicationApi() {
    let res = await this.fetch("/application");
  }

  @test
  async testWebdaApi() {
    let res = await this.fetch("/webda");
  }
}
