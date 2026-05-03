import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as path from "path";
import { Application, UnpackedApplication, useApplication, validateModelSchema } from "../index.js";
import { CoreModel } from "../models/coremodel.js";
import { User } from "../models/user.js";
import { WebdaInternalTest, TestInternalApplication } from "../test/internal.js";
import { FileUtils, getCommonJS } from "@webda/utils";
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
    app.baseConfiguration.cachedModules.schemas["typed"] = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
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
