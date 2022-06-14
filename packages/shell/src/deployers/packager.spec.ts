import { suite, test } from "@testdeck/mocha";
import { getCommonJS } from "@webda/core";
import * as assert from "assert";
import { EventEmitter } from "events";
import * as fs from "fs";
import fse from "fs-extra";
import * as path from "path";
import * as sinon from "sinon";
import * as unzip from "unzipper";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { SourceTestApplication, WebdaSampleApplication } from "../index.spec";
import { Packager } from "./packager";
const { __dirname } = getCommonJS(import.meta.url);

export class WorkspaceTestApplication extends SourceTestApplication {
  loadConfiguration(file) {
    fse.mkdirSync(path.join(__dirname, "..", "..", "test", "fakeworkspace", "node_modules", "@webda"), {
      recursive: true
    });
    fse.mkdirSync("/tmp/.webda-unit-test", { recursive: true });
    try {
      fse.copySync(
        path.join(__dirname, "..", "..", "test", "fakeworkspace", "package2"),
        "/tmp/.webda-unit-test/package2"
      );
      [
        [path.join(__dirname, "..", "..", "..", "aws"), "@webda/aws"],
        [path.join(__dirname, "..", "..", "..", "core"), "@webda/core"],
        [path.join(__dirname, "..", "..", "test", "fakeworkspace", "package1"), "package1"],
        [path.join("/tmp/.webda-unit-test", "package2"), "package2"]
      ].forEach(link => {
        let dst = path.join(__dirname, "..", "..", "test", "fakeworkspace", "node_modules", ...link[1].split("/"));
        // Remove symbolic link
        try {
          if (fse.lstatSync(dst)) {
            fse.unlinkSync(dst);
          }
        } catch (err) {}
        fse.symlinkSync(link[0], dst);
      });
    } catch (err) {}
    return super.loadConfiguration(file);
  }

  clean() {
    fse.removeSync(path.join(__dirname, "..", "..", "test", "fakeworkspace", "link_modules"));
    fse.removeSync(path.join(__dirname, "..", "..", "test", "fakeworkspace", "node_modules"));
  }

  static async init(): Promise<WorkspaceTestApplication> {
    const app = new WorkspaceTestApplication(path.join(__dirname, "..", "..", "test", "fakeworkspace", "app1"));
    await app.load();
    return app;
  }
}
@suite
class PackagerTest {
  @test("simple")
  async package() {
    await WebdaSampleApplication.load();
    // Check override is ok
    let zipPath = path.join(WebdaSampleApplication.getAppPath(), "dist", "package-2");

    [
      WebdaSampleApplication.getAppPath("lib/services/dynamic.js"),
      WebdaSampleApplication.getAppPath("src/services/dynamic.ts")
    ].forEach(f => {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    });

    let deployer = new Packager(new DeploymentManager(WebdaSampleApplication, "Production"), {
      name: "deployer",
      type: "Packager",
      zipPath,
      includeLinkModules: true
    });
    await deployer.loadDefaults();
    await deployer.deploy();

    // Check webda.config.json contains cachedModules
    let files = {};
    let captureFiles = {
      "webda.config.json": ""
    };
    await new Promise((resolve, reject) =>
      fs
        .createReadStream(zipPath + ".zip")
        .pipe(unzip.Parse())
        .on("entry", async function (entry) {
          var fileName = entry.path;
          files[fileName] = true;
          if (captureFiles[fileName] === undefined) {
            entry.autodrain();
            return;
          }
          captureFiles[fileName] = (await entry.buffer()).toString();
        })
        .on("close", resolve)
        .on("error", reject)
    );
    //
    assert.notStrictEqual(files["lib/models/contact.js"], undefined);
    assert.notStrictEqual(files["lib/services/custom.js"], undefined);
    // As this fake app is in our repo the node_modules are incorrect
    // Manage workspaces
    assert.notStrictEqual(files["node_modules/@webda/aws/package.json"], undefined, "Cannot find @webda/aws package");
    assert.notStrictEqual(files["node_modules/@webda/core/package.json"], undefined, "Cannot find @webda/core package");
    // Should get the module
    assert.notStrictEqual(files["node_modules/uuid/package.json"], undefined, "Cannot find uuid package");
    let config = JSON.parse(captureFiles["webda.config.json"]);
    // Ensure CachedModules are generated for packages
    assert.notStrictEqual(config.cachedModules, undefined);
    assert.strictEqual(config.cachedModules.moddas["webdademo/customreusableservice"], "lib/services/reusable:default");
    assert.strictEqual(
      config.cachedModules.moddas["webda/awssecretsmanager"].endsWith("aws/lib/services/secretsmanager:default"),
      true
    );
    assert.strictEqual(config.cachedModules.models["webdademo/contact"], "lib/models/contact:default");
    assert.strictEqual(config.parameters.accessKeyId, "PROD_KEY");

    deployer = new Packager(new DeploymentManager(WebdaSampleApplication, "Production"), {
      name: "deployer",
      type: "Packager",
      entrypoint: "nope.js",
      zipPath,
      includeLinkModules: true
    });
    await deployer.loadDefaults();
    await assert.rejects(() => deployer.deploy(), /Cannot find the entrypoint for Packager: /);
  }

