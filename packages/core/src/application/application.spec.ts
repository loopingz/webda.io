import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as path from "path";
import { Application, UnpackedApplication, useApplication, validateSchema } from "../index";
import { CoreModel } from "../models/coremodel";
import { User } from "../models/user";
import { WebdaInternalTest, TestInternalApplication } from "../test/internal";
import { FileUtils, getCommonJS } from "@webda/utils";
import { TestApplication } from "../test/objects";
import { WebdaApplicationTest } from "../test/test";
const { __dirname } = getCommonJS(import.meta.url);

@suite
class SampleApplicationTest extends WebdaApplicationTest {
  sampleApp: TestApplication;

  async beforeEach(): Promise<void> {
    this.sampleApp = useApplication();
  }

  static getTestConfiguration() {
    return path.join(__dirname, "..", "..", "..", "..", "sample-app");
  }

  @test
  validateSchemaWithEnum() {
    assert.strictEqual(
      validateSchema(
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
        validateSchema(
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
  testObjectParameter() {
    assert.deepStrictEqual(
      this.sampleApp.replaceVariables(
        {
          test: true,
          bouzouf: {
            yop: "${resources.replace}",
            yop2: "\\${resources2.replace}"
          }
        },
        {
          resources: {
            replace: "Plop"
          }
        }
      ),
      {
        test: true,
        bouzouf: {
          yop: "Plop",
          yop2: "${resources2.replace}"
        }
      }
    );
  }

  @test
  configurationImports() {
    assert.strictEqual(this.sampleApp.getConfiguration().parameters!.import1, true);
    assert.strictEqual(this.sampleApp.getConfiguration().parameters!.import2, true);
    assert.strictEqual(this.sampleApp.getConfiguration().parameters!.import3, undefined);
  }

  @test
  testStringParameter() {
    assert.strictEqual(
      this.sampleApp.replaceVariables("${resources.replace}", {
        resources: {
          replace: "Plop"
        }
      }),
      "Plop"
    );
  }

  @test
  getAppPath() {
    assert.strictEqual(this.sampleApp.getAppPath(), path.join(__dirname, "..", "..", "..", "sample-app"));
    assert.strictEqual(this.sampleApp.getAppPath("lib"), path.join(__dirname, "..", "..", "..", "sample-app", "lib"));
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
  }

  @test
  async cov() {
    assert.throws(
      () => new Application("/notexisting"),
      /Not a webda application folder or webda.config.jsonc or webda.config.json file: unexisting.*/
    );
    await assert.rejects(
      () => new Application(__dirname + "/../../test/schemas").load(),
      /Not a webda application folder or webda.config.jsonc or webda.config.json file: .*/
    );
    await assert.rejects(() => new Application(__dirname + "/../../test/badapp").load(), /Cannot parse JSON of: .*/);
    // If allow module is enable the Application should let run anywhere
    new Application(__dirname + "/../../test/schemas", undefined);
    let unpackedApp = new UnpackedApplication(__dirname + "/../../test/badapp", undefined);
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
    app.getBeans();

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
    assert.strictEqual(app.replaceVariables("hello", {}), "hello");
    assert.strictEqual(app.replaceVariables("hello ${test} ${test2}", {}), "hello undefined undefined");
    assert.throws(
      () => app.replaceVariables("hello ${now && process.exit(666)}", {}),
      /Variable cannot use every javascript features/
    );
    assert.throws(
      () => app.replaceVariables("hello ${test} ${{ test}", {}),
      /Variable cannot use every javascript features/
    );
    assert.throws(() => app.replaceVariables("hello " + "${test}".repeat(12), {}), /Too many variables/);

    assert.strictEqual(app.getModelFromInstance(new CoreModel()), "Webda/CoreModel");
    assert.strictEqual(app.getModelFromInstance(new User()), "Webda/User");
    assert.strictEqual(app.getModelId(<any>CoreModel), "Webda/CoreModel");
    assert.strictEqual(app.getModelId(new CoreModel()), "Webda/CoreModel");

    app.registerSchema("testor", {});
    assert.deepStrictEqual(app.getSchema("testor"), {});
    assert.throws(() => app.registerSchema("testor", {}), /Schema testor already registered/);

    unpackedApp = new UnpackedApplication(__dirname + "/../../test/schemas", undefined);
    await unpackedApp.load();
    // @ts-ignore
    unpackedApp.baseConfiguration.cachedModules.project.webda = undefined;
    assert.deepStrictEqual(unpackedApp.getPackageWebda(), { namespace: "Webda" });
  }

  @test
  async loadModule() {
    const app = new TestInternalApplication(__dirname + "/../../test/config.json");
    await app.loadModule(
      {
        moddas: {
          Test: "moddas/fakeservice.js",
          ReTest: "./notFound.js"
        },
        models: {
          list: {
            ReTest: "notFound.js"
          },
          graph: {
            "webdademo/test": {}
          },
          tree: {},
          plurals: {},
          reflections: {}
        },
        deployers: {
          ReTest: "notFound.js"
        }
      },
      ""
    );
    await app.loadModule({ models: { list: {}, graph: {}, tree: {}, plurals: {}, reflections: {} } }, "");
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
}
