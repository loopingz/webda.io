import { suite, test } from "@testdeck/mocha";
import { getCommonJS } from "@webda/core";
import { DeploymentManager } from "@webda/shell";
import { DeployerTest } from "@webda/shell/lib/deployers/deployertest";
import * as assert from "assert";
import * as path from "path";
import { LambdaPackager } from "./lambdapackager";
const { __dirname } = getCommonJS(import.meta.url);

@suite
class LambdaPackagerTest extends DeployerTest<LambdaPackager> {
  async getDeployer(manager: DeploymentManager): Promise<LambdaPackager> {
    return new LambdaPackager(manager, { name: "deployer", type: "LambdaPackager", zipPath: "test.zip" });
  }

  @test
  async loadDefault() {
    await this.deployer.loadDefaults();
    assert.strictEqual(this.deployer.resources.entrypoint, path.join(__dirname, "lambda-entrypoint.js"));
    this.deployer.resources.entrypoint = "mine.js";
    await this.deployer.loadDefaults();
    assert.strictEqual(this.deployer.resources.entrypoint, "mine.js");
    let other = new LambdaPackager(this.manager, {
      name: "deployer2",
      type: "LambdaPackager",
      zipPath: "test.zip",
      customAwsSdk: true
    });
    await other.loadDefaults();
    assert.ok(!other.resources.package.modules.excludes.includes("aws-sdk"));
  }
}
