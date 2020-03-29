import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { DeployerTest } from "./deployer.spec";
import { Docker } from "./docker";

@suite
class DockerDeployerTest extends DeployerTest<Docker> {
  getDeployer(manager: DeploymentManager) {
    return new Docker(manager, {
      tag: "webda-deployer:test"
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
    assert.equal(
      execs[0][0],
      "dockerbuild --tag webda-deployer:test --file - ."
    );
  }
}
