import * as assert from "assert";
import * as fs from "fs";
import { suite, test } from "mocha-typescript";
import * as fetch from "node-fetch";
import { WebdaSampleApplication } from "../index.spec";
import { WebdaConfiguration } from "./config";
import { ServerStatus } from "./http";

const DEFAULT_CONFIG_HOST = "http://localhost:18181";

@suite
class WebdaConfigurationServerTest {
  server: WebdaConfiguration;

  async init(deployment: string = undefined) {
    WebdaSampleApplication.loadModules();
    WebdaSampleApplication.setCurrentDeployment(deployment);
    this.server = new WebdaConfiguration(WebdaSampleApplication);
    await this.server.init();
    this.server.serve();
    await this.server.waitForStatus(ServerStatus.Started);
  }

  async before() {
    this.init(undefined);
  }

  async after() {
    if (!this.server) {
      return;
    }
    await this.server.stop();
    this.server = undefined;
  }

  async fetch(path: string = "/", options: any = {}): Promise<any> {
    let res = await fetch(`http://localhost:18181${path}`, {
      ...options,
      headers: {
        Host: "localhost",
        Origin: "http://localhost:18181",
        ...options.headers
      }
    });
    console.log(res.status, res.headers);
    if (res.status < 300 && res.status >= 200 && res.headers.get("content-type") === "application/json") {
      return await res.json();
    }
    return res;
  }

  @test
  async testConfigurationApi() {
    let res = await this.fetch("/configuration");
    res.parameters.sessionSecret = "PLOP";
    let cfg = JSON.parse(fs.readFileSync(WebdaSampleApplication.getAppPath("/webda.config.json")).toString());
    cfg.parameters.sessionSecret = "PLOP";
    assert.equal(JSON.stringify(res), JSON.stringify(cfg));
  }

  @test
  async testApplicationApi() {
    let res = await this.fetch("/application");
    console.log(res);
  }

  @test
  async testWebdaApi() {
    let res = await this.fetch("/webda");
    console.log(res);
  }
}
