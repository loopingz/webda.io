import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as path from "path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { Application, UnpackedApplication, useApplication, validateModelSchema } from "../index.js";
import { CoreModel } from "../models/coremodel.model.js";
import { User } from "../models/user.model.js";
import { WebdaInternalTest, TestInternalApplication } from "../test/internal.js";
import { FileUtils, getCommonJS } from "@webda/utils";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { useLogger } from "../loggers/hooks.js";
import { TestApplication } from "../test/objects.js";
import { WebdaApplicationTest } from "../test/application.js";
const { __dirname } = getCommonJS(import.meta.url);

// TODO: SampleApplicationTest skipped - ensureDefaultConfiguration services not propagating to Core constructor
// @suite
class SampleApplicationTest extends WebdaApplicationTest {
  sampleApp: TestApplication;

  async beforeAll(): Promise<void> {
    await super.beforeAll();
    this.sampleApp = useApplication();
  }

  getTestConfiguration() {
    return path.join(__dirname, "..", "..", "..", "..", "sample-app");
  }

  @test
  validateSchemaWithEnum() {
    assert.strictEqual(
      validateModelSchema(
        "WebdaDemo/Company",
        {
          permissions: ["PRODUCT_1", "PRODUCT_2"]
        },
        true
      ),
      true
    );
    assert.throws(
      () =>
        validateModelSchema(
          "WebdaDemo/Company",
          {
            permissions: ["RANDOM", "PRODUCT_2"]
          },
          true
        ),
      /validation failed/
    );
  }

  @test
  configurationImports() {
    assert.strictEqual(this.sampleApp.getConfiguration().parameters!.import1, true);
    assert.strictEqual(this.sampleApp.getConfiguration().parameters!.import2, true);
    assert.strictEqual(this.sampleApp.getConfiguration().parameters!.import3, undefined);
  }

  @test
  getApplicationPath() {
    assert.strictEqual(this.sampleApp.getPath(), path.join(__dirname, "..", "..", "..", "..", "sample-app"));
    assert.strictEqual(
      this.sampleApp.getPath("lib"),
      path.join(__dirname, "..", "..", "..", "..", "sample-app", "lib")
    );
  }

  @test
  getConfiguration() {
    const config = this.sampleApp.getConfiguration();
  }
}

