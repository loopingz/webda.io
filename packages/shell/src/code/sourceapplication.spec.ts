import { suite, test } from "@testdeck/mocha";
import { CacheService, ConsoleLoggerService, Core, FileUtils, Module, getCommonJS } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { execSync } from "child_process";
import fs from "fs-extra";
import * as path from "path";
import * as sinon from "sinon";
import { SourceTestApplication } from "../index.spec";
import { BuildSourceApplication, SourceApplication } from "./sourceapplication";
const { __dirname } = getCommonJS(import.meta.url);

@suite
class SourceApplicationTest extends WebdaTest {
  sampleApp: SourceApplication;

  async before() {
    await super.before();
    this.sampleApp = new SourceTestApplication(path.join(__dirname, "..", "..", "..", "..", "sample-app"));
    await this.sampleApp.load();
  }

  /**
   * @override
   */
  protected async buildWebda() {
    const app = new SourceTestApplication(this.getTestConfiguration());
    await app.load();

    this.webda = new Core(app);
    if (this.addConsoleLogger) {
      // @ts-ignore - Hack a ConsoleLogger in
      this.webda.services["ConsoleLogger"] = new ConsoleLoggerService(this.webda, "ConsoleLogger", {});
    }
  }

  getTestConfiguration() {
    return path.join(__dirname, "..", "..", "..", "..", "sample-app");
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
  cov() {
    assert.throws(() => this.sampleApp.getDeployment("invalid"), /Error: Unknown deployment/);
    // Simple getters
    this.sampleApp.getPackagesLocations();
    this.sampleApp.getNamespace();
    try {
      process.env.GIT_INFO = "eyJjb21taXQiOiJmYWtlT25lIn0=";
      assert.strictEqual(this.sampleApp.getGitInformation().commit, "fakeOne");
    } finally {
      delete process.env.GIT_INFO;
    }
  }

  @test
  getConfiguration() {
    const config = this.sampleApp.getConfiguration();
    const deploymentConfig = this.sampleApp.getConfiguration("Production");
    assert.strictEqual(deploymentConfig.parameters.accessKeyId, "PROD_KEY");
    assert.strictEqual(deploymentConfig.services.contacts.table, "webda-sample-app-contacts");
    assert.strictEqual(config.services.contacts.table, "local-table");
    assert.strictEqual(deploymentConfig.parameters.trustedProxies, "127.0.0.1, ::1");
  }

  @test
  gitInformations() {
    const app = new SourceApplication(__dirname + "/../../../core/test/badapp", undefined);
    try {
      const options = {
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
      let infos = app.getGitInformation("badapp", "0.1.0");
      assert.ok(infos.branch.match(/(master)|(main)/) !== null);
      assert.strictEqual(infos.tag, "");
      assert.strictEqual(infos.tags.length, 0);
      assert.ok(infos.version.match(/0\.1\.1\+\d+/) !== null);
      execSync("git tag v0.1.0", options);
      CacheService.clearAllCache();
      // Basic with one tag v0.1.0
      infos = app.getGitInformation("badapp", "0.1.0");
      assert.strictEqual(infos.tag, "v0.1.0");
      assert.strictEqual(infos.tags.length, 1);
      assert.strictEqual(infos.tags[0], "v0.1.0");
      assert.strictEqual(infos.version, "0.1.0");
      execSync("git tag badapp@0.1.0", options);
      // Basic with two tags badapp@0.1.0 and v0.1.0
      CacheService.clearAllCache();
      infos = app.getGitInformation("badapp", "0.1.0");
      assert.strictEqual(infos.tag, "badapp@0.1.0");
      assert.strictEqual(infos.tags.length, 2);
      assert.deepStrictEqual(infos.tags, ["badapp@0.1.0", "v0.1.0"]);
      assert.strictEqual(infos.version, "0.1.0");
      fs.emptyDirSync(app.getAppPath(".git"));
      CacheService.clearAllCache();
      // Running git on / should fail
      // @ts-ignore
      app.appPath = "/";
      assert.deepStrictEqual(app.getGitInformation("badapp", "0.1.0"), {
        commit: "unknown",
        branch: "unknown",
        tag: "",
        short: "00000000",
        tags: [],
        version: "0.1.0"
      });
    } finally {
      fs.removeSync(app.getAppPath(".git"));
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
    this.sampleApp.generateModule();
    // assert files are there
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("lib")), true);
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("lib/services/bean.js")), true);
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("lib/models/contact.js")), true);

    // Cheeck the module
    const module: Module = FileUtils.load(this.sampleApp.getAppPath("webda.module.json"));
    module.models ??= {
      list: {},
      graph: {},
      tree: {},
      plurals: {},
      shortIds: {},
      reflections: {}
    };
    module.beans ??= {};
    // Abstract project should not be there
    assert.strictEqual(module.models["WebdaDemo/AbstractProject"], undefined);
    // Subsubproject2 should not be there as it is not exported
    assert.strictEqual(module.models["WebdaDemo/SubSubProject2"], undefined);
    // The @Webda/Ignore should prevent the export of the model
    assert.strictEqual(module.models["WebdaDemo/SubSubProject3"], undefined);
    // The bean is not extending Service
    assert.strictEqual(module.beans["WebdaDemo/SampleAppBadBean"], undefined);

    // Check for good objects
    assert.notStrictEqual(module.models.list["WebdaDemo/SubSubProject"], undefined);
    assert.notStrictEqual(module.models.list["WebdaDemo/SubProject"], undefined);
    assert.notStrictEqual(module.models.list["WebdaDemo/Project"], undefined);
    console.log(module);
    assert.notStrictEqual(module.beans["WebdaDemo/BeanService"], undefined);
    assert.notStrictEqual(module.beans["WebdaDemo/SampleAppGoodBean"], undefined);

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
  async compileError() {
    this.sampleApp.preventCompilation(false);
    const lines = [];
    sinon.stub(this.sampleApp, "log").callsFake((...args) => lines.push(args));
    const testFile = this.sampleApp.getAppPath("src/bouzouf.ts");
    fs.writeFileSync(testFile, "bad TS");
    try {
      this.sampleApp.compile();

      // assert files are there
      assert.deepStrictEqual(lines, [
        ["INFO", "Compiling..."],
        [
          "WARN",
          "../../sample-app/src/bouzouf.ts(1,1): error TS1434: Unexpected keyword or identifier.\n../../sample-app/src/bouzouf.ts(1,1): error TS2304: Cannot find name 'bad'.\n../../sample-app/src/bouzouf.ts(1,5): error TS2304: Cannot find name 'TS'.\n"
        ],
        ["INFO", "Analyzing..."]
      ]);
      // Verify generateModule stop
      assert.strictEqual(await this.sampleApp.generateModule(), false);
    } finally {
      fs.removeSync(testFile);
    }
  }

  @test
  async generateModule() {
    this.cleanSampleApp();
    await this.sampleApp.generateModule();
    assert.strictEqual(fs.existsSync(this.sampleApp.getAppPath("webda.module.json")), true);
    const config: Module = fs.readJSONSync(this.sampleApp.getAppPath("webda.module.json"));
    assert.strictEqual(config.moddas["WebdaDemo/CustomReusableService"], "lib/services/reusable:default");
    // Won't be find as it is in a test context
    assert.strictEqual(config.models.list["WebdaDemo/Contact"], "lib/models/contact:default");
    assert.strictEqual(config.deployers["WebdaDemo/CustomDeployer"], "lib/services/deployer:CustomDeployer");
    console.log(Object.keys(config.schemas));
    assert.deepStrictEqual(config.schemas["WebdaDemo/CustomDeployer"].title, "CustomDeployer");
    const app = new BuildSourceApplication(this.sampleApp.getAppPath());
    const stub = sinon.stub(app, "compile").callsFake(() => false);
    try {
      await app.generateModule();
    } finally {
      stub?.restore();
    }
    // COV one
    this.sampleApp.getPackagesLocations = () => {
      // @ts-ignore
      this.sampleApp._loaded = [this.sampleApp.getAppPath("plop")];
      return ["plop"];
    };
    await this.sampleApp.generateModule();
  }
}
