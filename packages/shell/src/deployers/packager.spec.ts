import * as assert from "assert";
import * as fs from "fs";
import * as streams from "memory-streams";
import { suite, test } from "@testdeck/mocha";
import * as path from "path";
import * as unzip from "unzipper";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaSampleApplication } from "../index.spec";
import { Packager } from "./packager";
import { WorkerOutput } from "@webda/workout";
import * as fse from "fs-extra";
import { Application } from "@webda/core";
import * as sinon from "sinon";
import { EventEmitter } from "events";

function createComplexApp() {
  /**
   * Create a structure in /
   */
  fse.mkdirSync("/tmp/workspace");
  fse.copySync(WebdaSampleApplication.getAppPath(), "/tmp/workspace/sample-app");
  // Create some symlink
}

const WorkspaceApp = new Application(path.join(__dirname, "..", "..", "test", "fakeworkspace", "app1"));
export { WorkspaceApp };

fse.mkdirSync(path.join(__dirname, "..", "..", "test", "fakeworkspace", "node_modules", "@webda"), { recursive: true });
try {
  fse.symlinkSync(
    path.join(__dirname, "..", "..", "..", "aws"),
    path.join(__dirname, "..", "..", "test", "fakeworkspace", "node_modules", "@webda", "aws")
  );
  fse.symlinkSync(
    path.join(__dirname, "..", "..", "test", "fakeworkspace", "package1"),
    path.join(__dirname, "..", "..", "test", "fakeworkspace", "node_modules", "package1")
  );
} catch (err) {}

@suite
class PackagerTest {
  @test("simple")
  async package() {
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

    let deployer = new Packager(
      new DeploymentManager(new WorkerOutput(), WebdaSampleApplication.getAppPath(), "Production"),
      {
        name: "deployer",
        type: "Packager",
        zipPath,
        includeLinkModules: true
      }
    );
    await deployer.loadDefaults();
    await deployer.deploy();

    // Check webda.config.json contains cachedModules
    let files = {};
    let captureFiles = {
      "webda.config.json": ""
    };
    await new Promise(resolve =>
      fs
        .createReadStream(zipPath + ".zip")
        // @ts-ignore
        .pipe(unzip.Parse())
        .on("entry", function (entry) {
          var fileName = entry.path;
          files[fileName] = true;
          if (captureFiles[fileName] === undefined) {
            entry.autodrain();
            return;
          }
          var writer = new streams.WritableStream();
          entry.pipe(writer);
          entry.on("end", () => {
            // Do not cache in memory all files
            if (fileName === "webda.config.json") {
              captureFiles[fileName] = writer.toBuffer().toString();
            } else {
              captureFiles[fileName] = true;
            }
          });
        })
        .on("close", resolve)
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
    assert.strictEqual(config.cachedModules.services["WebdaDemo/CustomReusableService"], "./lib/services/reusable.js");
    assert.strictEqual(
      config.cachedModules.services["Webda/AWSSecretsManager"].endsWith(
        "node_modules/@webda/aws/lib/services/secretsmanager.js"
      ),
      true
    );
    assert.strictEqual(config.cachedModules.models["WebdaDemo/Contact"], "./lib/models/contact.js");
    assert.deepStrictEqual(config.cachedModules.sources, [
      "./lib/models/contact.js",
      "./lib/services/bean.js",
      "./lib/services/custom.js",
      "./lib/services/deployer.js",
      "./lib/services/reusable.js"
    ]);
    assert.strictEqual(config.parameters.accessKeyId, "PROD_KEY");
    deployer = new Packager(
      new DeploymentManager(new WorkerOutput(), WebdaSampleApplication.getAppPath(), "Production"),
      {
        name: "deployer",
        type: "Packager",
        entrypoint: "nope.js",
        zipPath,
        includeLinkModules: true
      }
    );
    await deployer.loadDefaults();
    await assert.rejects(() => deployer.deploy(), /Cannot find the entrypoint for Packager: /);
    deployer = new Packager(
      new DeploymentManager(new WorkerOutput(), WebdaSampleApplication.getAppPath(), "Production"),
      {
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
      }
    );
    await deployer.loadDefaults();
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
  getResolvedDependencies() {
    let stub = sinon.stub(Packager, "getDependencies").callsFake(() => {
      return {
        yargs: [{ version: ">=1.0.0" }, { version: "<1.0.0" }]
      };
    });
    try {
      Packager.getResolvedDependencies("yargs");
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
    fse.removeSync(path.join(WorkspaceApp.getAppPath(), "dist"));
    let zipPath = path.join(WorkspaceApp.getAppPath(), "dist", "package-2");
    let deployer = new Packager(new DeploymentManager(new WorkerOutput(), WorkspaceApp.getAppPath(), "Production"), {
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
    let stub = sinon.stub(deployer, "getArchiver").callsFake(() => {
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
  }
}
