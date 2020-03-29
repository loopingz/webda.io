import * as assert from "assert";
import * as fs from "fs";
import * as streams from "memory-streams";
import { suite, test } from "mocha-typescript";
import * as path from "path";
import * as unzip from "unzipper";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaSampleApplication } from "../index.spec";
import { Packager } from "./packager";

@suite
class PackagerTest {
  @test("simple")
  async package() {
    // Check override is ok
    let zipPath = path.join(
      WebdaSampleApplication.getAppPath(),
      "dist",
      "package-2.zip"
    );

    let deployer = new Packager(
      new DeploymentManager(WebdaSampleApplication.getAppPath(), "Production"),
      {
        zipPath
      }
    );

    await deployer.deploy();

    //let infos = zlib.unzipSync(zipFile);
    // Check webda.config.json contains cachedModules
    let files = {};
    let captureFiles = {
      "webda.config.json": ""
    };
    await new Promise(resolve =>
      fs
        .createReadStream(zipPath)
        // @ts-ignore
        .pipe(unzip.Parse())
        .on("entry", function(entry) {
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
            captureFiles[fileName] = writer.toBuffer().toString();
          });
        })
        .on("close", resolve)
    );
    //
    assert.notEqual(files["lib/models/contact.js"], undefined);
    assert.notEqual(files["lib/services/custom.js"], undefined);
    assert.notEqual(files["node_modules/@webda/aws/package.json"], undefined);
    assert.notEqual(files["node_modules/@webda/core/package.json"], undefined);
    let config = JSON.parse(captureFiles["webda.config.json"]);
    // Ensure CachedModules are generated for packages
    assert.notEqual(config.cachedModules, undefined);
    assert.equal(
      config.cachedModules.services["WebdaDemo/CustomReusableService"],
      "./lib/services/reusable.js"
    );
    assert.equal(
      config.cachedModules.services["Webda/AWSSecretsManager"],
      "./node_modules/@webda/aws/lib/secretsmanager.js"
    );
    assert.equal(
      config.cachedModules.models["WebdaDemo/Contact"],
      "./lib/models/contact.js"
    );
    assert.deepEqual(config.cachedModules.sources, [
      "./lib/models/contact.js",
      "./lib/services/bean.js",
      "./lib/services/custom.js",
      "./lib/services/deployer.js",
      "./lib/services/dynamic.js",
      "./lib/services/reusable.js"
    ]);
    assert.equal(config.parameters.accessKeyId, "PROD_KEY");
  }
}
