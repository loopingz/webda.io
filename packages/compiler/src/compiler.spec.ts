import { suite, test } from "@webda/test";
import { getCommonJS, JSONUtils } from "@webda/utils";
import * as assert from "assert";
import * as path from "path";
import { Compiler } from "./index";
import { WebdaModule, WebdaProject } from "./definition";
import { FileLogger, MemoryLogger, useWorkerOutput, WorkerOutput } from "@webda/workout";
const { __dirname } = getCommonJS(import.meta.url);

@suite
class CompilerTest {
  @test
  async compileCore() {
    const workerOutput = new WorkerOutput();
    const file = new FileLogger(workerOutput, "TRACE", "./core.log");
    useWorkerOutput(workerOutput);
    const project = new WebdaProject(path.join(__dirname, "..", "..", "core"));
    const compiler = new Compiler(project);
    compiler.compile();
    // Check module is generated
    const info: WebdaModule = JSONUtils.loadFile(path.join(__dirname, "..", "..", "core", "webda.module.json"));
    assert.notStrictEqual(info, undefined);
  }

  @test
  async compileTest() {
    const workerOutput = new WorkerOutput();
    const file = new FileLogger(workerOutput, "TRACE", "./test.log");
    const logs = new MemoryLogger(workerOutput, "WARN");
    useWorkerOutput(workerOutput);
    const project = new WebdaProject(path.join(__dirname, "..", "..", "..", "test", "compiler"));
    const compiler = new Compiler(project);
    compiler.compile();
    const mod: WebdaModule = JSONUtils.loadFile(
      path.join(__dirname, "..", "..", "..", "test", "compiler", "webda.module.json")
    );
    // Goodbean should be use the SubDefinition
    assert.strictEqual(mod.beans!["Webda/GoodBean"].Schema!.required!.length, 3);
    assert.notStrictEqual(mod.schemas["Webda/AnotherSchema"], undefined);
    assert.notStrictEqual(mod.schemas["Webda/SchemaTest"], undefined);
    const logsLine = logs.getLogs().map(l => l.log?.args.join(" "));
    assert.deepStrictEqual(logsLine.slice(1), [
      "lib/service(NotExtendingService) have a @WebdaModda annotation but does not inherite from Service",
      "lib/service(NotExtendingDeployer) have a @WebdaDeployer annotation but does not inherite from AbstractDeployer"
    ]);
    assert.ok(logsLine[0]!.startsWith("WebdaObjects need to be exported NotExportService in "));
    // Ensure we manage failure in schema
    /**
    compiler.schemaGenerator.createSchemaFromNodes = () => {
      throw new Error();
    };
    compiler.generateModule();
    */
    // Check if getSchema return null: 747
    // Check if getSchema return object without properties: 751
  }

  @test
  async compileSampleApp() {
    const workerOutput = new WorkerOutput();
    const file = new FileLogger(workerOutput, "TRACE", "./sample-app.log");
    useWorkerOutput(workerOutput);
    const project = new WebdaProject(path.join(__dirname, "..", "..", "..", "sample-app"));
    assert.strictEqual(project.namespace, "WebdaDemo");
    const compiler = new Compiler(project);
    compiler.compile();
    // Check module is generated
    const mod: WebdaModule = JSONUtils.loadFile(
      path.join(__dirname, "..", "..", "..", "sample-app", "webda.module.json")
    );
    assert.notStrictEqual(mod, undefined);
    assert.strictEqual(mod.models["WebdaDemo/Company"].Schema!.properties!.testNotEnumerable, undefined);
    assert.deepStrictEqual(mod.models["WebdaDemo/Contact"].Schema!.properties!.avatar, {
      type: "object",
      readOnly: true
    });
    assert.deepStrictEqual(mod.models["WebdaDemo/Contact"].Schema!.properties!.photos, {
      items: {
        properties: {
          location: {
            properties: {
              lat: {
                type: "number"
              },
              lng: {
                type: "number"
              }
            },
            required: ["lat", "lng"],
            type: "object"
          }
        },
        required: ["location"],
        type: "object"
      },
      readOnly: true,
      type: "array"
    });
    assert.deepStrictEqual(mod.models["WebdaDemo/User"]!.Schema!.properties!.profilePicture, {
      type: "object",
      properties: { width: { type: "number" }, height: { type: "number" } },
      required: ["width", "height"],
      readOnly: true
    });
    assert.deepStrictEqual(mod.models["WebdaDemo/User"]!.Schema!.properties!.images, {
      type: "array",
      items: { type: "object" },
      readOnly: true
    });
    assert.strictEqual(mod.models["WebdaDemo/User"].Schema!.properties!.avatar, undefined);
    assert.strictEqual(mod.models["WebdaDemo/User"].Schema!.properties!.photos, undefined);
    // Check schema have no properties that start with _ in required
    assert.deepStrictEqual(
      mod.models["WebdaDemo/SubProject"].Schema!.required!.filter(i => i.startsWith("_")),
      []
    );
    assert.deepStrictEqual(
      mod.models["WebdaDemo/Computer"].Schema!.required!.filter(i => i.startsWith("_")),
      []
    );
  }
}
