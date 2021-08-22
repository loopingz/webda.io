import { DeployerTest } from "@webda/shell/lib/deployers/deployer.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as path from "path";
import { DeploymentManager } from "@webda/shell";
import { LambdaPackager } from "./lambdapackager";

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
    let other = new LambdaPackager(this.manager, { name: "deployer2", type: "LambdaPackager", zipPath: "test.zip", customAwsSdk: true });
    await other.loadDefaults();
    assert.ok(!other.resources.package.modules.excludes.includes("aws-sdk"));
    
  }
}
