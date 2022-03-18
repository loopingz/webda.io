import * as assert from "assert";
import { WebdaTest } from "@webda/core/lib/test";
import { execSync } from "child_process";
import { CacheService, Application, Core, Module } from "@webda/core";
import { emptyDirSync } from "fs-extra/lib/empty";
import { removeSync } from "fs-extra/lib/remove";
import * as fs from "fs-extra";
import { suite, test } from "@testdeck/mocha";
import * as path from "path";
import { SourceApplication } from "./sourceapplication";
import * as sinon from "sinon";

@suite
class SourceApplicationTest extends WebdaTest {
  sampleApp: SourceApplication;

  async before() {
    await super.before();
    this.sampleApp = new SourceApplication(path.join(__dirname, "..", "..", "..", "sample-app"));
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
  cov() {
    assert.throws(() => this.sampleApp.getDeployment("invalid"), /Invalid deployment configuration /);
  }

  @test
  fromServiceType() {
    let app = new SourceApplication(__dirname + "/../test/config.json");
    // Add a fake deployer as no deployer are available within Core context
    app.addDeployer("Webda/Container", {});
    // For size reason, the SchemaResolver only work within shell context
    assert.strictEqual(app.getCompiler().schemaFromModda("Webda/FileStore"), undefined);
    assert.strictEqual(app.getCompiler().schemaFromModda("Webda/Container"), undefined);
    assert.strictEqual(app.getCompiler().schemaFromModda("Webda/CoreModel"), undefined);
    assert.strictEqual(app.getCompiler().schemaFromModda("unknown"), undefined);
    // Check if cached just use cache
    // @ts-ignore
    app.baseConfiguration.cachedModules = {
      schemas: {
        // @ts-ignore
        fake: 666
      }
    };
    assert.strictEqual(app.getCompiler().schemaFromModda("fake"), 666);
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
  getConfiguration() {
    let config = this.sampleApp.getConfiguration();
    let deploymentConfig = this.sampleApp.getConfiguration("Production");
    assert.strictEqual(deploymentConfig.parameters.accessKeyId, "PROD_KEY");
    assert.strictEqual(deploymentConfig.services.contacts.table, "webda-sample-app-contacts");
    assert.strictEqual(config.services.contacts.table, "local-table");
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

  @test
  compile() {
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

  cleanSampleApp() {
    fs.removeSync(this.sampleApp.getAppPath("lib"));
    execSync(`git checkout ${this.sampleApp.getAppPath("webda.module.json")}`);
  }

  @test
  compileError() {
    this.sampleApp.preventCompilation(false);
    const lines = [];
    sinon.stub(this.sampleApp, "log").callsFake((...args) => lines.push(args));
    const testFile = this.sampleApp.getAppPath("src/bouzouf.ts");
    fs.writeFileSync(testFile, "bad TS");
    try {
      this.sampleApp.compile();

      // assert files are there
      assert.deepStrictEqual(lines, [
        ["DEBUG", "Compiling application"],
        ["ERROR", "tsc:", "../../sample-app/src/bouzouf.ts(1,1): error TS1434: Unexpected keyword or identifier."]
      ]);
    } finally {
      fs.removeSync(testFile);
    }
  }

  @test
  generateModule() {
    this.cleanSampleApp();
    this.sampleApp.generateModule();
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("webda.module.json")), true);
    let config: Module = fs.readJSONSync(this.sampleApp.getAppPath("webda.module.json"));
    assert.strictEqual(config.moddas["WebdaDemo/CustomReusableService"], "lib/services/reusable.js");
    // Won't be find as it is in a test context
    assert.strictEqual(config.models["WebdaDemo/Contact"], "lib/models/contact.js");
    assert.strictEqual(config.deployers["WebdaDemo/CustomDeployer"], "lib/services/deployer.js");
    assert.deepStrictEqual(config.schemas["WebdaDemo/CustomDeployer"], { title: "CustomDeployer" });
    // COV one
    this.sampleApp.getPackagesLocations = () => {
      // @ts-ignore
      this.sampleApp._loaded = [this.sampleApp.getAppPath("plop")];
      return ["plop"];
    };
    this.sampleApp.generateModule();
  }

  @test
  loadModules() {
    fs.mkdirSync(this.sampleApp.getAppPath("node_modules"), { recursive: true });
    this.sampleApp.loadModules();
  }
}
