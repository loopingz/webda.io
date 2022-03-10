import * as assert from "assert";
import * as fs from "fs-extra";
import { suite, test } from "@testdeck/mocha";
import * as path from "path";
import { Application, CacheService, Core } from "./index";
import { WebdaTest } from "./test";
import { Module } from "./core";
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
  getDeployment() {
    let deployment = this.sampleApp.getDeployment("Dev");
    deployment = this.sampleApp.getDeployment("Production");
    assert.strictEqual(this.sampleApp.hasDeployment("Dev1"), false);
    assert.throws(() => this.sampleApp.getDeployment("Dev1"), /Unknown deployment/);
    this.sampleApp.setCurrentDeployment("Production");
    assert.strictEqual(this.sampleApp.hasDeployment("Production"), true);
    assert.deepStrictEqual(this.sampleApp.getDeployment(), deployment);
  }

  @test
  getConfiguration() {
    let config = this.sampleApp.getConfiguration();
    let deploymentConfig = this.sampleApp.getConfiguration("Production");
    assert.strictEqual(deploymentConfig.parameters.accessKeyId, "PROD_KEY");
    assert.strictEqual(deploymentConfig.services.contacts.table, "webda-sample-app-contacts");
    assert.strictEqual(config.services.contacts.table, "local-table");
  }

  @test
  async migrateV0toV2() {
    let webda = new Core(new Application(__dirname + "/../test/config.old.json"));
    await webda.init();
    // All services - DefinedMailer
    assert.strictEqual(Object.keys(webda.getServices()).length, 14);
    // Check locales are moved correctly
    assert.strictEqual(webda.getLocales().length, 3);
    // Check models - 2 from configuration files - 2 from Webda
    let count = 0;
    for (let key in webda.getModels()) {
      if (key.startsWith("webdatest")) {
        count++;
      }
    }
    assert.strictEqual(count, 2);
    // Check params
    assert.strictEqual(webda.getGlobalParams().TEST, "Global");
    assert.strictEqual(webda.getGlobalParams().region, "us-east-1");
    // Check custom route migration
    let ctx = await this.newContext();
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notStrictEqual(executor, undefined);
  }

  @test
  async migrateV0toV2DefaultDomain() {
    let webda = new Core(new Application(__dirname + "/../test/config.old-default.json"));
    await webda.init();
    // All services - DefinedMailer
    assert.strictEqual(Object.keys(webda.getServices()).length, 14);
    // Check locales are moved correctly
    assert.strictEqual(webda.getLocales().length, 3);
    // Check models - 2 from configuration files - 2 from Webda
    let count = 0;
    for (let key in webda.getModels()) {
      if (key.startsWith("webdatest")) {
        count++;
      }
    }
    assert.strictEqual(count, 2);
    webda.getConfiguration().parameters["sessionSecret"] =
      "Lp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5EN";
    // Check custom route migration
    let ctx = await this.newContext();
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notStrictEqual(executor, undefined);
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
    app.setSchemaResolver(null);
    app.getPackageWebda();
    assert.throws(() => app.getService("Unknown"), /Undefined service Unknown/);
    app.getDeployers();
    assert.throws(() => app.getDeployment("invalid"), /Invalid deployment configuration /);
    app.getModules();

    // Alternative of files
    // @ts-ignore
    app.getPackageDescription.files = undefined;
    //assert.deepStrictEqual(app.getPackagesLocations(), ["lib/**/*.js"]);
  }

  @test
  loadJavascriptFile() {
    let app = new Application(__dirname + "/../test/config.old-default.json");
    // @ts-ignore
    let fct = app.loadJavascriptFile.bind(app);
    fct(path.join(__dirname, "..", "test", "models", "task.js"));
    fct(path.join(__dirname, "..", "test", "models", "task.js"));
    fct(path.join(__dirname, "..", "test", "moddas", "fakeservice.js"));
  }

  @test
  fromServiceType() {
    let app = new Application(__dirname + "/../test/config.json");
    // Add a fake deployer as no deployer are available within Core context
    app.addDeployer("Webda/Container", {});
    // For size reason, the SchemaResolver only work within shell context
    assert.strictEqual(app.getSchemaResolver().fromServiceType("Webda/FileStore"), undefined);
    assert.strictEqual(app.getSchemaResolver().fromServiceType("Webda/Container"), undefined);
    assert.strictEqual(app.getSchemaResolver().fromServiceType("Webda/CoreModel"), undefined);
    assert.strictEqual(app.getSchemaResolver().fromServiceType("unknown"), undefined);
    // Check if cached just use cache
    // @ts-ignore
    app.baseConfiguration.cachedModules = {
      schemas: {
        // @ts-ignore
        fake: 666
      }
    };
    assert.strictEqual(app.getSchemaResolver().fromServiceType("fake"), 666);
  }

  @test
  getFullNameFromPrototype() {
    let app = new Application(__dirname + "/../test/config.json");
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
  loadModule() {
    let app = new Application(__dirname + "/../test/config.json");
    app.loadModule(
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
    app.loadModule({});
    app.resolveRequire("./../test/moddas/fakeservice.js");
    let cwd = process.cwd();
    try {
      // Check loading of aws module
      process.chdir(path.join(__dirname, "..", "..", "aws"));
      app.loadLocalModule();
    } finally {
      process.chdir(cwd);
    }
  }

  @test
  gitInformations() {
    let app = new Application(__dirname + "/../test/badapp", undefined, true);
    try {
      let options = {
        cwd: app.getAppPath()
      };
      // Create a repo
      execSync("git init", options);
      execSync('git config user.email "you@example.com"', options);
      execSync('git config user.name "Your Name"', options);
      execSync("git add webda.config.json", options);
      execSync("git commit -n -m 'plop'", options);
      // Basic with no tags
      CacheService.clearAllCache();
      let infos = app.getGitInformation();
      assert.ok(infos.branch.match(/(master)|(main)/) !== null);
      assert.strictEqual(infos.tag, "");
      assert.strictEqual(infos.tags.length, 0);
      assert.ok(infos.version.match(/0\.1\.1\+\d+/) !== null);
      execSync("git tag v0.1.0", options);
      CacheService.clearAllCache();
      // Basic with one tag v0.1.0
      infos = app.getGitInformation();
      assert.strictEqual(infos.tag, "v0.1.0");
      assert.strictEqual(infos.tags.length, 1);
      assert.strictEqual(infos.tags[0], "v0.1.0");
      assert.strictEqual(infos.version, "0.1.0");
      execSync("git tag badapp@0.1.0", options);
      // Basic with two tags badapp@0.1.0 and v0.1.0
      CacheService.clearAllCache();
      infos = app.getGitInformation();
      assert.strictEqual(infos.tag, "badapp@0.1.0");
      assert.strictEqual(infos.tags.length, 2);
      assert.deepStrictEqual(infos.tags, ["badapp@0.1.0", "v0.1.0"]);
      assert.strictEqual(infos.version, "0.1.0");
      emptyDirSync(app.getAppPath(".git"));
      CacheService.clearAllCache();
      // Running git on / should fail
      // @ts-ignore
      app.appPath = "/";
      assert.deepStrictEqual(app.getGitInformation(), {
        commit: "unknown",
        branch: "unknown",
        tag: "",
        short: "00000000",
        tags: [],
        version: "0.1.0"
      });
    } finally {
      removeSync(app.getAppPath(".git"));
    }
  }
}
