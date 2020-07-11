"use strict";
import * as Webda from "@webda/core";
import * as assert from "assert";
import * as fs from "fs";
import { suite, test } from "@testdeck/mocha";
import * as fetch from "node-fetch";
import * as path from "path";
import * as YAML from "yamljs";
import { ServerStatus } from "../handlers/http";
import { SampleApplicationTest, WebdaSampleApplication } from "../index.spec";
import { DebuggerStatus, WebdaConsole } from "./webda";
import { MemoryLogger, WorkerOutput } from "@webda/workout";
import { Logger, WebdaError } from "@webda/core";

class DebugLogger extends MemoryLogger {
  getLogs(start: number = 0) {
    let res = super.getLogs().slice(start);
    this.clear();
    return res;
  }
}

@suite
class ConsoleTest {
  logger: DebugLogger;
  dynamicFile: string;
  workerOutput: WorkerOutput;
  async commandLine(line, addAppPath: boolean = true) {
    if (addAppPath) {
      line = `--appPath ${WebdaSampleApplication.getAppPath()} ` + line;
    }
    line = "--notty " + line;
    return await WebdaConsole.handleCommand(
      line.split(" "),
      { core: { path: "", version: "1.0.0", type: "" }, shell: { path: "", version: "1.0.0", type: "" } },
      this.workerOutput
    );
  }

  checkTestDeploymentConfig(config) {
    assert.notEqual(config, undefined);
    assert.equal(config.parameters.accessKeyId, "DEV_ACCESS");
    assert.equal(config.services.contacts.table, "dev-table");
  }

  async before() {
    let dynamicFile = path.join(WebdaSampleApplication.getAppPath(), "src", "services", "dynamic.ts");
    if (fs.existsSync(dynamicFile)) {
      fs.unlinkSync(dynamicFile);
    }
    this.dynamicFile = dynamicFile;
    this.workerOutput = new WorkerOutput();
    WebdaConsole.logger = new Logger(this.workerOutput, "webda/console");
    this.logger = new DebugLogger(this.workerOutput, "INFO");
  }

  async after() {
    if (WebdaConsole.webda) {
      await WebdaConsole.webda.stop();
    }
    await WebdaConsole.stopDebugger();
  }

  @test
  async help() {
    await this.commandLine("--noCompile help");
  }

  @test
  async serveCommandLine() {
    this.commandLine(`serve -d Dev --port 28080`);
    for (let i = 0; i < 100; i++) {
      if (WebdaConsole.webda) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await WebdaConsole.webda.waitForStatus(ServerStatus.Started);
    assert.equal(WebdaConsole.webda.getServerStatus(), ServerStatus.Started);
    let app = new SampleApplicationTest(`http://localhost:28080`);
    await app.testApi();
    await WebdaConsole.webda.stop();
  }

  /**
   * Wait for the server to be in a desired state
   *
   * @param status to wait for
   * @param timeout max number of ms to wait for
   */
  async waitForStatus(status: DebuggerStatus, timeout: number = 120000) {
    let time = 0;
    do {
      let currentStatus = WebdaConsole.getDebuggerStatus();
      console.log("Status:", currentStatus, "required", status);
      if (currentStatus === status) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      time += 1000;
      if (timeout < time) {
        throw new WebdaError("WAIT_FOR_TIMEOUT", "Timeout");
      }
    } while (true);
  }

  @test
  async debugCommandLine() {
    WebdaSampleApplication.clean();
    console.log("Launch debug command line");
    this.commandLine(`debug -d Dev --port 28080`);
    for (let i = 0; i < 100; i++) {
      if (WebdaConsole.webda) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log("Wait for serving");
    await this.waitForStatus(DebuggerStatus.Serving);
    let app = new SampleApplicationTest(`http://localhost:28080`);
    // CSRF is disabled by default in debug mode
    console.log("test API");
    await app.testApi(200);
    // Add a new .ts
    fs.writeFileSync(
      this.dynamicFile,
      `import { Context, Route, Service } from "@webda/core";

class DynamicService extends Service {
    @Route("/myNewRoute", ["GET"])
    test(ctx: Context) {
        ctx.write("Debugger Rox!");
    }
}
      
`
    );
    try {
      console.log("Pausing 5s to let fs react");
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log("Waiting for Launching");
      await this.waitForStatus(DebuggerStatus.Launching);
      console.log("Waiting for Serving");
      await this.waitForStatus(DebuggerStatus.Serving);
    } catch (err) {
      // Skip error on timeout
    }
    console.log("Test new route");
    try {
      let res = await fetch(`http://localhost:28080/myNewRoute`);
      assert.equal(res.status, 200);
    } catch (err) {
      // Skip this part on Travis for now
      if (!process.env.TRAVIS) {
        throw err;
      }
    }
    fs.unlinkSync(this.dynamicFile);
  }

  @test
  async serviceconfigCommandLine() {
    await this.commandLine("serviceconfig CustomService");
    let logs = this.logger.getLogs();
    assert.equal(logs.length, 1);
    assert.notEqual(
      logs[0].log.args[0].match(/[\w\W]*"sessionSecret":[\w\W]*"type": "Beans\/CustomService"[\w\W]*/gm),
      undefined
    );
    await this.commandLine("serviceconfig UnknownService");
    logs = this.logger.getLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].log.args[0], "\u001b[31mThe service UnknownService is missing\u001b[39m");
  }