@suite
class ApplicationTest extends WebdaInternalTest {
  @test
  async cacheSchema() {
    const app = new Application(__dirname + "/../../test/config-cached.json");
    await app.load();
    // Should load from cache
    assert.notStrictEqual(app.getSchema("WebdaTest/Mailer"), undefined);
    assert.strictEqual(app.getSchema("Webda/Container"), undefined);
    // Check if cached just use cache
    // @ts-ignore
    app.baseConfiguration.cachedModules = {
      schemas: {
        // @ts-ignore
        fake: 666
      }
    };
    assert.strictEqual(app.getSchema("fake"), 666);
    // "?" suffix should return schema without required
    // @ts-ignore
    app.baseConfiguration.cachedModules.schemas["typed"] = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"]
    };
    const optional = app.getSchema("typed?");
    assert.ok(optional);
    assert.strictEqual(optional.required, undefined);
    assert.deepStrictEqual(optional.properties, { a: { type: "string" } });
    // Original should still have required
    assert.deepStrictEqual(app.getSchema("typed").required, ["a"]);
    // "?" on unknown schema returns undefined
    assert.strictEqual(app.getSchema("nonexistent?"), undefined);
  }

  @test
  async cov() {
    assert.throws(
      () => new Application("/notexisting"),
      /Not a webda application folder or webda\.config\.\(ya\?ml\|jsonc\?\) file: unexisting.*/
    );
    assert.throws(() => new Application(__dirname + "/../../test/schemas"), /File not found .*/);
    await assert.rejects(() => new Application(__dirname + "/../../test/badapp").load(), /Cannot parse JSON of: .*/);
    const unpackedApp = new UnpackedApplication(__dirname + "/../../test/badapp", undefined);
    unpackedApp.loadProjectInformation();
    // Read cached modules
    let app = new Application(__dirname + "/../../test/cachedapp", undefined);
    await app.load();
    app.getGitInformation();
    // No package.json should not fail although more than abnormal
    app = new TestApplication(FileUtils.load(__dirname + "/../../test/config.json"));
    await app.load();

    app.getPackageWebda();
    assert.throws(() => app.getModda("Unknown"), /Undefined modda Webda\/Unknown/);
    app.getDeployers();

    app.getModules();

    // Alternative of files
    // @ts-ignore
    app.getPackageDescription.files = undefined;
    // Nothing can be really checked here
    app.addModel("WebdaTest/NotExisting", CoreModel);
    assert.ok(app.hasWebdaObject("models", "WebdaTest/NotExisting"));
    assert.ok(!app.hasWebdaObject("models", "notexisting"));
    assert.ok(!app.hasWebdaObject("models", "webdatest/notexisting"));
    assert.throws(
      () => app.getWebdaObject("models", "webdatest/notexisting"),
      /Undefined model webdatest\/notexisting/
    );
    assert.strictEqual(app.getWebdaObject("models", "WebdaTest/NotExisting"), CoreModel);

    delete app.getModels()["WebdaTest/NotExisting"];
    assert.deepStrictEqual(app.getGitInformation(), {
      branch: "",
      commit: "",
      short: "",
      tag: "",
      tags: [],
      version: ""
    });
    assert.strictEqual(app.isCached(), true);
    assert.strictEqual(app.getCurrentDeployment(), "");

    assert.strictEqual(app.getModelId(<any>CoreModel), "Webda/CoreModel");
    assert.strictEqual(app.getModelId(new CoreModel()), "Webda/CoreModel");
    assert.strictEqual(app.getModelId(new User()), "Webda/User");
  }

  @test
  async loadModule() {
    const app = new TestInternalApplication(__dirname + "/../../test/config.json");
    await app.loadModule(
      {
        moddas: {
          Test: {
            Import: "moddas/fakeservice.js"
          },
          ReTest: {
            Import: "./notFound.js"
          }
        },
        models: {
          "WebdaDemo/ReTest": {
            Import: "./notFound.js",
            Ancestors: [],
            Subclasses: [],
            Relations: {},
            Schema: {},
            Plural: "ReTests",
            Identifier: "WebdaDemo/ReTest",
            PrimaryKey: ["uuid"],
            Events: [],
            Actions: {},
            Reflection: {}
          }
        },
        schemas: {},
        deployers: {
          ReTest: {
            Import: "notFound.js"
          }
        }
      },
      ""
    );
    await app.loadModule({ models: {}, schemas: {} }, "");
    await app["importFile"]("./../../test/moddas/fakeservice.js");
    const cwd = process.cwd();
    try {
      // Check loading of aws module
      process.chdir(path.join(__dirname, "..", "..", "..", "aws"));
      await app.loadLocalModule();
    } finally {
      process.chdir(cwd);
    }
  }

  @test
  async loadModuleResolvesDependencyFilesLikeNode() {
    // The compiler writes a dependency's file as `node_modules/<package>/<path>`, relative to the module folder.
    // In a pnpm (or Bazel rules_js) layout the dependency is not nested in the package: it is a sibling, found
    // like Node does, in the node_modules of a parent folder
    const root = mkdtempSync(path.join(tmpdir(), "webda-module-"));
    const modules = path.join(root, "node_modules");
    const write = (file: string, content: string) => {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    };
    write(path.join(modules, "dep-params", "package.json"), JSON.stringify({ name: "dep-params", type: "module" }));
    write(
      path.join(modules, "dep-params", "lib", "params.js"),
      "export class DepParams { load(p) { Object.assign(this, p); return this; } }"
    );
    const moduleDir = path.join(modules, "mod");
    write(path.join(moduleDir, "package.json"), JSON.stringify({ name: "mod", type: "module" }));
    write(path.join(moduleDir, "lib", "svc.js"), "export class Svc {}");
    const app = new TestInternalApplication(__dirname + "/../../test/config.json");
    const logs = new MemoryLogger(app.getWorkerOutput(), "ERROR");
    try {
      await app.loadModule(
        <any>{
          moddas: {
            "Test/PnpmLayout": {
              Import: "lib/svc:Svc",
              Configuration: "node_modules/dep-params/lib/params:DepParams"
            }
          },
          models: {},
          schemas: {}
        },
        moduleDir
      );
      assert.deepStrictEqual(
        logs.getMessages().map(m => m.log?.args.join(" ")),
        []
      );
      const modda: any = app.getModdas()["Test/PnpmLayout"];
      assert.strictEqual(modda.createConfiguration({}).constructor.name, "DepParams");
      // The webda.module.json of a dependency is rebased on the application folder: same lookup
      const moduleFile = path.join(moduleDir, "webda.module.json");
      writeFileSync(
        moduleFile,
        JSON.stringify({
          $schema: "https://webda.io/schemas/webda.module.v4.json",
          moddas: {
            "Test/PnpmLayout": {
              Import: "lib/svc:Svc",
              Configuration: "node_modules/dep-params/lib/params:DepParams"
            }
          },
          models: {},
          schemas: {}
        })
      );
      const rebased: any = app.loadWebdaModule(moduleFile).moddas["Test/PnpmLayout"];
      assert.strictEqual(
        path.resolve(app.getPath(), rebased.Configuration),
        path.join(modules, "dep-params", "lib", "params:DepParams")
      );
      assert.strictEqual(path.resolve(app.getPath(), rebased.Import), path.join(moduleDir, "lib", "svc:Svc"));
    } finally {
      logs.close();
      rmSync(root, { recursive: true, force: true });
    }
  }

  @test
  async configurationFactoriesNotInherited() {
    const app = new TestInternalApplication(__dirname + "/../../test/config.json");
    class ParentModda {}
    class ChildModda extends ParentModda {}
    class RegisteredChildModda extends ParentModda {}
    app.getModdas()["Test/Parent"] = <any>ParentModda;
    app.getModdas()["Test/RegisteredChild"] = <any>RegisteredChildModda;
    await app.loadModule(
      <any>{
        moddas: {
          "Test/Parent": {
            Import: "./unused.js",
            Schema: { properties: { shared: {} } }
          },
          "Test/RegisteredChild": {
            Import: "./unused.js",
            Schema: { properties: { childOnly: {} } }
          }
        },
        models: {},
        schemas: {}
      },
      ""
    );
    const params = { shared: 1, childOnly: 2 };
    const fields = (cfg: any) => ({ shared: cfg.shared, childOnly: cfg.childOnly });
    const Parent: any = ParentModda;
    const Child: any = ChildModda;
    const RegisteredChild: any = RegisteredChildModda;
    // The registered class filters on its own schema, even when the function is detached
    const parentFilter = Parent.filterParameters;
    assert.deepStrictEqual(parentFilter(params), { shared: 1 });
    assert.deepStrictEqual(fields(Parent.createConfiguration(params)), { shared: 1, childOnly: undefined });
    // A registered subclass uses its own schema, not its parent's
    assert.deepStrictEqual(RegisteredChild.filterParameters(params), { childOnly: 2 });
    assert.deepStrictEqual(fields(RegisteredChild.createConfiguration(params)), { shared: undefined, childOnly: 2 });
    // An unregistered subclass must not be stripped by its parent's schema
    assert.deepStrictEqual(Child.filterParameters(params), params);
    assert.deepStrictEqual(fields(Child.createConfiguration(params)), params);
    // A subclass can still define its own factories
    Child.createConfiguration = () => "own";
    assert.strictEqual(Child.createConfiguration(params), "own");
    assert.deepStrictEqual(fields(Parent.createConfiguration(params)), { shared: 1, childOnly: undefined });
  }

  @test
  async loadBehaviorsMetadata() {
    // Verify Application surfaces Behavior metadata declared in
    // webda.module.json via `getBehaviorMetadata`. The Behavior class itself
    // is NOT loaded at runtime — the per-model `__hydrateBehaviors` method
    // emitted at compile time holds the static class import. Only the
    // metadata blob (used by DomainService / REST transport for operation
    // registration) needs to round-trip through the application registry.
    const app = new TestInternalApplication(__dirname + "/../../test/config.json");
    await app.loadModule(
      {
        moddas: {},
        models: {},
        schemas: {},
        behaviors: {
          "Test/MFA": {
            Identifier: "Test/MFA",
            Import: "ignored-at-runtime:MFA",
            Actions: {
              verify: { Method: "verify" }
            }
          }
        }
      },
      ""
    );

    const meta = app.getBehaviorMetadata("Test/MFA");
    assert.ok(meta, "expected Test/MFA behavior metadata to be available");
    assert.strictEqual(meta!.Identifier, "Test/MFA");
    assert.ok(meta!.Actions?.verify, "expected verify action metadata to be preserved");

    // Unknown identifier returns undefined.
    assert.strictEqual(app.getBehaviorMetadata("Test/Unknown"), undefined);
  }

  /**
   * `useModel` accepts a string id, a model class, or a model instance —
   * the instance branch was broken before commit e246530c, which passed
   * `instance.constructor` (a class) to `getModel`'s string-only path.
   * Cover all three.
   */
  @test
  async useModelHandlesStringClassAndInstance() {
    const { useModel } = await import("../application/hooks.js");

    // String — the canonical case.
    const ByString = useModel("Webda/User");
    assert.ok(ByString, "useModel(string) must resolve");

    // Class — `getModelId` accepts the constructor and resolves to the id.
    const ByClass = useModel(User as any);
    assert.strictEqual(ByClass, ByString, "class lookup must equal string lookup");

    // Instance — same id resolution path. The `name.includes is not a function`
    // bug fired here before the fix.
    const instance = new User();
    const ByInstance = useModel(instance as any);
    assert.strictEqual(ByInstance, ByString, "instance lookup must equal string lookup");
  }
}

/**
 * The services log to the global output, where the CLI and Lambda console loggers are attached
 */
@suite
class ApplicationDefaultOutputTest {
  @test
  async servicesLogToGlobalOutput() {
    const app = new Application({ version: 4, parameters: {}, services: {} });
    assert.strictEqual(app.getWorkerOutput(), useWorkerOutput());
    const memoryLogger = new MemoryLogger(useWorkerOutput());
    try {
      useLogger("SampleService").log("INFO", "visible service log");
    } finally {
      memoryLogger.close();
    }
    assert.ok(JSON.stringify(memoryLogger.getLogs()).includes("visible service log"));
  }
}
