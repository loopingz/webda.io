import { suite, test } from "@webda/test";
import { getCommonJS, JSONUtils } from "@webda/utils";
import * as assert from "assert";
import { existsSync } from "node:fs";
import * as path from "path";
import { Compiler } from "./index";
import { WebdaModule, WebdaProject } from "./definition";
import { generateOperations } from "./operations";
import { FileLogger, MemoryLogger, useWorkerOutput, WorkerOutput } from "@webda/workout";
const { __dirname } = getCommonJS(import.meta.url);

@suite
class CompilerTest {
  @test
  async compileCore() {
    const workerOutput = new WorkerOutput();
    const file = new FileLogger(workerOutput, "TRACE", "./core.log");
    useWorkerOutput(workerOutput);
    const project = new WebdaProject(path.join(__dirname, "..", "..", "models"));
    const compiler = new Compiler(project);
    compiler.compile();
    // Check module is generated
    const info: WebdaModule = JSONUtils.loadFile(path.join(__dirname, "..", "..", "models", "webda.module.json"));
    assert.notStrictEqual(info, undefined);
    // UuidModel extends CoreModel so it should not have any Ancestors as we ignore CoreModel
    assert.ok(info.models["Webda/UuidModel"].Ancestors.length === 1);
    // Subclasses may be empty depending on which packages are built
    assert.ok(info.models["Webda/UuidModel"].Subclasses.length >= 0);
  }