  @test
  async workerCommandLine() {
    this.logger.setLogLevel("TRACE");
    // Test launch aswell
    await this.commandLine("launch CustomService");
    let logs = this.logger.getLogs();
    let ind = logs.length - 2;

    assert.equal(logs[ind].log.args.length, 1);
    assert.equal(logs[ind].log.args[0], "Result: void");
    ind++;
    assert.equal(logs[ind].log.args.length, 2);
    assert.equal(logs[ind].log.args[0], "Took");

    this.logger.setLogLevel("INFO");
    await this.commandLine("worker CustomService output DEBUG_MSG");
    logs = this.logger.getLogs();
    assert.equal(logs[0].log.args.length, 1);
    assert.equal(logs[0].log.args[0], "YOUR MESSAGE IS 'DEBUG_MSG'");
    await this.commandLine("worker CustomService badMethod");
    logs = this.logger.getLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].log.args[0], "An error occured");
    await this.commandLine("worker CustomService unknownMethod");
    logs = this.logger.getLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].log.args[0], "The method unknownMethod is missing in service CustomService");
    await this.commandLine("worker UnknownService");
    logs = this.logger.getLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].log.args[0], "The service UnknownService is missing");
  }

  @test
  async generateSecret() {
    let info = WebdaSampleApplication.getConfiguration();
    await this.commandLine("generate-session-secret");
    let file = JSON.parse(
      fs.readFileSync(path.join(WebdaSampleApplication.getAppPath(), "webda.config.json")).toString()
    );
    assert.notEqual(info.parameters.sessionSecret, file.parameters.sessionSecret);
  }

  @test
  async generateModule() {
    let moduleFile = path.join(WebdaSampleApplication.getAppPath(), "webda.module.json");
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
  async openapiCommandLine() {
    ["./openapi.json", "./myopenapi.yml", "./myopenapi.yaml"].forEach(f => {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    });

    WebdaConsole.webda.reinitResolvedRoutes();
    await this.commandLine(`-d Dev openapi`, true);
    assert.equal(fs.existsSync("./openapi.json"), true);
    let def = JSON.parse(fs.readFileSync("./openapi.json").toString());
    assert.notEqual(def.paths["/test"], undefined);
    assert.notEqual(def.paths["/msg/{msg}"], undefined);
    WebdaConsole.webda.reinitResolvedRoutes();
    await this.commandLine(`-d Dev openapi myopenapi.yml`);
    assert.equal(fs.existsSync("./myopenapi.yml"), true);
    assert.deepEqual(YAML.parse(fs.readFileSync("./myopenapi.yml").toString()), def);
    WebdaConsole.webda.reinitResolvedRoutes();
    await this.commandLine(`-d Dev openapi myopenapi.yaml`);
    assert.equal(fs.existsSync("./myopenapi.yaml"), true);
    assert.equal(fs.readFileSync("./myopenapi.yaml").toString(), fs.readFileSync("./myopenapi.yml").toString());
    await this.commandLine(`-d Dev openapi myopenapi.txt`);
  }

  @test
  utilsCov() {
    assert.notEqual(WebdaConsole.getVersion().match(/\d+\.\d+\.\d+(-.*)?/), undefined);
  }

  @test
  async exporter() {
    await this.commandLine(`-d Dev --noCompile config test.exports.json`);
    this.checkTestDeploymentConfig(JSON.parse(fs.readFileSync("test.exports.json").toString()));
  }

  @test
  async exporterNoFile() {
    await this.commandLine(`-d Dev --noCompile config`);
    //checkTestDeploymentConfig(JSON.parse(output));
  }

  @test
  async exporterBadDeployment() {
    let res = await this.commandLine("-d TestLambda config test.export.json");
    assert.equal(res, -1);
    let logs = this.logger.getLogs();
    assert.equal(logs[0].log.args[0], "Unknown deployment: TestLambda");
  }
}
