import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { DeployerTest } from "./deployer.spec";
import ShellDeployer from "./shell";

@suite
class ShellDeployerTest extends DeployerTest<ShellDeployer> {
  getDeployer(manager: DeploymentManager) {
    return new ShellDeployer(manager, {
      scripts: ["ls -alh", "cp plop"]
    });
  }

  @test
  async deploy() {
    let execs = [];
    this.deployer.execute = async (...args) => {
      execs.push(args);
      return 0;
    };
    await this.deployer.deploy();
    assert.deepEqual(execs, [["ls -alh"], ["cp plop"]]);
    this.deployer.resources.scripts = undefined;
    execs = [];
    await this.deployer.deploy();
    assert.deepEqual(execs, []);
  }
}
