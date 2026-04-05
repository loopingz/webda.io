import { suite, test } from "@testdeck/mocha";
import { FileUtils, JSONUtils, Logger, Module, WebdaError, getCommonJS } from "@webda/core";
import { MemoryLogger, WorkerOutput } from "@webda/workout";
import * as assert from "assert";
import { execSync } from "child_process";
import * as fs from "fs";
import { existsSync, unlinkSync } from "fs";
import fetch from "node-fetch";
import * as path from "path";
import * as sinon from "sinon";
import ts from "typescript";
import { Compiler } from "../code/compiler";
import { generateConfigurationSchemas } from "@webda/compiler";
import { SourceApplication } from "../code/sourceapplication";
import { ServerStatus } from "../handlers/http";
import { SampleApplicationTest, WebdaSampleApplication } from "../index.spec";
import { DebuggerStatus, WebdaConsole } from "./webda";
const { __dirname } = getCommonJS(import.meta.url);

class DebugLogger extends MemoryLogger {
  getLogs(start: number = 0) {
    const res = super.getLogs().slice(start);
    this.clear();
    return res;
  }
}

@suite
class ConsoleTest {
  static helpStub;
  cleanFiles: string[] = [];
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
    this.cleanFiles.push(".registry");
    await WebdaSampleApplication.load();
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
      fs.mkdirSync(WebdaSampleApplication.getAppPath("node_modules/@webda"), {
        recursive: true
      });
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
    // Clean all remaining files
    this.cleanFiles.filter(f => fs.existsSync(f)).forEach(f => fs.unlinkSync(f));
    this.cleanFiles = [];
  }

  @test
  async help() {
    await this.commandLine("--noCompile help");
  }

  @test
  async configEncrypt() {
    const filePath = "/tmp/webda.test.json";
    this.cleanFiles.push(filePath);
    FileUtils.save(
      {
        test: "encrypt:local:plop",
        other: {
          test: "plop",
          enc: "encrypt:local:plip",
          plop: true
        }
      },
      filePath
    );
    await this.commandLine("--noCompile config-encrypt " + filePath);
    let data = FileUtils.load(filePath);
    const oldTest = data.test.split(":").pop();
    const oldEnc = data.other.enc.split(":").pop();
    assert.ok(data.test.startsWith("crypt:local:"));
    assert.ok(data.other.enc.startsWith("crypt:local:"));
    assert.strictEqual(data.other.test, "plop");
    await this.commandLine("--noCompile config-encrypt --migrate self " + filePath);
    data = FileUtils.load(filePath);
    assert.ok(data.test.startsWith("crypt:self:"));
    assert.ok(data.other.enc.startsWith("crypt:self:"));
    assert.notStrictEqual(data.test.split(":").pop(), oldTest);
    assert.notStrictEqual(data.other.enc.split(":").pop(), oldEnc);
    assert.strictEqual(data.other.test, "plop");
    const res = await this.commandLine("--noCompile config-encrypt " + filePath + "d");
    assert.strictEqual(res, -1);
  }

  async waitForInput(output: WorkerOutput): Promise<string> {
    let timeout = 100;
    while (!Object.keys(output.inputs).length) {
      await new Promise(resolve => setImmediate(resolve));
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
    const output = WebdaConsole.app.getWorkerOutput();

    let deploymentPath = WebdaConsole.app.getAppPath("deployments/bouzouf.json");
    this.cleanFiles.push(deploymentPath);
    if (fs.existsSync(deploymentPath)) {
      fs.unlinkSync(deploymentPath);
    }
    await this.commandLine("new-deployment bouzouf");
    assert.ok(fs.existsSync(deploymentPath));

    // @ts-ignore
    const stub = sinon.stub(output, "requestInput").callsFake(async () => {
      if (stub.callCount === 1) {
        return "bouzouf";
      } else if (stub.callCount === 2) {
        return "bouzouf2";
      } else if (stub.callCount > 2) {
        fs.unlinkSync(deploymentPath);
        return "bouzouf2";
      }
    });
    try {
      await this.commandLine("new-deployment");
      deploymentPath = WebdaConsole.app.getAppPath("deployments/bouzouf2.json");
      assert.ok(fs.existsSync(deploymentPath));
      this.cleanFiles.push(deploymentPath);
    } finally {
      stub.restore();
    }
  }

  @test
  async storeExport() {
    this.cleanFiles.push("test.ndjson.gz");
    // Just to initiate it
    assert.strictEqual(await this.commandLine("store Registry export ./test.ndjson.gz"), 0);
    assert.strictEqual(await this.commandLine("store Registry2 export ./test.ndjson.gz"), -1);
  }

  @test
  async diagrams() {
    // Just to initiate it
    this.cleanFiles.push("DIAGRAMS.test.md");
    assert.strictEqual(await this.commandLine("diagram storage ./DIAGRAMS.test.md"), 0);
    assert.strictEqual(await this.commandLine("diagram models ./DIAGRAMS.test.md"), 0);
    assert.strictEqual(await this.commandLine("diagram services ./DIAGRAMS.test.md"), 0);
    assert.strictEqual(await this.commandLine("diagram storage ./DIAGRAMS.test.md"), 0);
    assert.strictEqual(await this.commandLine("diagram storage"), 0);
    assert.strictEqual(await this.commandLine("diagram unknown ./DIAGRAMS.test.md"), -1);
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
    // Ensure to compile at least one
    const cacheFile = WebdaSampleApplication.getAppPath(".webda");
    if (existsSync(cacheFile)) {
      unlinkSync(WebdaSampleApplication.getAppPath(".webda"));
    }
    this.commandLine(`serve -d Dev --port 28080`);
    await this.waitForWebda();
    await WebdaConsole.webda.waitForStatus(ServerStatus.Started);
    assert.strictEqual(WebdaConsole.webda.getServerStatus(), ServerStatus.Started);
    const app = new SampleApplicationTest(`http://localhost:28080`);
    await app.testApi();
    await WebdaConsole.webda.stop();
    const p = WebdaConsole.serve({
      port: Math.floor(Math.random() * 10000 + 10000)
    });
    await p.cancel();
  }

  /**
   * Wait for the server to be in a desired state
   *
   * @param status to wait for
   * @param timeout max number of ms to wait for
   */
  async waitForStatus(status: DebuggerStatus, timeout: number = 20000) {
    let time = 0;
    do {
      const currentStatus = WebdaConsole.getDebuggerStatus();
      if (currentStatus === status) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      time += 1000;
      if (timeout < time) {
        throw new WebdaError.CodeError("WAIT_FOR_TIMEOUT", "Timeout");
      }
    } while (true);
  }

  @test
  async configurationWatch() {
    const file = WebdaConsole.app.deploymentFile;
    try {
      const file = WebdaConsole.app.deploymentFile;
      WebdaConsole.app.deploymentFile = null;
      WebdaConsole.configurationWatch(() => {}, "plop");
    } finally {
      WebdaConsole.app.deploymentFile = file;
    }
  }

  @test
  async debugCommandLine() {
    Compiler.watchOptions = {
      watchDirectory: ts.WatchDirectoryKind.FixedPollingInterval
    };
    this.commandLine(
      `debug -d Dev -w --bind=127.0.0.1 --logLevels=ERROR,WARN,INFO,DEBUG,TRACE --port 28080`,
      true,
      undefined,
      "INFO"
    );
    console.log("Waiting for Webda");
    await this.waitForWebda();
    console.log("Waiting for Serving");
    await this.waitForStatus(DebuggerStatus.Serving);
    const app = new SampleApplicationTest(`http://localhost:28080`);
    // CSRF is disabled by default in debug mode
    await app.testApi(200);
    let p = this.waitForStatus(DebuggerStatus.Launching);
    console.log("Add new service");
    // Add a new .ts
    fs.writeFileSync(
      this.dynamicFile,
      `import { Bean, OperationContext, Route, Service } from "@webda/core";
@Bean
export class DynamicService extends Service {
    @Route("/myNewRoute", ["GET"])
    test(ctx: OperationContext) {
        ctx.write("Debugger Rox!");
    }
}

`
    );
    console.log("Waiting for Launching");
    await p;
    console.log("Waiting for Serving");
    await this.waitForStatus(DebuggerStatus.Serving);
    console.log("Test new route");
    // Keep until tested on GitHub
    // try {
    const res = await fetch(`http://localhost:28080/myNewRoute`);
    assert.strictEqual(res.status, 200);
    // } catch (err) {
    //   // Skip this part on Travis and GitHub actions for now
    //   if (!process.env.TRAVIS && !process.env.CI) {
    //     throw err;
    //   }
    // }
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
    p = this.waitForStatus(DebuggerStatus.Launching);
    fs.unlinkSync(this.dynamicFile);
    console.log("Waiting for Launching");
    await p;
    console.log("Waiting for Serving");
    await this.waitForStatus(DebuggerStatus.Serving);
    // @ts-ignore
    const stub = sinon.stub(process, "exit").callsFake(() => {});
    const deploymentFile = WebdaSampleApplication.getAppPath("deployments/Dev.json");
    try {
      p = this.waitForStatus(DebuggerStatus.Launching);
      const deployment = FileUtils.load(deploymentFile);
      deployment.test = Date.now();
      FileUtils.save(deployment, deploymentFile);
      console.log("Waiting for Launching");
      await p;
      console.log("Waiting for Serving");
      await this.waitForStatus(DebuggerStatus.Serving);
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
      execSync(`git checkout ${WebdaSampleApplication.getAppPath("webda.module.json")}`);
      execSync(`git checkout ${deploymentFile}`);
    }
  }

  @test
  async serviceconfigCommandLine() {
    await this.commandLine("service-configuration CustomService");
    let logs = this.logger.getLogs();
    let ind = logs.length - 1;
    assert.notStrictEqual(logs[ind].log.args[0].match(/[\w\W]*"type": "Beans\/CustomService"[\w\W]*/gm), null);
    await this.commandLine("service-configuration UnknownService");
    logs = this.logger.getLogs();
    ind = logs.length - 1;
    assert.strictEqual(logs[ind].log.args[0], "\u001b[31mThe service UnknownService is missing\u001b[39m");
  }

  @test
  async workerCommandLine() {
    this.logger.setLogLevel("TRACE");
    // Test launch aswell
    await this.commandLine("launch CustomService");
    let logs = this.logger.getLogs().slice(-2);
    let ind = 0;
    assert.strictEqual(logs[ind].log.args.length, 1);
    assert.strictEqual(logs[ind].log.args[0], "Result: void");
    ind++;

    assert.strictEqual(logs[ind].log.args.length, 2);
    assert.strictEqual(logs[ind].log.args[0], "Took");

    this.logger.setLogLevel("INFO");
    await this.commandLine("launch CustomService output DEBUG_MSG");
    logs = this.logger.getLogs();
    ind = logs.length - 1;
    assert.strictEqual(logs[ind].log.args.length, 1);
    assert.strictEqual(logs[ind].log.args[0], "YOUR MESSAGE IS 'DEBUG_MSG'");
    await this.commandLine("launch CustomService badMethod");
    logs = this.logger.getLogs();
    ind = logs.length - 1;
    assert.strictEqual(logs[ind].log.args[0], "An error occured");
    await this.commandLine("launch CustomService unknownMethod");
    logs = this.logger.getLogs();
    ind = logs.length - 1;
    assert.strictEqual(logs[ind].log.args[0], "The method unknownMethod is missing in service CustomService");
    await this.commandLine("launch UnknownService");
    logs = this.logger.getLogs();
    ind = logs.length - 1;
    assert.strictEqual(logs[ind].log.args[0], "The service UnknownService is missing");

    const packageJson = FileUtils.load(WebdaSampleApplication.getAppPath("package.json"));
    try {
      FileUtils.save(
        {
          ...packageJson,
          webda: {
            ...packageJson.webda,
            launcher: {
              method: "output",
              service: "CustomService"
            }
          }
        },
        WebdaSampleApplication.getAppPath("package.json")
      );
      await this.commandLine("launch DEBUG_MSG");
      logs = this.logger.getLogs();
      ind = logs.length - 1;
      assert.strictEqual(logs[ind].log.args.length, 1);
      assert.strictEqual(logs[ind].log.args[0], "YOUR MESSAGE IS 'DEBUG_MSG'");
    } finally {
      FileUtils.save(packageJson, WebdaSampleApplication.getAppPath("package.json"));
    }
  }

  @test
  async rotateKeys() {
    await this.commandLine("rotate-keys");
  }

  @test
  async operationsExporter() {
    this.cleanFiles.push("exportOps.json");
    this.cleanFiles.push("exportOps.ts");
    // Define what to check
    await this.commandLine("operations exportOps.json");
    await this.commandLine("operations exportOps.ts");
  }

  @test
  async modelsExporter() {
    this.cleanFiles.push("exportModels.json");
    this.cleanFiles.push("exportModels.ts");
    // Define what to check
    await this.commandLine("models exportModels.json");
    await this.commandLine("models exportModels.ts");
  }

  @test
  async build() {
    let stub;
    try {
      const moduleFile = WebdaSampleApplication.getAppPath("webda.module.json");
      if (fs.existsSync(moduleFile)) {
        fs.unlinkSync(moduleFile);
      }
      await this.commandLine(`build`);
      assert.strictEqual(fs.existsSync(moduleFile), true);
      const module: Module = FileUtils.load(moduleFile);
      assert.ok(Object.keys(module.schemas).length >= 9);
      assert.deepStrictEqual(module.schemas["WebdaDemo/CustomDeployer"].title, "CustomDeployer");
      assert.notStrictEqual(module.schemas["WebdaDemo/CustomReusableService"], undefined);
      assert.notStrictEqual(module.schemas["WebdaDemo/Contact"], undefined);
      assert.notStrictEqual(module.beans["WebdaDemo/BeanService"], undefined);
      assert.notStrictEqual(module.beans["WebdaDemo/SampleAppGoodBean"], undefined);
      assert.notStrictEqual(module.beans["WebdaDemo/SampleAppGoodBean"], undefined);
      assert.strictEqual(module.models.graph["WebdaDemo/User"].binaries?.length, 2);

      WebdaConsole.build({ watch: true });
      WebdaConsole.app.getCompiler().stopWatch();
      stub = sinon.stub(WebdaConsole.app, "generateModule").callsFake(async () => false);
      assert.strictEqual(await WebdaConsole.build({}), -1);
    } finally {
      stub?.restore();
      execSync(`git checkout ${WebdaSampleApplication.getAppPath("webda.module.json")}`);
    }
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
    // @ts-ignore
    const stub = sinon.stub(WebdaConsole, "parser").callsFake(async () => {
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
    this.cleanFiles.push("./openapi.json", "./myopenapi.yml", "./myopenapi.yaml");
    ["./openapi.json", "./myopenapi.yml", "./myopenapi.yaml"].forEach(f => {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    });
    // Just to initiate it
    await this.commandLine("service-configuration Test");
    await this.waitForWebda();
    await this.commandLine(`-d Dev openapi`, true);
    assert.strictEqual(fs.existsSync("./openapi.json"), true);
    const def = JSON.parse(fs.readFileSync("./openapi.json").toString());
    assert.notStrictEqual(def.paths["/test"], undefined);
    assert.notStrictEqual(def.paths["/msg/{msg}"], undefined);
    await this.commandLine(`-d Dev openapi myopenapi.yml`);
    assert.strictEqual(fs.existsSync("./myopenapi.yml"), true);
    assert.deepStrictEqual(FileUtils.load("./myopenapi.yml"), def);
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
    this.cleanFiles.push("test.exports.json");
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
    const res = await this.commandLine("-d TestLambda config test.export.json");
    assert.strictEqual(res, -1);
    const logs = this.logger.getLogs();
    assert.strictEqual(logs[0].log.args[0], "Unknown deployment: TestLambda");
  }

  @test
  async types() {
    await this.commandLine("types");
    const logs = this.logger
      .getLogs()
      .filter(
        l =>
          !l.log?.args[0].startsWith("Cannot find logo") &&
          !l.log?.args[0].startsWith("[Registry]") &&
          l.log?.level === "INFO"
      );
    assert.strictEqual(
      logs.length,
      3,
      "We should have 3 logs with Deployers, Services, Models and the one configuration miss"
    );
  }

  @test
  async stores() {
    await this.commandLine("stores");
    const logs = this.logger.getLogs().filter(l => l.log?.args[0].startsWith("Store "));
    assert.strictEqual(logs.length, 2, "We should have 2 Stores (Registry, contacts)");
  }

  @test
  withinMinorRange() {
    assert.strictEqual(WebdaConsole.withinMinorVersion("1.1.1", "1.1.2"), true);
    assert.strictEqual(WebdaConsole.withinMinorVersion("1.1.3", "1.1.2"), true);
    assert.strictEqual(WebdaConsole.withinMinorVersion("1.2.1", "1.1.2"), true);
    assert.strictEqual(WebdaConsole.withinMinorVersion("1.2.1", "1.3.2"), true);
    assert.strictEqual(WebdaConsole.withinMinorVersion("1.2.1", "2.2.1"), false);
    assert.strictEqual(WebdaConsole.withinMinorVersion("1.2.1", "0.1.2"), false);
    assert.strictEqual(WebdaConsole.withinMinorVersion("1.2.1-beta", "1.1.2"), true);
  }

  @test
  async schema() {
    this.cleanFiles.push("authentication.json");
    const f = "./authentication.json";
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
    await this.commandLine("schema AuthenticationParameters authentication.json");
    assert.strictEqual(true, fs.existsSync(f));
    // Send it to output
    await this.commandLine("schema AuthenticationParameters");
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
    const appPath = path.join(__dirname, "..", "..", "test", "fakeoldapp");
    const jsPath = path.join(appPath, "fake.js");
    const jsTerminalPath = path.join(appPath, "terminal.js");
    try {
      fs.mkdirSync(appPath, { recursive: true });
      fs.writeFileSync(
        jsPath,
        `export default function (console, args) {
          return "plop_" + args._.join("_")
        }`
      );
      fs.writeFileSync(
        jsTerminalPath,
        `
export default class FakeTerminal {
  constructor(...args) {}
  close() {}
  setLogo() {}
  setDefaultLogo() {}
  getLogo() {return ["",""]}
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
  async deploy() {
    // call one dummy deploy
    assert.strictEqual(await this.commandLine(`deploy`), -1);
    assert.strictEqual(await this.commandLine(`deploy testor`), -1);
    assert.strictEqual(await this.commandLine(`deploy -d Dev`), 0);
    assert.strictEqual(await this.commandLine(`deploy -d Bouzouf`), -1);
    const badFile = WebdaSampleApplication.getAppPath("deployments/Bad.json");
    this.cleanFiles.push(badFile);
    fs.writeFileSync(badFile, "plop");
    assert.strictEqual(await this.commandLine(`deploy -d Bad`), -1);
  }

  @test
  async initYeoman() {
    const yeoman = await WebdaConsole.getYeoman();
    const register = sinon.stub();
    const run = sinon.stub();
    // @ts-ignore
    const stub = sinon.stub(yeoman, "createEnv").callsFake(() => {
      return {
        register,
        run
      };
    });
    sinon.stub(WebdaConsole, "getYeoman").callsFake(async () => yeoman);
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
  async handleCommand() {
    const packagePath = WebdaSampleApplication.getAppPath("package.json");
    const originalContent = fs.readFileSync(packagePath).toString();
    const logoPath = WebdaSampleApplication.getAppPath("none.txt");
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
      const pack = JSONUtils.loadFile(packagePath);
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
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
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
  async collectServiceCommandsEmpty() {
    // When no modules have commands, should return empty object
    const fakeApp = {
      getModules: () => ({
        moddas: {
          "MyApp/PlainService": { Import: "plain.js" }
        },
        beans: {},
        deployers: {}
      })
    };
    const commands = WebdaConsole.collectServiceCommands(fakeApp as any);
    assert.deepStrictEqual(commands, {});
  }

  @test
  async collectServiceCommandsSingleService() {
    // A single modda with one command
    const fakeApp = {
      getModules: () => ({
        moddas: {
          "MyApp/Migrator": {
            Import: "migrator.js",
            commands: {
              migrate: {
                description: "Run migrations",
                method: "runMigrate",
                args: {
                  dryRun: { type: "boolean", default: false }
                }
              }
            }
          }
        },
        beans: {},
        deployers: {}
      })
    };
    const commands = WebdaConsole.collectServiceCommands(fakeApp as any);
    assert.strictEqual(Object.keys(commands).length, 1);
    assert.strictEqual(commands["migrate"].description, "Run migrations");
    assert.strictEqual(commands["migrate"].services.length, 1);
    assert.strictEqual(commands["migrate"].services[0].name, "MyApp/Migrator");
    assert.strictEqual(commands["migrate"].services[0].method, "runMigrate");
    assert.deepStrictEqual(commands["migrate"].args, { dryRun: { type: "boolean", default: false } });
  }

  @test
  async collectServiceCommandsMergesMultipleServices() {
    // Two services declare the same command -- services should merge, first args win
    const fakeApp = {
      getModules: () => ({
        moddas: {
          "MyApp/PostgresMigrator": {
            Import: "pg.js",
            commands: {
              migrate: {
                description: "Run PG migrations",
                method: "migrate",
                args: {
                  dryRun: { type: "boolean", default: false },
                  pgOnly: { type: "string" }
                }
              }
            }
          },
          "MyApp/MongoMigrator": {
            Import: "mongo.js",
            commands: {
              migrate: {
                description: "Run Mongo migrations",
                method: "migrate",
                args: {
                  dryRun: { type: "boolean", default: true },
                  mongoOnly: { type: "number" }
                }
              }
            }
          }
        },
        beans: {},
        deployers: {}
      })
    };
    const commands = WebdaConsole.collectServiceCommands(fakeApp as any);
    assert.strictEqual(commands["migrate"].services.length, 2);
    assert.strictEqual(commands["migrate"].services[0].name, "MyApp/PostgresMigrator");
    assert.strictEqual(commands["migrate"].services[1].name, "MyApp/MongoMigrator");
    // First definition wins for description
    assert.strictEqual(commands["migrate"].description, "Run PG migrations");
    // First definition wins for shared args (dryRun.default = false from PG)
    assert.strictEqual(commands["migrate"].args.dryRun.default, false);
    // Both unique args are present
    assert.ok(commands["migrate"].args.pgOnly);
    assert.ok(commands["migrate"].args.mongoOnly);
  }

  @test
  async collectServiceCommandsFromAllSections() {
    // Commands from moddas, beans, and deployers should all be collected
    const fakeApp = {
      getModules: () => ({
        moddas: {
          "MyApp/HttpServer": {
            Import: "http.js",
            commands: {
              serve: { description: "Start server", method: "serve", args: { port: { type: "number" } } }
            }
          }
        },
        beans: {
          "MyApp/CacheBean": {
            Import: "cache.js",
            commands: {
              "cache-clear": { description: "Clear cache", method: "clearAll", args: {} }
            }
          }
        },
        deployers: {
          "MyApp/K8sDeployer": {
            Import: "k8s.js",
            commands: {
              deploy: { description: "Deploy to K8s", method: "deploy", args: { namespace: { type: "string" } } }
            }
          }
        }
      })
    };
    const commands = WebdaConsole.collectServiceCommands(fakeApp as any);
    assert.strictEqual(Object.keys(commands).length, 3);
    assert.ok(commands["serve"]);
    assert.ok(commands["cache-clear"]);
    assert.ok(commands["deploy"]);
    assert.strictEqual(commands["serve"].services[0].name, "MyApp/HttpServer");
    assert.strictEqual(commands["cache-clear"].services[0].name, "MyApp/CacheBean");
    assert.strictEqual(commands["deploy"].services[0].name, "MyApp/K8sDeployer");
  }

  @test
  async collectServiceCommandsSubcommandNames() {
    // Subcommand names (with spaces) should be preserved as keys
    const fakeApp = {
      getModules: () => ({
        moddas: {
          "MyApp/S3Service": {
            Import: "s3.js",
            commands: {
              "aws s3": { description: "Manage S3", method: "manageS3", args: {} }
            }
          }
        },
        beans: {},
        deployers: {}
      })
    };
    const commands = WebdaConsole.collectServiceCommands(fakeApp as any);
    assert.ok(commands["aws s3"]);
    assert.strictEqual(commands["aws s3"].description, "Manage S3");
    assert.strictEqual(commands["aws s3"].services[0].method, "manageS3");
  }

  @test
  async collectServiceCommandsHandlesMissingSections() {
    // Modules with undefined sections should not crash
    const fakeApp = {
      getModules: () => ({
        moddas: undefined,
        beans: undefined,
        deployers: undefined
      })
    };
    const commands = WebdaConsole.collectServiceCommands(fakeApp as any);
    assert.deepStrictEqual(commands, {});
  }

  @test
  async executeServiceCommandAllServices() {
    // All services should be called when no --service filter
    const callLog: string[] = [];
    const fakeService1 = { migrate: (...args) => callLog.push("svc1:" + JSON.stringify(args)) };
    const fakeService2 = { migrate: (...args) => callLog.push("svc2:" + JSON.stringify(args)) };
    const savedWebda = WebdaConsole.webda;
    try {
      // @ts-ignore
      WebdaConsole.webda = {
        getService: (name: string) => {
          if (name === "MyApp/Svc1") return fakeService1;
          if (name === "MyApp/Svc2") return fakeService2;
          return undefined;
        },
        getServices: () => ({})
      };
      const cmdInfo = {
        description: "Test",
        services: [
          { name: "MyApp/Svc1", method: "migrate", type: "MyApp/Svc1" },
          { name: "MyApp/Svc2", method: "migrate", type: "MyApp/Svc2" }
        ],
        args: { dryRun: { type: "boolean" as const, default: false } }
      };
      const result = await WebdaConsole.executeServiceCommand("migrate", cmdInfo, { dryRun: true });
      assert.strictEqual(result, 0);
      assert.strictEqual(callLog.length, 2);
      assert.ok(callLog[0].startsWith("svc1:"));
      assert.ok(callLog[1].startsWith("svc2:"));
    } finally {
      WebdaConsole.webda = savedWebda;
    }
  }

  @test
  async executeServiceCommandWithServiceFilter() {
    // Only the matching service should be called
    const callLog: string[] = [];
    const fakeService1 = { migrate: () => callLog.push("svc1") };
    const fakeService2 = { migrate: () => callLog.push("svc2") };
    const savedWebda = WebdaConsole.webda;
    try {
      // @ts-ignore
      WebdaConsole.webda = {
        getService: (name: string) => {
          if (name === "MyApp/Svc1") return fakeService1;
          if (name === "MyApp/Svc2") return fakeService2;
          return undefined;
        },
        getServices: () => ({})
      };
      const cmdInfo = {
        description: "Test",
        services: [
          { name: "MyApp/Svc1", method: "migrate", type: "MyApp/Svc1" },
          { name: "MyApp/Svc2", method: "migrate", type: "MyApp/Svc2" }
        ],
        args: {}
      };
      const result = await WebdaConsole.executeServiceCommand("migrate", cmdInfo, { service: "MyApp/Svc1" });
      assert.strictEqual(result, 0);
      assert.strictEqual(callLog.length, 1);
      assert.strictEqual(callLog[0], "svc1");
    } finally {
      WebdaConsole.webda = savedWebda;
    }
  }

  @test
  async executeServiceCommandNoMatchingFilter() {
    // When --service filter matches nothing, should return 1
    const savedWebda = WebdaConsole.webda;
    try {
      // @ts-ignore
      WebdaConsole.webda = {
        getService: () => undefined,
        getServices: () => ({})
      };
      const cmdInfo = {
        description: "Test",
        services: [
          { name: "MyApp/Svc1", method: "migrate", type: "MyApp/Svc1" }
        ],
        args: {}
      };
      const result = await WebdaConsole.executeServiceCommand("migrate", cmdInfo, { service: "NonExistent" });
      assert.strictEqual(result, 1);
    } finally {
      WebdaConsole.webda = savedWebda;
    }
  }

  @test
  async executeServiceCommandCommaSeparatedFilter() {
    // Comma-separated --service filter should match multiple services
    const callLog: string[] = [];
    const fakeService1 = { migrate: () => callLog.push("svc1") };
    const fakeService2 = { migrate: () => callLog.push("svc2") };
    const fakeService3 = { migrate: () => callLog.push("svc3") };
    const savedWebda = WebdaConsole.webda;
    try {
      // @ts-ignore
      WebdaConsole.webda = {
        getService: (name: string) => {
          if (name === "MyApp/Svc1") return fakeService1;
          if (name === "MyApp/Svc2") return fakeService2;
          if (name === "MyApp/Svc3") return fakeService3;
          return undefined;
        },
        getServices: () => ({})
      };
      const cmdInfo = {
        description: "Test",
        services: [
          { name: "MyApp/Svc1", method: "migrate", type: "MyApp/Svc1" },
          { name: "MyApp/Svc2", method: "migrate", type: "MyApp/Svc2" },
          { name: "MyApp/Svc3", method: "migrate", type: "MyApp/Svc3" }
        ],
        args: {}
      };
      const result = await WebdaConsole.executeServiceCommand("migrate", cmdInfo, { service: "Svc1,Svc2" });
      assert.strictEqual(result, 0);
      assert.strictEqual(callLog.length, 2);
      assert.strictEqual(callLog[0], "svc1");
      assert.strictEqual(callLog[1], "svc2");
    } finally {
      WebdaConsole.webda = savedWebda;
    }
  }

  @test
  async executeServiceCommandServiceNotFound() {
    // Service referenced in cmdInfo but not found in webda -- should skip with warning
    const savedWebda = WebdaConsole.webda;
    try {
      // @ts-ignore
      WebdaConsole.webda = {
        getService: () => undefined,
        getServices: () => ({})
      };
      const cmdInfo = {
        description: "Test",
        services: [
          { name: "MyApp/Ghost", method: "migrate", type: "MyApp/Ghost" }
        ],
        args: {}
      };
      const result = await WebdaConsole.executeServiceCommand("migrate", cmdInfo, {});
      // Service not found is a warning, not an error -- returns 0
      assert.strictEqual(result, 0);
    } finally {
      WebdaConsole.webda = savedWebda;
    }
  }

  @test
  async executeServiceCommandMethodNotFound() {
    // Service found but method missing -- should return 1
    const fakeService = { otherMethod: () => {} };
    const savedWebda = WebdaConsole.webda;
    try {
      // @ts-ignore
      WebdaConsole.webda = {
        getService: () => fakeService,
        getServices: () => ({})
      };
      const cmdInfo = {
        description: "Test",
        services: [
          { name: "MyApp/Svc1", method: "nonExistentMethod", type: "MyApp/Svc1" }
        ],
        args: {}
      };
      const result = await WebdaConsole.executeServiceCommand("migrate", cmdInfo, {});
      assert.strictEqual(result, 1);
    } finally {
      WebdaConsole.webda = savedWebda;
    }
  }

  @test
  async executeServiceCommandFallbackToTypeMatch() {
    // When getService returns null, should search by constructor name
    const callLog: string[] = [];
    class Svc1 {
      migrate() {
        callLog.push("found-by-type");
      }
    }
    const fakeInstance = new Svc1();
    const savedWebda = WebdaConsole.webda;
    try {
      // @ts-ignore
      WebdaConsole.webda = {
        getService: () => undefined,
        getServices: () => ({ myInstance: fakeInstance })
      };
      const cmdInfo = {
        description: "Test",
        services: [
          { name: "MyApp/Svc1", method: "migrate", type: "MyApp/Svc1" }
        ],
        args: {}
      };
      const result = await WebdaConsole.executeServiceCommand("migrate", cmdInfo, {});
      assert.strictEqual(result, 0);
      assert.strictEqual(callLog.length, 1);
      assert.strictEqual(callLog[0], "found-by-type");
    } finally {
      WebdaConsole.webda = savedWebda;
    }
  }

  @test
  async executeServiceCommandPassesArgs() {
    // Verify that command args from argv are extracted and passed to the method
    const receivedArgs: any[] = [];
    const fakeService = {
      doStuff: (...args) => {
        receivedArgs.push(...args);
      }
    };
    const savedWebda = WebdaConsole.webda;
    try {
      // @ts-ignore
      WebdaConsole.webda = {
        getService: () => fakeService,
        getServices: () => ({})
      };
      const cmdInfo = {
        description: "Test",
        services: [
          { name: "MyApp/Svc1", method: "doStuff", type: "MyApp/Svc1" }
        ],
        args: {
          port: { type: "number" as const, default: 8080 },
          host: { type: "string" as const }
        }
      };
      const result = await WebdaConsole.executeServiceCommand("test", cmdInfo, {
        port: 3000,
        host: "localhost",
        unrelated: "ignored"
      });
      assert.strictEqual(result, 0);
      // Should receive port and host values (from cmdInfo.args keys)
      assert.strictEqual(receivedArgs[0], 3000);
      assert.strictEqual(receivedArgs[1], "localhost");
    } finally {
      WebdaConsole.webda = savedWebda;
    }
  }

  @test
  async executeServiceCommandSuffixMatching() {
    // The --service filter supports suffix matching (endsWith)
    const callLog: string[] = [];
    const fakeService = { migrate: () => callLog.push("called") };
    const savedWebda = WebdaConsole.webda;
    try {
      // @ts-ignore
      WebdaConsole.webda = {
        getService: (name: string) => {
          if (name === "MyApp/PostgresMigrator") return fakeService;
          return undefined;
        },
        getServices: () => ({})
      };
      const cmdInfo = {
        description: "Test",
        services: [
          { name: "MyApp/PostgresMigrator", method: "migrate", type: "MyApp/PostgresMigrator" }
        ],
        args: {}
      };
      // Filter by suffix only
      const result = await WebdaConsole.executeServiceCommand("migrate", cmdInfo, { service: "PostgresMigrator" });
      assert.strictEqual(result, 0);
      assert.strictEqual(callLog.length, 1);
    } finally {
      WebdaConsole.webda = savedWebda;
    }
  }

  @test
  async generateConfigurationSchemaTest() {
    await WebdaSampleApplication.load();
    WebdaConsole.app = new SourceApplication(WebdaSampleApplication.getAppPath());
    await WebdaConsole.app.load();
    const config = WebdaSampleApplication.getConfiguration();
    const stub = sinon.stub(WebdaConsole.app, "getConfiguration").callsFake(() => {
      return {
        ...config,
        services: {
          ...config.services,
          emptyOne: undefined
        }
      };
    });
    // Add a fake deployer to ensure when no schema
    WebdaConsole.app.addDeployer("webda/fakedeployer", {});
    try {
      generateConfigurationSchemas(WebdaConsole.app);
    } finally {
      stub.restore();
      delete WebdaConsole.app.getDeployers()["webda/fakedeployer"];
    }
  }
}
