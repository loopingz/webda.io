"use strict";
import * as Webda from "@webda/core";
import * as assert from "assert";
import * as fs from "fs";
import { suite, test } from "mocha-typescript";
import * as path from "path";
import { WebdaSampleApplication } from "../index.spec";
import WebdaConsole from "./webda";

@suite
class ConsoleTest {
  logger: Webda.MemoryLogger;
  async commandLine(line, addAppPath: boolean = true) {
    this.logger = new Webda.MemoryLogger(undefined, "MemoryLogger", {
      logLevels: "CONSOLE,ERROR,WARN,INFO,DEBUG,TRACE",
      logLevel: "WARN"
    });
    if (addAppPath) {
      line = `--appPath ${WebdaSampleApplication.getAppPath()} ` + line;
    }
    WebdaConsole.logger = this.logger;
    await WebdaConsole.handleCommand(line.split(" "));
  }

  checkTestDeploymentConfig(config) {
    assert.notEqual(config, undefined);
    assert.equal(config.parameters.accessKeyId, "DEV_ACCESS");
    assert.equal(config.services.store.table, "dev-table");
  }

  @test
  help() {
    this.commandLine("--noCompile help", false);
  }

  @test
  async serve() {
    // TODO
    /*
    this.commandLine(`serve -d Dev`);
    for (let i = 0; i < 100; i++) {
      if (WebdaConsole.webda) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await WebdaConsole.webda.waitForStatus(ServerStatus.Started);
    assert.equal(status, ServerStatus.Started);
    let app = new SampleApplicationTest(`http://localhost:18080`);
    await app.testApi();
    await WebdaConsole.webda.stop();
    */
  }

  @test
  async serviceconfig() {}

  @test
  async worker() {
    // Test launch aswell
  }

  @test
  async generateSecret() {
    let info = WebdaSampleApplication.getConfiguration();
    await this.commandLine("generate-session-secret");
    let file = JSON.parse(
      fs
        .readFileSync(
          path.join(WebdaSampleApplication.getAppPath(), "webda.config.json")
        )
        .toString()
    );
    assert.notEqual(
      info.parameters.sessionSecret,
      file.parameters.sessionSecret
    );
  }

  @test
  async genrateModule() {
    let moduleFile = path.join(
      WebdaSampleApplication.getAppPath(),
      "webda.module.json"
    );
    if (fs.existsSync(moduleFile)) {
      fs.unlinkSync(moduleFile);
    }
    await this.commandLine(`module`);
    assert.equal(fs.existsSync(moduleFile), true);
  }

  @test
  async unknownCommandDisplayHelp() {
    let fallback = false;
    WebdaConsole.help = () => {
      fallback = true;
    };
    await this.commandLine("--noCompile bouzouf", true);
    assert.equal(fallback, true);
  }

  @test
  async exporter() {
    await this.commandLine(`-d Dev --noCompile config test.exports.json`);
    this.checkTestDeploymentConfig(
      JSON.parse(fs.readFileSync("test.exports.json").toString())
    );
  }

  @test
  async exporterNoFile() {
    await this.commandLine(`-d Dev --noCompile config`);
    //checkTestDeploymentConfig(JSON.parse(output));
  }

  @test
  async exporterBadDeployment() {
    await this.commandLine("-d TestLambda config test.export.json");
    assert.equal(
      this.logger.getLogs()[0].args[0],
      "Unknown deployment: TestLambda"
    );
  }
}