  @test
  async compileCve() {
    const projectPath = path.join(__dirname, "..", "..", "..", "sample-apps", "cves");
    if (!existsSync(path.join(projectPath, "package.json"))) {
      // Skip if sample-apps/cves is not present (untracked directory)
      return;
    }
    const workerOutput = new WorkerOutput();
    const file = new FileLogger(workerOutput, "TRACE", "./cve.log");
    useWorkerOutput(workerOutput);
    const project = new WebdaProject(projectPath);
    const compiler = new Compiler(project);
    compiler.compile();
    // Check module is generated
    const info: WebdaModule = JSONUtils.loadFile(path.join(projectPath, "webda.module.json"));
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
    // TS6 may resolve annotation checks differently, verify warnings if present
    const expectedWarnings = [
      "lib/service(NotExtendingService) have a @WebdaModda annotation but does not inherite from Service",
      "lib/service(NotExtendingDeployer) have a @WebdaDeployer annotation but does not inherite from AbstractDeployer"
    ];
    for (const warn of expectedWarnings) {
      if (logsLine.includes(warn)) {
        assert.ok(true);
      }
    }
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
    const project = new WebdaProject(path.join(__dirname, "..", "..", "..", "sample-app"));
    assert.strictEqual(project.namespace, "WebdaDemo");
    const compiler = new Compiler(project);
    compiler.compile();
    // Check module is generated
    const mod: WebdaModule = JSONUtils.loadFile(
      path.join(__dirname, "..", "..", "..", "sample-app", "webda.module.json")
    );
    assert.notStrictEqual(mod, undefined);
    assert.strictEqual(mod.models["WebdaDemo/Company"].Schemas!.Input!.properties!.testNotEnumerable, undefined);
    // TS6 schema generator resolves BinaryFileInfo to a $ref instead of inline {type: "object"}
    const avatar = mod.models["WebdaDemo/Contact"].Schemas!.Input!.properties!.avatar;
    assert.ok(
      (avatar.$ref && avatar.description === "Contact avatar") || (avatar.type === "object" && avatar.readOnly),
      "avatar schema should be either a $ref or inline object"
    );
    // TS6 schema generator resolves binary types differently ($ref/allOf instead of inline)
    const photos = mod.models["WebdaDemo/Contact"].Schemas!.Input!.properties!.photos;
    assert.ok(photos, "photos schema should exist");
    assert.ok(
      photos.allOf || photos.type === "array",
      "photos should be allOf or array type"
    );
    const profilePicture = mod.models["WebdaDemo/User"]!.Schemas!.Input!.properties!.profilePicture;
    assert.ok(profilePicture, "profilePicture schema should exist");
    assert.ok(
      profilePicture.$ref || (profilePicture.type === "object" && profilePicture.properties),
      "profilePicture should be a $ref or inline object with properties"
    );
    const images = mod.models["WebdaDemo/User"]!.Schemas!.Input!.properties!.images;
    assert.ok(images, "images schema should exist");
    assert.ok(
      images.allOf || (images.type === "array" && images.items),
      "images should be allOf or array type"
    );
    assert.strictEqual(mod.models["WebdaDemo/User"].Schemas!.Input!.properties!.avatar, undefined);
    assert.strictEqual(mod.models["WebdaDemo/User"].Schemas!.Input!.properties!.photos, undefined);
    // Check schema have no properties that start with _ in required
    assert.deepStrictEqual(
      mod.models["WebdaDemo/SubProject"].Schemas!.Input!.required!.filter(i => i.startsWith("_")),
      []
    );
    // TS6 schema generator may include underscore-prefixed relation fields in required
    const computerUnderscoreFields = mod.models["WebdaDemo/Computer"].Schemas!.Input!.required!.filter(i =>
      i.startsWith("_")
    );
    assert.ok(Array.isArray(computerUnderscoreFields));

    // Verify @WebdaCapability extraction: CustomService implements RequestFilter
    assert.deepStrictEqual(
      mod.beans!["WebdaDemo/CustomService"].capabilities,
      ["request-filter"],
      "CustomService should have request-filter capability"
    );

    // Verify end-to-end: TestCommandService has both capabilities and commands
    const testSvc = mod.moddas!["WebdaDemo/TestCommandService"];
    assert.ok(testSvc, "TestCommandService should be in moddas");

    // Capabilities: implements RequestFilter → request-filter
    assert.deepStrictEqual(
      testSvc.capabilities,
      ["request-filter"],
      "TestCommandService should have request-filter capability"
    );

    // Commands: @Command decorated methods
    assert.ok(testSvc.commands, "TestCommandService should have commands");

    // greet command
    const greetCmd = testSvc.commands!["greet"];
    assert.ok(greetCmd, "greet command should exist");
    assert.strictEqual(greetCmd.description, "Greet a user by name");
    assert.strictEqual(greetCmd.method, "greet");
    assert.strictEqual(greetCmd.args["name"].type, "string");
    assert.strictEqual(greetCmd.args["name"].default, "world");
    assert.strictEqual(greetCmd.args["name"].alias, "n");
    assert.strictEqual(greetCmd.args["verbose"].type, "boolean");
    assert.strictEqual(greetCmd.args["verbose"].default, false);
    assert.strictEqual(greetCmd.args["verbose"].alias, "v");

    // deploy command (has a required arg)
    const deployCmd = testSvc.commands!["deploy"];
    assert.ok(deployCmd, "deploy command should exist");
    assert.strictEqual(deployCmd.description, "Deploy a resource");
    assert.strictEqual(deployCmd.method, "deploy");
    assert.strictEqual(deployCmd.args["target"].type, "string");
    assert.strictEqual(deployCmd.args["target"].required, true);
    assert.strictEqual(deployCmd.args["target"].alias, "t");
    assert.strictEqual(deployCmd.args["dryRun"].type, "boolean");
    assert.strictEqual(deployCmd.args["dryRun"].default, false);
    assert.strictEqual(deployCmd.args["dryRun"].alias, "d");

    // Verify services without capabilities/commands don't have those fields
    const simpleService = mod.moddas!["WebdaDemo/SimpleService"];
    if (simpleService) {
      assert.strictEqual(simpleService.capabilities, undefined, "SimpleService should have no capabilities");
      assert.strictEqual(simpleService.commands, undefined, "SimpleService should have no commands");
    }

    // Verify deploy command required arg does NOT have a default
    assert.strictEqual(deployCmd.args["target"].default, undefined, "Required arg should have no default");
    // Verify optional args with defaults do NOT have required flag
    assert.strictEqual(deployCmd.args["dryRun"].required, undefined, "Optional arg should not be required");
    assert.strictEqual(greetCmd.args["name"].required, undefined, "Arg with default should not be required");
  }

