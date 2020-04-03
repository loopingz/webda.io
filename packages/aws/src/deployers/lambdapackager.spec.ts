import { DeployerTest } from "@webda/shell/lib/deployers/deployer.spec";
import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import * as path from "path";
import { DeploymentManager } from "@webda/shell";
import { LambdaPackager } from "./lambdapackager";

@suite
class LambdaPackagerTest extends DeployerTest<LambdaPackager> {
  async getDeployer(manager: DeploymentManager): Promise<LambdaPackager> {
    return new LambdaPackager(manager, { zipPath: "test.zip" });
  }

  @test
  async loadDefault() {
    await this.deployer.loadDefaults();
    assert.equal(this.deployer.resources.entrypoint, path.join(__dirname, "aws-entrypoint.js"));
    this.deployer.resources.entrypoint = "mine.js";
    await this.deployer.loadDefaults();
    assert.equal(this.deployer.resources.entrypoint, "mine.js");
  }
}
