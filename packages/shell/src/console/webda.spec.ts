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
import { Application, FileUtils, JSONUtils, Logger, Module, WebdaError } from "@webda/core";
import * as sinon from "sinon";
import { SourceApplication } from "../code/sourceapplication";

class DebugLogger extends MemoryLogger {
  getLogs(start: number = 0) {
    let res = super.getLogs().slice(start);
    this.clear();
    return res;
  }
}

@suite
class ConsoleTest {
  static helpStub;
  logger: DebugLogger;
  dynamicFile: string;
  workerOutput: WorkerOutput;
  async commandLine(line, addAppPath: boolean = true, versions: any = undefined, logLevel: string = "ERROR") {
    if (addAppPath) {
      line = `--appPath ${WebdaSampleApplication.getAppPath()} ` + line;
    }
    versions ??= {
      "@webda/core": { path: "", version: "1.0.0", type: "" },
      "@webda/shell": { path: "", version: "1.0.0", type: "" }
    };
    line = `--notty --logLevel=${logLevel} ` + line;
    ConsoleTest.helpStub ??= sinon.stub(WebdaConsole, "displayHelp").callsFake(() => {});
    try {
      return await WebdaConsole.handleCommand(line.split(" "), versions, this.workerOutput);
    } finally {
      ConsoleTest.helpStub.restore();
      ConsoleTest.helpStub = undefined;
    }
  }

  checkTestDeploymentConfig(config) {
    assert.notStrictEqual(config, undefined);
    assert.strictEqual(config.parameters.accessKeyId, "DEV_ACCESS");
    assert.strictEqual(config.services.contacts.table, "dev-table");
  }