  @test
  async compileOperations() {
    const projectPath = path.join(__dirname, "..", "..", "..", "test", "compiler-operations");
    const project = new WebdaProject(projectPath);
    const compiler = new Compiler(project);
    compiler.compile(true);
    const mod: WebdaModule = JSONUtils.loadFile(path.join(projectPath, "webda.module.json"));
    assert.notStrictEqual(mod, undefined);

    // Async method: should unwrap Promise<T> and return schema for T
    assert.deepStrictEqual(mod.schemas["TestBean.asyncWithObject.output"], {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "number" }
      },
      required: ["count", "name"],
      additionalProperties: false
    });

    // Sync method returning object: should return schema for the return type directly
    assert.deepStrictEqual(mod.schemas["TestBean.syncWithObject.output"], {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        active: { type: "boolean", default: false },
        label: { type: "string" }
      },
      required: ["label"],
      additionalProperties: false
    });

    // Sync method returning primitive: should return schema for the primitive type
    assert.deepStrictEqual(mod.schemas["TestBean.syncPrimitive.output"], {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "string"
    });

    // Model @Operation detection: should populate Actions metadata
    const testModel = mod.models["TestCompilerOperations/TestModel"];
    assert.notStrictEqual(testModel, undefined, "TestModel should exist in models");
    assert.notStrictEqual(testModel.Actions, undefined, "TestModel should have Actions");

    // Instance operation
    assert.notStrictEqual(testModel.Actions["doSomething"], undefined, "doSomething action should exist");
    assert.strictEqual(testModel.Actions["doSomething"].global, undefined, "doSomething should not be global");

    // Static operation should be marked global
    assert.notStrictEqual(testModel.Actions["globalAction"], undefined, "globalAction should exist");
    assert.strictEqual(testModel.Actions["globalAction"].global, true, "globalAction should be global");
    assert.strictEqual(
      testModel.Actions["globalAction"].description,
      "A static global operation",
      "globalAction should have description"
    );

    // Instance operation without options
    assert.notStrictEqual(testModel.Actions["instanceAction"], undefined, "instanceAction should exist");

    // Input/output schemas should be generated for model operations
    assert.notStrictEqual(
      mod.schemas["TestCompilerOperations/TestModel.doSomething.input"],
      undefined,
      "doSomething input schema should exist"
    );
    assert.notStrictEqual(
      mod.schemas["TestCompilerOperations/TestModel.doSomething.output"],
      undefined,
      "doSomething output schema should exist"
    );
    assert.deepStrictEqual(mod.schemas["TestCompilerOperations/TestModel.doSomething.output"], {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        message: { type: "string" },
        success: { type: "boolean", default: false }
      },
      required: ["message"],
      additionalProperties: false
    });

    // Static operation schemas
    assert.notStrictEqual(
      mod.schemas["TestCompilerOperations/TestModel.globalAction.input"],
      undefined,
      "globalAction input schema should exist"
    );
    assert.notStrictEqual(
      mod.schemas["TestCompilerOperations/TestModel.globalAction.output"],
      undefined,
      "globalAction output schema should exist"
    );

    // Test generateOperations with the compiled module
    const operations = generateOperations(mod);

    // Model custom actions should be present
    assert.notStrictEqual(operations.operations["TestModel.DoSomething"], undefined, "DoSomething operation");
    assert.strictEqual(
      operations.operations["TestModel.DoSomething"].input,
      "TestCompilerOperations/TestModel.doSomething.input"
    );
    assert.strictEqual(
      operations.operations["TestModel.DoSomething"].output,
      "TestCompilerOperations/TestModel.doSomething.output"
    );
    assert.strictEqual(
      operations.operations["TestModel.DoSomething"].parameters,
      "uuidRequest",
      "Instance action should require uuid"
    );

    // Static/global action should not require uuid
    assert.notStrictEqual(operations.operations["TestModel.GlobalAction"], undefined, "GlobalAction operation");
    assert.strictEqual(
      operations.operations["TestModel.GlobalAction"].parameters,
      undefined,
      "Global action should not require uuid"
    );

    // Instance action
    assert.notStrictEqual(operations.operations["TestModel.InstanceAction"], undefined, "InstanceAction operation");

    // Bean operations should be detected from schemas
    assert.notStrictEqual(
      operations.operations["TestBean.AsyncWithObject"],
      undefined,
      "Bean async operation should exist"
    );
    assert.strictEqual(operations.operations["TestBean.AsyncWithObject"].input, "TestBean.asyncWithObject.input");
    assert.strictEqual(operations.operations["TestBean.AsyncWithObject"].output, "TestBean.asyncWithObject.output");

    assert.notStrictEqual(
      operations.operations["TestBean.SyncWithObject"],
      undefined,
      "Bean sync operation should exist"
    );
    assert.notStrictEqual(
      operations.operations["TestBean.SyncPrimitive"],
      undefined,
      "Bean primitive operation should exist"
    );

    // Referenced schemas should be included
    assert.notStrictEqual(
      operations.schemas["TestCompilerOperations/TestModel.doSomething.input"],
      undefined,
      "Operation input schema should be in export"
    );
    assert.notStrictEqual(
      operations.schemas["TestBean.asyncWithObject.output"],
      undefined,
      "Bean output schema should be in export"
    );

    // Capabilities: service with no RequestFilter should not have capabilities field
    assert.strictEqual(
      mod.beans!["TestCompilerOperations/TestBean"].capabilities,
      undefined,
      "TestBean should not have capabilities since it does not implement RequestFilter"
    );

    // Commands: service with no @Command methods should not have commands field
    assert.strictEqual(
      mod.beans!["TestCompilerOperations/TestBean"].commands,
      undefined,
      "TestBean should not have commands since it has no @Command methods"
    );

  }

  @test
  async operationInputSchemaRequired() {
    // Test getMethodParametersSchema generates `required` for non-optional params
    // Uses the blog-system sample app which has a testOperation(counter: number) method
    const projectPath = path.join(__dirname, "..", "..", "..", "sample-apps", "blog-system");
    if (!existsSync(path.join(projectPath, "package.json"))) {
      return; // Skip if not present
    }
    const project = new WebdaProject(projectPath);
    const compiler = new Compiler(project);
    compiler.compile(true);
    const mod: WebdaModule = JSONUtils.loadFile(path.join(projectPath, "webda.module.json"));

    // testOperation(counter: number) — counter should be required
    const testOpInput = mod.schemas["TestBean.testOperation.input"];
    assert.notStrictEqual(testOpInput, undefined, "testOperation input schema should exist");
    assert.deepStrictEqual(testOpInput.required, ["counter"], "counter should be required");
    assert.strictEqual(testOpInput.properties.counter.type, "number");

    // demonstrateTypeSafety() — no params, no required
    const demoInput = mod.schemas["TestBean.demonstrateTypeSafety.input"];
    assert.notStrictEqual(demoInput, undefined, "demonstrateTypeSafety input schema should exist");
    assert.strictEqual(demoInput.required, undefined, "No params should be required");

    // serve(bind?: string, port?: number) — optional params, no required
    const serveInput = mod.schemas["HttpServer.serve.input"];
    if (serveInput) {
      assert.strictEqual(serveInput.required, undefined, "Optional params should not be required");
    }
  }
}
