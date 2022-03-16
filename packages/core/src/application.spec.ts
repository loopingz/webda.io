import * as assert from "assert";
import * as fs from "fs-extra";
import { suite, test } from "@testdeck/mocha";
import * as path from "path";
import { Application, CacheService, Core } from "./index";
import { TestApplication, WebdaTest } from "./test";
import { removeSync, emptyDirSync } from "fs-extra";
import { execSync } from "child_process";
import * as sinon from "sinon";

@suite
class ApplicationTest extends WebdaTest {
  sampleApp: Application;

  async before() {
    await super.before();
    this.sampleApp = new Application(path.join(__dirname, "..", "..", "..", "sample-app"));
  }

  cleanSampleApp() {
    fs.removeSync(this.sampleApp.getAppPath("lib"));
    fs.removeSync(this.sampleApp.getAppPath("webda.module.json"));
  }

  @test
  testObjectParameter() {
    assert.deepStrictEqual(
      this.sampleApp.replaceVariables(
        {
          test: true,
          bouzouf: {
            yop: "${resources.replace}"
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
          yop: "Plop"
        }
      }
    );
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
    let config = this.sampleApp.getConfiguration();
  }

  @test
  cov() {
    assert.throws(
      () => new Application("/notexisting"),
      /Not a webda application folder or webda.config.jsonc or webda.config.json file: unexisting.*/
    );
    assert.throws(
      () => new Application(__dirname + "/../test/moddas"),
      /Not a webda application folder or webda.config.jsonc or webda.config.json file: .*/
    );
    assert.throws(() => new Application(__dirname + "/../test/badapp"), /Cannot parse JSON of: .*/);
    // If allow module is enable the Application should let run anywhere
    new Application(__dirname + "/../test/moddas", undefined, true);
    new Application(__dirname + "/../test/badapp", undefined, true);
    // Read cached modules
    let app = new Application(__dirname + "/../test/cachedapp", undefined, true);
    // No package.json should not fail although more than abnormal
    app.loadPackageInfos();
    app = new Application(__dirname + "/../test/config.old-default.json");
    assert.ok(!app.extends(null, String));

    app.getPackageWebda();
    assert.throws(() => app.getService("Unknown"), /Undefined service Unknown/);
    app.getDeployers();

    app.getModules();

    // Alternative of files
    // @ts-ignore
    app.getPackageDescription.files = undefined;
    // Nothing can be really checked here
    app.addModel("WebdaTest/NotExisting", null);
    app.addDeployer("WebdaTest/NotExisting", null);
    delete app.getModels()["webdatest/notexisting"];
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

    //assert.deepStrictEqual(app.getPackagesLocations(), ["lib/**/*.js"]);
  }

  @test
  async getFullNameFromPrototype() {
    let app = new TestApplication(__dirname + "/../test/config.json");
    await app.loadModules();
    await app.load();
    let services: any = app.getServices();
    let name = Object.keys(services).pop();
    let service: any = services[name].prototype;
    assert.strictEqual(app.getFullNameFromPrototype(service), name);
    // Cheat for deployer
    services = app.getModels();
    name = Object.keys(services).pop();
    service = services[name].prototype;
    app.addDeployer("Plop/Test", services[name]);
    assert.strictEqual(app.getFullNameFromPrototype(service), "plop/test");
  }

  @test
  async loadModule() {
    let app = new Application(__dirname + "/../test/config.json");
    await app.loadModule(
      {
        services: {
          Test: "moddas/fakeservice.js",
          ReTest: "./notFound.js"
        },
        models: {
          ReTest: "notFound.js"
        },
        deployers: {
          ReTest: "notFound.js"
        }
      },
      ""
    );
    await app.loadModule({});
    await app.importFile("./../test/moddas/fakeservice.js");
    let cwd = process.cwd();
    try {
      // Check loading of aws module
      process.chdir(path.join(__dirname, "..", "..", "aws"));
      await app.loadLocalModule();
    } finally {
      process.chdir(cwd);
    }
  }
}