  async before() {
    let dynamicFile = path.join(WebdaSampleApplication.getAppPath(), "lib", "services", "dynamic.js");
    if (fs.existsSync(dynamicFile)) {
      fs.unlinkSync(dynamicFile);
    }
    dynamicFile = path.join(WebdaSampleApplication.getAppPath(), "src", "services", "dynamic.ts");
    if (fs.existsSync(dynamicFile)) {
      fs.unlinkSync(dynamicFile);
    }
    this.dynamicFile = dynamicFile;
    this.workerOutput = new WorkerOutput();
    WebdaConsole.logger = new Logger(this.workerOutput, "webda/console");
    WebdaConsole.webda = undefined;
    this.logger = new DebugLogger(this.workerOutput, "INFO");
    try {
      fs.mkdirSync(WebdaSampleApplication.getAppPath("node_modules/@webda"), { recursive: true });
      fs.symlinkSync(
        path.join(__dirname, "../../../aws"),
        WebdaSampleApplication.getAppPath("node_modules/@webda/aws")
      );
    } catch (err) {}
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

  async waitForInput(output: WorkerOutput): Promise<string> {
    let timeout = 100;
    while (!Object.keys(output.inputs).length) {
      await new Promise(resolve => process.nextTick(resolve));
      if (--timeout <= 0) {
        throw new Error("Wait for input timeout");
      }
    }
    return Object.keys(output.inputs).pop();
  }

  @test
  async newDeployment() {
    // Just to initiate it
    await this.commandLine("service-configuration Test");
    let output = WebdaConsole.app.getWorkerOutput();
    output.setInteractive(true);
    let deploymentPath = WebdaConsole.app.getAppPath("deployments/bouzouf.json");
    if (fs.existsSync(deploymentPath)) {
      fs.unlinkSync(deploymentPath);
    }
    await this.commandLine("new-deployment bouzouf");
    assert.ok(fs.existsSync(deploymentPath));

    // @ts-ignore
    let cl = this.commandLine("new-deployment");
    let input = await this.waitForInput(output);
    output.returnInput(input, "bouzouf");
    input = await this.waitForInput(output);
    output.returnInput(input, "bouzouf2");
    // Might want to sleep more
    await new Promise(resolve => process.nextTick(resolve));
    fs.unlinkSync(deploymentPath);
    deploymentPath = WebdaConsole.app.getAppPath("deployments/bouzouf2.json");
    assert.ok(fs.existsSync(deploymentPath));
    fs.unlinkSync(deploymentPath);
  }

  async waitForWebda() {
    for (let i = 0; i < 100; i++) {
      if (WebdaConsole.webda) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  @test
  async serveCommandLine() {
    this.commandLine(`serve -d Dev --port 28080`);
    await this.waitForWebda();
    await WebdaConsole.webda.waitForStatus(ServerStatus.Started);
    assert.strictEqual(WebdaConsole.webda.getServerStatus(), ServerStatus.Started);
    let app = new SampleApplicationTest(`http://localhost:28080`);
    await app.testApi();
    await WebdaConsole.webda.stop();
    this.commandLine(`serve --port 28081`);
    await WebdaConsole.webda.stop();
    let p = WebdaConsole.serve({ port: Math.floor(Math.random() * 10000 + 10000) });
    await p.cancel();
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
  async configurationWatch() {
    let file = WebdaConsole.app.deploymentFile;
    try {
      let file = WebdaConsole.app.deploymentFile;
      WebdaConsole.app.deploymentFile = null;
      WebdaConsole.configurationWatch(() => {}, "plop");
    } finally {
      WebdaConsole.app.deploymentFile = file;
    }
  }

  @test
  async debugCommandLine() {
    //WebdaSampleApplication.clean();
    this.commandLine(
      `debug -d Dev --bind=127.0.0.1 --logLevels=ERROR,WARN,INFO,DEBUG,TRACE --port 28080`,
      true,
      undefined,
      "INFO"
    );
    await this.waitForWebda();
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
    // Create a faulty one
    fs.writeFileSync(
      this.dynamicFile,
      `import { Context, Route, Service } from "@webda/core";

class DynamicService extend Service {
    @Route("/myNewRoute", ["GET"])
    test(ctx: Context) {
        ctx.write("Debugger Rox!");
    }
}
      
`
    );
    await new Promise(resolve => setTimeout(resolve, 2000));
    fs.unlinkSync(this.dynamicFile);
    let stub = sinon.stub(process, "exit").callsFake(() => {});
    try {
      WebdaConsole.onSIGINT();
      // @ts-ignore
      WebdaConsole.terminal = {
        close: () => {}
      };
      WebdaConsole.webda = {
        // @ts-ignore
        stop: () => {}
      };
      WebdaConsole.onSIGINT();
    } finally {
      stub.restore();
      WebdaConsole.terminal = undefined;
    }
  }

  @test
  async serviceconfigCommandLine() {
    await this.commandLine("service-configuration CustomService");
    let logs = this.logger.getLogs();
    assert.strictEqual(logs.length, 1);
    assert.notStrictEqual(
      logs[0].log.args[0].match(/[\w\W]*"sessionSecret":[\w\W]*"type": "Beans\/CustomService"[\w\W]*/gm),
      undefined
    );
    await this.commandLine("service-configuration UnknownService");
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
    let oldContent = fs.readFileSync(path.join(WebdaSampleApplication.getAppPath(), "webda.config.jsonc")).toString();
    await this.commandLine("generate-session-secret");
    let file = FileUtils.load(path.join(WebdaSampleApplication.getAppPath(), "webda.config.jsonc"));
    assert.notStrictEqual(info.parameters.sessionSecret, file.parameters.sessionSecret);
    fs.writeFileSync(path.join(WebdaSampleApplication.getAppPath(), "webda.config.jsonc"), oldContent);
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
    if (ConsoleTest.helpStub) {
      ConsoleTest.helpStub.restore();
    }
    ConsoleTest.helpStub = {
      restore: () => {}
    };
    let stub = sinon.stub(WebdaConsole, "parser").callsFake(async () => {
      const res = {
        showHelp: () => {
          fallback = true;
        },
        command: () => {
          return res;
        },
        parse: () => {
          return {
            _: []
          };
        }
      };
      return res;
    });
    try {
      await this.commandLine("--noCompile bouzouf", true);
      assert.strictEqual(fallback, true);
    } finally {
      stub.restore();
    }
  }

  @test
  async openapiCommandLine() {
    ["./openapi.json", "./myopenapi.yml", "./myopenapi.yaml"].forEach(f => {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    });
    // Just to initiate it
    await this.commandLine("service-configuration Test");
    await this.waitForWebda();
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
    // Send it to output
    await this.commandLine("schema Authentication");
  }

  @test
  async initLogger() {
    process.env["LOG_LEVEL"] = "INFO";
    // @ts-ignore
    await WebdaConsole.initLogger({ logLevel: "TRACE" });
    assert.strictEqual(process.env["LOG_LEVEL"], "TRACE");
  }

  @test
  async executeShellExtension() {
    // Create a fake js file
    let appPath = path.join(__dirname, "..", "..", "test", "fakeoldapp");
    let jsPath = path.join(appPath, "fake.js");
    let jsTerminalPath = path.join(appPath, "terminal.js");
    try {
      fs.mkdirSync(appPath, { recursive: true });
      fs.writeFileSync(
        jsPath,
        `module.exports = {
      default: (console, args) => {
        return "plop_" + args._.join("_")
      }
    }`
      );
      fs.writeFileSync(
        jsTerminalPath,
        `
class FakeTerminal {
  constructor(...args) {}
  close() {}
  setLogo() {}
  setDefaultLogo() {}
  getLogo() {return ["",""]}
}
module.exports = {
  default: FakeTerminal
}
      `
      );
      // Launch it
      assert.strictEqual(
        await WebdaConsole.executeShellExtension(
          {
            require: path.join(appPath, "fake.js"),
            description: ""
          },
          "",
          { _: [] }
        ),
        "plop_"
      );
      // Launch it
      assert.strictEqual(
        await WebdaConsole.executeShellExtension(
          {
            require: "fake.js",
            description: "",
            export: "default"
          },
          appPath,
          { _: ["test"] }
        ),
        "plop_test"
      );
      process.stdout.isTTY = true;
      WebdaConsole.extensions["bouzouf"] = {
        description: "Fake unit test extension",
        require: "fake.js",
        terminal: "terminal.js",
        relPath: appPath
      };
      await WebdaConsole.handleCommand(
        `--noCompile --appPath ${WebdaSampleApplication.getAppPath()} bouzouf`.split(" "),
        {
          "@webda/core": { path: "", version: "2.0.0", type: "" },
          "@webda/shell": { path: "", version: "1.0.0", type: "" }
        },
        this.workerOutput
      );
    } finally {
      if (fs.existsSync(jsPath)) {
        fs.unlinkSync(jsPath);
      }
      if (fs.existsSync(jsTerminalPath)) {
        fs.unlinkSync(jsTerminalPath);
      }
      delete WebdaConsole.extensions["bouzouf"];
    }
  }

  @test
  async version() {
    // Call with --version
    await this.commandLine("--version");
  }

  @test
  async badAppFolder() {
    await this.commandLine("--appPath /nonexisting", false);
  }

  @test
  async migrateConfig() {
    let appPath = path.join(__dirname, "..", "..", "test", "fakeoldapp");
    fs.mkdirSync(appPath, { recursive: true });
    fs.writeFileSync(path.join(appPath, "webda.config.json"), "{}");
    if (fs.existsSync(path.join(appPath, "newfile.json"))) {
      fs.unlinkSync(path.join(appPath, "newfile.json"));
    }
    // call with just migrate-configuration mynewfile.json
    await this.commandLine(`--appPath ${appPath} migrate-configuration newfile.json`, false);
    assert.deepStrictEqual(JSONUtils.loadFile(path.join(appPath, "newfile.json")), {
      module: {
        deployers: {},
        services: {},
        models: {}
      },
      parameters: {},
      services: {},
      version: 2
    });
    // call with just migrate-configuration
    await this.commandLine(`--appPath ${appPath} migrate-configuration`, false);
    assert.deepStrictEqual(
      JSONUtils.loadFile(path.join(appPath, "newfile.json")),
      JSONUtils.loadFile(path.join(appPath, "webda.config.json"))
    );
  }

  @test
  async deploy() {
    // call one dummy deploy
    assert.strictEqual(await this.commandLine(`deploy`), -1);
    assert.strictEqual(await this.commandLine(`deploy testor`), -1);
    assert.strictEqual(await this.commandLine(`deploy -d Dev`), 0);
    assert.strictEqual(await this.commandLine(`deploy -d Bouzouf`), -1);
    let badFile = WebdaSampleApplication.getAppPath("deployments/Bad.json");
    // TODO Add a faulty deployment
    try {
      fs.writeFileSync(badFile, "plop");
      assert.strictEqual(await this.commandLine(`deploy -d Bad`), -1);
    } finally {
      fs.unlinkSync(badFile);
    }
  }

  @test
  async initYeoman() {
    let yeoman = require("yeoman-environment");
    let register = sinon.stub();
    let run = sinon.stub();
    let stub = sinon.stub(yeoman, "createEnv").callsFake(() => {
      return {
        register,
        run
      };
    });
    try {
      await this.commandLine(`init`, false);
      assert.ok(register.getCall(0).args[0].endsWith("node_modules/generator-webda/generators/app/index.js"));
      assert.strictEqual(register.getCall(0).args[1], "webda");
      register.resetHistory();

      await this.commandLine(`init webda`, false);
      assert.ok(register.getCall(0).args[0].endsWith("node_modules/generator-webda/generators/app/index.js"));
      assert.strictEqual(register.getCall(0).args[1], "webda");
      register.resetHistory();

      await this.commandLine(`init webda:app`, false);
      assert.ok(register.getCall(0).args[0].endsWith("node_modules/generator-webda/generators/app/index.js"));
      assert.strictEqual(register.getCall(0).args[1], "webda");
      register.resetHistory();
    } finally {
      stub.restore();
    }
  }

  @test
  async typescriptWatch() {
    WebdaConsole.app = WebdaSampleApplication;
    WebdaConsole.typescriptWatch(WebdaConsole.getTransform(() => {}));
    let stub = sinon.stub(process, "exit").callsFake(() => {});
    try {
      WebdaConsole.tscCompiler.emit("exit", 1);
      assert.deepStrictEqual(stub.getCall(0).args, [1]);
    } finally {
      stub.restore();
    }
  }

  @test
  async generateRandomStringError() {
    // Test error
    let stub = sinon.stub(require("crypto"), "randomBytes").callsFake((_, callback) => {
      callback("ERROR", null);
    });
    try {
      await assert.rejects(() => WebdaConsole.generateRandomString(), /ERROR/);
    } finally {
      stub.restore();
    }
  }

  @test
  async handleCommand() {
    let packagePath = WebdaSampleApplication.getAppPath("package.json");
    let originalContent = fs.readFileSync(packagePath).toString();
    let logoPath = WebdaSampleApplication.getAppPath("none.txt");
    if (fs.existsSync(logoPath)) {
      fs.unlinkSync(logoPath);
    }
    try {
      process.stdout.isTTY = true;
      await WebdaConsole.handleCommand(
        `--noCompile --appPath ${WebdaSampleApplication.getAppPath()}`.split(" "),
        {
          "@webda/core": { path: "", version: "2.0.0", type: "" },
          "@webda/shell": { path: "", version: "1.0.0", type: "" }
        },
        this.workerOutput
      );
      let pack = JSONUtils.loadFile(packagePath);
      pack.webda = {
        logo: ["A", "A"]
      };
      JSONUtils.saveFile(pack, packagePath);
      await WebdaConsole.handleCommand(
        `--noCompile --appPath ${WebdaSampleApplication.getAppPath()}`.split(" "),
        {
          "@webda/core": { path: "", version: "2.0.0", type: "" },
          "@webda/shell": { path: "", version: "1.0.0", type: "" }
        },
        this.workerOutput
      );
      pack.webda = {
        logo: "none.txt"
      };
      JSONUtils.saveFile(pack, packagePath);
      await WebdaConsole.handleCommand(
        `--noCompile --appPath ${WebdaSampleApplication.getAppPath()}`.split(" "),
        {
          "@webda/core": { path: "", version: "2.0.0", type: "" },
          "@webda/shell": { path: "", version: "1.0.0", type: "" }
        },
        this.workerOutput
      );
      fs.writeFileSync(logoPath, "AA\nBB");
      await WebdaConsole.handleCommand(
        `--noCompile --appPath ${WebdaSampleApplication.getAppPath()}`.split(" "),
        {
          "@webda/core": { path: "", version: "2.0.0", type: "" },
          "@webda/shell": { path: "", version: "1.0.0", type: "" }
        },
        this.workerOutput
      );
    } finally {
      process.stdout.isTTY = false;
      fs.writeFileSync(packagePath, originalContent);
    }
  }

  @test
  async loadExtensions() {
    fs.writeFileSync(WebdaSampleApplication.getAppPath("webda.shell.json"), "[;p[");
    try {
      WebdaConsole.loadExtensions(WebdaSampleApplication.getAppPath());
      fs.writeFileSync(
        WebdaSampleApplication.getAppPath("webda.shell.json"),
        JSONUtils.stringify({
          commands: {
            plop: {
              yargs: {
                command: "plop",
                describe: "Plop test command"
              }
            }
          }
        })
      );
      await this.commandLine("help");
    } finally {
      fs.unlinkSync(WebdaSampleApplication.getAppPath("webda.shell.json"));
    }
  }

  @test
  generateConfigurationSchemaTest() {
    WebdaConsole.app = new SourceApplication(WebdaSampleApplication.getAppPath());
    const config = WebdaSampleApplication.getConfiguration();
    let stub = sinon.stub(WebdaConsole.app, "getConfiguration").callsFake(() => {
      return {
        ...config,
        services: {
          ...config.services,
          emptyOne: undefined
        }
      };
    });
    try {
      WebdaConsole.app.getCompiler().generateConfigurationSchema();
    } finally {
      stub.restore();
    }
  }
}
