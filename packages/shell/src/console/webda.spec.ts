"use strict";
import * as assert from "assert";
import * as fs from "fs";
import { suite, test } from "@testdeck/mocha";
import * as fetch from "node-fetch";
import * as path from "path";
import { ServerStatus } from "../handlers/http";
import { SampleApplicationTest, WebdaSampleApplication } from "../index.spec";
import { DebuggerStatus, WebdaConsole } from "./webda";
import { MemoryLogger, WorkerOutput } from "@webda/workout";
import { FileUtils, Logger, Module, WebdaError } from "@webda/core";

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
    assert.notStrictEqual(config, undefined);
    assert.strictEqual(config.parameters.accessKeyId, "DEV_ACCESS");
    assert.strictEqual(config.services.contacts.table, "dev-table");
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
    assert.strictEqual(WebdaConsole.webda.getServerStatus(), ServerStatus.Started);
    let app = new SampleApplicationTest(`http://localhost:28080`);
    await app.testApi();
    await WebdaConsole.webda.stop();
    this.commandLine(`serve --port 28081`);
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
    this.commandLine(
      `debug -d Dev --bind=127.0.0.1 --logLevel=INFO --logLevels=ERROR,WARN,INFO,DEBUG,TRACE --port 28080`
    );
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
    await app.testApi(200);
    let p = this.waitForStatus(DebuggerStatus.Launching);
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
      console.log("Waiting for Launching");
      await p;
      console.log("Waiting for Serving");
      await this.waitForStatus(DebuggerStatus.Serving);
    } catch (err) {
      // Skip error on timeout
    }
    console.log("Test new route");
    try {
      let res = await fetch(`http://localhost:28080/myNewRoute`);
      assert.strictEqual(res.status, 200);
    } catch (err) {
      // Skip this part on Travis and GitHub actions for now
      if (!process.env.TRAVIS && !process.env.CI) {
        throw err;
      }
    }
    fs.unlinkSync(this.dynamicFile);
  }

  @test
  async serviceconfigCommandLine() {
    await this.commandLine("serviceconfig CustomService");
    let logs = this.logger.getLogs();
    assert.strictEqual(logs.length, 1);
    assert.notStrictEqual(
      logs[0].log.args[0].match(/[\w\W]*"sessionSecret":[\w\W]*"type": "Beans\/CustomService"[\w\W]*/gm),
      undefined
    );
    await this.commandLine("serviceconfig UnknownService");
    logs = this.logger.getLogs();
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].log.args[0], "\u001b[31mThe service UnknownService is missing\u001b[39m");
  }

  @test
  async workerCommandLine() {
    this.logger.setLogLevel("TRACE");
    // Test launch aswell
    await this.commandLine("launch CustomService");
    let logs = this.logger.getLogs();
    let ind = logs.length - 2;

    assert.strictEqual(logs[ind].log.args.length, 1);
    assert.strictEqual(logs[ind].log.args[0], "Result: void");
    ind++;
    assert.strictEqual(logs[ind].log.args.length, 2);
    assert.strictEqual(logs[ind].log.args[0], "Took");

    this.logger.setLogLevel("INFO");
    await this.commandLine("launch CustomService output DEBUG_MSG");
    logs = this.logger.getLogs();
    assert.strictEqual(logs[0].log.args.length, 1);
    assert.strictEqual(logs[0].log.args[0], "YOUR MESSAGE IS 'DEBUG_MSG'");
    await this.commandLine("launch CustomService badMethod");
    logs = this.logger.getLogs();
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].log.args[0], "An error occured");
    await this.commandLine("launch CustomService unknownMethod");
    logs = this.logger.getLogs();
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].log.args[0], "The method unknownMethod is missing in service CustomService");
    await this.commandLine("launch UnknownService");
    logs = this.logger.getLogs();
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].log.args[0], "The service UnknownService is missing");
  }

  @test
  async generateSecret() {
    let info = WebdaSampleApplication.getConfiguration();
    await this.commandLine("generate-session-secret");
    let file = JSON.parse(
      fs.readFileSync(path.join(WebdaSampleApplication.getAppPath(), "webda.config.json")).toString()
    );
    assert.notStrictEqual(info.parameters.sessionSecret, file.parameters.sessionSecret);
    fs.writeFileSync(
      path.join(WebdaSampleApplication.getAppPath(), "webda.config.json"),
      JSON.stringify(info, undefined, 2)
    );
  }

  @test
  async generateModule() {
    let moduleFile = path.join(WebdaSampleApplication.getAppPath(), "webda.module.json");
    if (fs.existsSync(moduleFile)) {
      fs.unlinkSync(moduleFile);
    }
    await this.commandLine(`module`);
    assert.strictEqual(fs.existsSync(moduleFile), true);
    let module: Module = JSON.parse(fs.readFileSync(moduleFile).toString());
    assert.strictEqual(Object.keys(module.schemas).length, 3);
    assert.deepStrictEqual(module.schemas["WebdaDemo/CustomDeployer"], { title: "CustomDeployer" });
    assert.notStrictEqual(module.schemas["WebdaDemo/CustomReusableService"], undefined);
    assert.notStrictEqual(module.schemas["WebdaDemo/Contact"], undefined);
  }

  @test
  async unknownCommandDisplayHelp() {
    let fallback = false;
    WebdaConsole.help = () => {
      fallback = true;
    };
    await this.commandLine("--noCompile bouzouf", true);
    assert.strictEqual(fallback, true);
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
    assert.strictEqual(fs.existsSync("./openapi.json"), true);
    let def = JSON.parse(fs.readFileSync("./openapi.json").toString());
    assert.notStrictEqual(def.paths["/test"], undefined);
    assert.notStrictEqual(def.paths["/msg/{msg}"], undefined);
    WebdaConsole.webda.reinitResolvedRoutes();
    await this.commandLine(`-d Dev openapi myopenapi.yml`);
    assert.strictEqual(fs.existsSync("./myopenapi.yml"), true);
    assert.deepStrictEqual(FileUtils.load("./myopenapi.yml"), def);
    WebdaConsole.webda.reinitResolvedRoutes();
    await this.commandLine(`-d Dev openapi myopenapi.yaml`);
    assert.strictEqual(fs.existsSync("./myopenapi.yaml"), true);
    assert.strictEqual(fs.readFileSync("./myopenapi.yaml").toString(), fs.readFileSync("./myopenapi.yml").toString());
  }

  @test
  utilsCov() {
    assert.notStrictEqual(WebdaConsole.getVersion().match(/\d+\.\d+\.\d+(-.*)?/), undefined);
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
    assert.strictEqual(res, -1);
    let logs = this.logger.getLogs();
    assert.strictEqual(logs[0].log.args[0], "Unknown deployment: TestLambda");
  }

  @test
  async types() {
    await this.commandLine("types");
    let logs = this.logger.getLogs();
    assert.strictEqual(logs.length, 3, "We should have 3 logs with Deployers, Services, Models");
  }

  @test
  withinPatchRange() {
    assert.strictEqual(WebdaConsole.withinPatchVersion("1.1.1", "1.1.2"), true);
    assert.strictEqual(WebdaConsole.withinPatchVersion("1.1.3", "1.1.2"), true);
    assert.strictEqual(WebdaConsole.withinPatchVersion("1.2.1", "1.1.2"), false);
    assert.strictEqual(WebdaConsole.withinPatchVersion("1.2.1", "1.3.2"), false);
    assert.strictEqual(WebdaConsole.withinPatchVersion("1.2.1", "2.2.1"), false);
    assert.strictEqual(WebdaConsole.withinPatchVersion("1.2.1", "0.1.2"), false);
    assert.strictEqual(WebdaConsole.withinPatchVersion("1.2.1-beta", "1.1.2"), false);
  }

  @test
  async configurationSchema() {
    const f = "./myschemacfg.json";
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
    await this.commandLine("configuration-schema myschemacfg.json");
    assert.strictEqual(true, fs.existsSync(f));
    assert.strictEqual(true, fs.existsSync(".webda-deployment-schema.json"));
  }

  @test
  async schema() {
    const f = "./authentication.json";
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
    await this.commandLine("schema Authentication authentication.json");
    assert.strictEqual(true, fs.existsSync(f));
  }

  @test
  async initLogger() {
    process.env["LOG_LEVEL"] = "INFO";
    // @ts-ignore
    await WebdaConsole.initLogger({ logLevel: "TRACE" });
    assert.strictEqual(process.env["LOG_LEVEL"], "TRACE");
  }

  /*
  @test
  async fakeTerm() {
    WebdaConsole.fakeTerm();
    await new Promise<void>((resolve) => {
        
      setTimeout(() => {
        WebdaConsole.app.getWorkerOutput().returnInput("", "1");
      }, 150);
      setTimeout(() => {
        WebdaConsole.app.getWorkerOutput().returnInput("", "0");
        resolve();
      }, 250);

    })
  }
  */
}
