import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { DeployerTest } from "./deployer.spec";
import ShellDeployer from "./shell";

@suite
class ShellDeployerTest extends DeployerTest<ShellDeployer> {
  async getDeployer(manager: DeploymentManager) {
    return new ShellDeployer(manager, {
      name: "deployer",
      type: "ShellDeployer",
      scripts: ["ls -alh", "cp plop"]
    });
  }

  @test
  async deploy() {
    this.deployer.execute = this.mockExecute;
    await this.deployer.deploy();
    assert.deepStrictEqual(this.execs, [["ls -alh"], ["cp plop"]]);
    this.deployer.resources.scripts = undefined;
    this.execs = [];
    await this.deployer.deploy();
    assert.deepStrictEqual(this.execs, []);
  }
}
