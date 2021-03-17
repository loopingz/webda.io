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

    //let infos = zlib.unzipSync(zipFile);
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
          var type = entry.type; // 'Directory' or 'File'
          var size = entry.size;
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
  }
}
