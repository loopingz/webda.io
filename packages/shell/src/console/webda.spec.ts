"use strict";
import * as Webda from "@webda/core";
import * as assert from "assert";
import * as fs from "fs";
import { suite, test } from "mocha-typescript";
import * as fetch from "node-fetch";
import * as path from "path";
import * as YAML from "yamljs";
import { ServerStatus } from "../handlers/http";
import { SampleApplicationTest, WebdaSampleApplication } from "../index.spec";
import { DebuggerStatus, WebdaConsole } from "./webda";

class DebugLogger extends Webda.MemoryLogger {
  log(level: any, ...args) {
    super.log(level, ...args);
    if (this._params.displayLog) {
      console.log(level, ...args);
    }
  }
}

@suite
class ConsoleTest {
  logger: Webda.MemoryLogger;
  async commandLine(
    line,
    addAppPath: boolean = true,
    displayLog: boolean = false
  ) {
    this.logger = new DebugLogger(undefined, "MemoryLogger", {
      logLevels: "CONSOLE,ERROR,WARN,INFO,DEBUG,TRACE",
      logLevel: "WARN",
      displayLog
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
      if (WebdaConsole.getDebuggerStatus() === status) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      time += 1000;
      if (timeout < time) {
        throw new Error("Timeout");
      }
    } while (true);
  }

  @test
  async debugCommandLine() {
    WebdaSampleApplication.clean();
    let dynamicFile = path.join(
      WebdaSampleApplication.getAppPath(),
      "src",
      "services",
      "dynamic.ts"
    );
    if (fs.existsSync(dynamicFile)) {
      fs.unlinkSync(dynamicFile);
    }
    this.commandLine(`debug -d Dev --port 28080`);
    for (let i = 0; i < 100; i++) {
      if (WebdaConsole.webda) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await this.waitForStatus(DebuggerStatus.Serving);
    let app = new SampleApplicationTest(`http://localhost:28080`);
    // CSRF is disabled by default in debug mode
    await app.testApi(200);
    // Add a new .ts
    fs.writeFileSync(
      dynamicFile,
      `import { Context, Route, Service } from "@webda/core";

class DynamicService extends Service {
    @Route("/myNewRoute", ["GET"])
    test(ctx: Context) {
        ctx.write("Debugger Rox!");
    }
}
      
`
    );
    await this.waitForStatus(DebuggerStatus.Launching);
    await this.waitForStatus(DebuggerStatus.Serving);
    let res = await fetch(`http://localhost:28080/myNewRoute`);
    assert.equal(res.status, 200);
  }

  @test
  async serviceconfigCommandLine() {
    await this.commandLine("serviceconfig CustomService");
    let logs = this.logger.getLogs();
    logs = this.logger.getLogs();
    assert.equal(logs.length, 1);
    assert.notEqual(
      logs[0].args[0].match(
        /[\w\W]*"sessionSecret":[\w\W]*"type": "Beans\/CustomService"[\w\W]*/gm
      ),
      undefined
    );
    await this.commandLine("serviceconfig UnknownService");
    logs = this.logger.getLogs();
    assert.equal(logs.length, 1);
    assert.equal(
      logs[0].args[0],
      "\u001b[31mThe service UnknownService is missing\u001b[39m"
    );
  }

  @test
  async workerCommandLine() {
    // Test launch aswell
    await this.commandLine("launch CustomService");
    let logs = this.logger.getLogs();
    assert.equal(logs.length, 2);
    assert.equal(logs[0].args.length, 2);
    assert.equal(logs[0].args[0], "Result:");
    assert.equal(logs[1].args.length, 2);
    assert.equal(logs[1].args[0], "Took");
    await this.commandLine("worker CustomService output DEBUG_MSG");
    logs = this.logger.getLogs();
    assert.equal(logs[0].args.length, 2);
    assert.equal(logs[0].args[0], "Result:");
    assert.equal(logs[0].args[1], "YOUR MESSAGE IS 'DEBUG_MSG'");
    assert.equal(logs[1].args.length, 2);
    assert.equal(logs[1].args[0], "Took");
    await this.commandLine("worker CustomService badMethod");
    logs = this.logger.getLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].args[0], "\u001b[31mAn error occured\u001b[39m");
    await this.commandLine("worker CustomService unknownMethod");
    logs = this.logger.getLogs();
    assert.equal(logs.length, 1);
    assert.equal(
      logs[0].args[0],
      "\u001b[31mThe method unknownMethod is missing in service CustomService\u001b[39m"
    );
    await this.commandLine("worker UnknownService");
    logs = this.logger.getLogs();
    assert.equal(logs.length, 1);
    assert.equal(
      logs[0].args[0],
      "\u001b[31mThe service UnknownService is missing\u001b[39m"
    );
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
  async generateModule() {
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
  async swaggerCommandLine() {
    ["./swagger.json", "./myswagger.yml", "./myswagger.yaml"].forEach(f => {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    });

    WebdaConsole.webda.reinitResolvedRoutes();
    await this.commandLine(`-d Dev swagger`, true, true);
    assert.equal(fs.existsSync("./swagger.json"), true);
    let def = JSON.parse(fs.readFileSync("./swagger.json").toString());
    assert.notEqual(def.paths["/test"], undefined);
    assert.notEqual(def.paths["/msg/{msg}"], undefined);
    WebdaConsole.webda.reinitResolvedRoutes();
    await this.commandLine(`-d Dev swagger myswagger.yml`);
    assert.equal(fs.existsSync("./myswagger.yml"), true);
    assert.deepEqual(
      YAML.parse(fs.readFileSync("./myswagger.yml").toString()),
      def
    );
    WebdaConsole.webda.reinitResolvedRoutes();
    await this.commandLine(`-d Dev swagger myswagger.yaml`);
    assert.equal(fs.existsSync("./myswagger.yaml"), true);
    assert.equal(
      fs.readFileSync("./myswagger.yaml").toString(),
      fs.readFileSync("./myswagger.yml").toString()
    );
    await this.commandLine(`-d Dev swagger myswagger.txt`);
  }

  @test
  utilsCov() {
    assert.notEqual(
      WebdaConsole.getVersion().match(/\d+\.\d+\.\d+(-.*)?/),
      undefined
    );
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
