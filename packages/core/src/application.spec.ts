import * as assert from "assert";
import * as fs from "fs-extra";
import { suite, test } from "@testdeck/mocha";
import * as path from "path";
import { Application, Core } from "./index";
import { WebdaTest } from "./test";

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
  getAppPath() {
    assert.strictEqual(this.sampleApp.getAppPath(), path.join(__dirname, "..", "..", "..", "sample-app"));
    assert.strictEqual(this.sampleApp.getAppPath("lib"), path.join(__dirname, "..", "..", "..", "sample-app", "lib"));
  }

  @test
  compile() {
    assert.strictEqual(this.sampleApp.isTypescript(), true);
    this.cleanSampleApp();
    this.sampleApp.preventCompilation(true);
    this.sampleApp.compile();
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("lib")), false);
    this.sampleApp.preventCompilation(false);
    this.sampleApp.compile();
    // assert files are there
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("lib")), true);
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("lib/services/bean.js")), true);
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("lib/models/contact.js")), true);

    this.cleanSampleApp();
    // should not recreate
    this.sampleApp.compile();
    // Should not recompile as it should be cached
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("lib")), false);
  }

  @test
  generateModule() {
    this.cleanSampleApp();
    this.sampleApp.generateModule();
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("webda.module.json")), true);
    let config = fs.readJSONSync(this.sampleApp.getAppPath("webda.module.json"));
    assert.strictEqual(config.services["WebdaDemo/CustomReusableService"], "lib/services/reusable.js");
    // Won't be find as it is in a test context
    assert.strictEqual(config.models["WebdaDemo/Contact"], "lib/models/contact.js");
    assert.strictEqual(config.deployers["WebdaDemo/CustomDeployer"], "lib/services/deployer.js");
  }

  @test
  loadModules() {
    this.sampleApp.loadModules();
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
    assert.strictEqual(Object.keys(webda.getServices()).length, 13);
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
    assert.strictEqual(Object.keys(webda.getServices()).length, 13);
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
}