  @test
  async excludePackages() {
    await WebdaSampleApplication.load();
    let zipPath = path.join(WebdaSampleApplication.getAppPath(), "dist", "package-3");
    let deployer = new Packager(new DeploymentManager(WebdaSampleApplication, "Production"), {
      name: "deployer",
      type: "Packager",
      package: {
        modules: {
          includes: ["nonexisting"],
          excludes: ["bluebird"]
        }
      },
      entrypoint: WebdaSampleApplication.getAppPath("lib/services/bean.js"),
      zipPath,
      includeLinkModules: true
    });
    await deployer.loadDefaults();
    if (process.env["GITHUB_ACTION"] && process.version.startsWith("v16.")) {
      // For some reason GITHUB Node16 do not like this one
      // Can run test locally so will skip it in that context
      return;
    }
    await deployer.deploy();
  }

  @test
  getWorkspacesRoot() {
    assert.strictEqual(Packager.getWorkspacesRoot("/tmp"), undefined);
    fs.mkdirSync("/tmp/.git");
    try {
      assert.strictEqual(Packager.getWorkspacesRoot("/tmp"), undefined);
    } finally {
      fs.rmdirSync("/tmp/.git");
    }
  }

  @test
  getDependencies() {
    let cwd = process.cwd();
    try {
      process.chdir(path.join(__dirname, "..", "..", "..", ".."));
      Packager.getDependencies("packages/core");
    } finally {
      process.chdir(cwd);
    }
  }

  @test
  getResolvedDependencies() {
    // @ts-ignore
    let stub = sinon.stub(Packager, "getDependencies").callsFake(() => {
      return {
        yargs: [{ version: ">=1.0.0" }, { version: "<1.0.0" }]
      };
    });
    try {
      Packager.getResolvedDependencies("yargs");
      // @ts-ignore
      stub.callsFake(() => {
        return {
          yargs: [{ version: ">=0.9.8" }]
        };
      });
      assert.deepStrictEqual(Packager.getResolvedDependencies("yargs"), { yargs: ">=0.9.8" });
    } finally {
      stub.restore();
    }
  }

  @test
  async workspacesPackager() {
    const workspaceApp = await WorkspaceTestApplication.init();
    try {
      fse.removeSync(path.join(workspaceApp.getAppPath(), "dist"));
      let zipPath = path.join(workspaceApp.getAppPath(), "dist", "package-2");
      let deployer = new Packager(new DeploymentManager(workspaceApp, "Production"), {
        name: "deployer",
        type: "Packager",
        package: {
          modules: {
            includes: ["nonexisting"],
            excludes: ["bluebird"]
          }
        },
        zipPath,
        includeLinkModules: true
      });
      await deployer.loadDefaults();
      await deployer.deploy();

      // Do archive error
      let stub = sinon.stub(deployer, "getArchiver").callsFake(async () => {
        let evt = new EventEmitter();
        // @ts-ignore
        evt.pipe = () => {
          evt.emit("error", new Error("I/O"));
        };
        return evt;
      });
      try {
        // Should not retry to create package
        await deployer.deploy();
        deployer.packagesGenerated = {};
        await assert.rejects(() => deployer.deploy(), /I\/O/);
      } finally {
        stub.restore();
      }
    } finally {
      workspaceApp.clean();
    }
  }
}
