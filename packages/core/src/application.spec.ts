import * as assert from "assert";
import * as fs from "fs-extra";
import { suite, test } from "mocha-typescript";
import * as path from "path";
import { Application, Core } from "./index";
import { WebdaTest } from "./test";

@suite
class ApplicationTest extends WebdaTest {
  sampleApp: Application;

  async before() {
    await super.before();
    this.sampleApp = new Application(path.join(__dirname, "..", "..", "sample-app"));
  }

  cleanSampleApp() {
    fs.removeSync(this.sampleApp.getAppPath("lib"));
    fs.removeSync(this.sampleApp.getAppPath("webda.module.json"));
  }

  @test
  getAppPath() {
    assert.equal(this.sampleApp.getAppPath(), path.join(__dirname, "..", "..", "sample-app"));
    assert.equal(this.sampleApp.getAppPath("lib"), path.join(__dirname, "..", "..", "sample-app", "lib"));
  }

  @test
  compile() {
    assert.equal(this.sampleApp.isTypescript(), true);
    this.cleanSampleApp();
    this.sampleApp.compile();
    // assert files are there
    assert.equal(fs.existsSync(this.sampleApp.getAppPath("lib")), true);
    assert.equal(fs.existsSync(this.sampleApp.getAppPath("lib/services/bean.js")), true);
    assert.equal(fs.existsSync(this.sampleApp.getAppPath("lib/models/contact.js")), true);

    this.cleanSampleApp();
    // should not recreate
    this.sampleApp.compile();
    // Should not recompile as it should be cached
    assert.equal(fs.existsSync(this.sampleApp.getAppPath("lib")), false);
  }

  @test
  generateModule() {
    this.cleanSampleApp();
    this.sampleApp.generateModule();
    assert.equal(fs.existsSync(this.sampleApp.getAppPath("webda.module.json")), true);
    let config = fs.readJSONSync(this.sampleApp.getAppPath("webda.module.json"));
    assert.equal(config.services["WebdaDemo/CustomReusableService"], "lib/services/reusable.js");
    assert.equal(config.models["WebdaDemo/Contact"], "lib/models/contact.js");
    assert.equal(config.deployers["WebdaDemo/CustomDeployer"], "lib/services/deployer.js");
  }

  @test
  loadModules() {
    this.sampleApp.loadModules();
  }

  @test
  getDeployment() {
    let deployment = this.sampleApp.getDeployment("Dev");
    deployment = this.sampleApp.getDeployment("Production");
    assert.throws(() => this.sampleApp.getDeployment("Dev1"), /Unknown deployment/);
    this.sampleApp.setCurrentDeployment("Production");
    assert.deepEqual(this.sampleApp.getDeployment(), deployment);
  }

  @test
  getConfiguration() {
    let config = this.sampleApp.getConfiguration();
    let deploymentConfig = this.sampleApp.getConfiguration("Production");
    assert.equal(deploymentConfig.parameters.accessKeyId, "PROD_KEY");
    assert.equal(config.parameters, undefined);
    assert.equal(deploymentConfig.services.store.table, "production-table");
    assert.equal(config.services.store.table, "dev-table");
  }

  @test
  async migrateV0toV2() {
    let webda = new Core(new Application(__dirname + "/../test/config.old.json"));
    await webda.init();
    // All services - DefinedMailer
    assert.equal(Object.keys(webda.getServices()).length, 12);
    // Check locales are moved correctly
    assert.equal(webda.getLocales().length, 3);
    // Check models - 2 from configuration files - 2 from Webda
    let count = 0;
    for (let key in webda.getModels()) {
      if (key.startsWith("webdatest")) {
        count++;
      }
    }
    assert.equal(count, 2);
    // Check params
    assert.equal(webda.getGlobalParams().TEST, "Global");
    assert.equal(webda.getGlobalParams().region, "us-east-1");
    // Check custom route migration
    let ctx = await this.newContext();
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notEqual(executor, undefined);
  }

  @test
  async migrateV0toV2DefaultDomain() {
    let webda = new Core(new Application(__dirname + "/../test/config.old-default.json"));
    await webda.init();
    // All services - DefinedMailer
    assert.equal(Object.keys(webda.getServices()).length, 12);
    // Check locales are moved correctly
    assert.equal(webda.getLocales().length, 3);
    // Check models - 2 from configuration files - 2 from Webda
    let count = 0;
    for (let key in webda.getModels()) {
      if (key.startsWith("webdatest")) {
        count++;
      }
    }
    assert.equal(count, 2);
    webda.getConfiguration().parameters["sessionSecret"] =
      "Lp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5EN";
    // Check custom route migration
    let ctx = await this.newContext();
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notEqual(executor, undefined);
  }
}
