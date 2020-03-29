import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { WebdaSampleApplication } from "../index.spec";
import { DeploymentManager } from "./deploymentmanager";

@suite
class DeploymentManagerTest {
  @test
  async testGetDeployers() {
    assert.throws(
      () => new DeploymentManager(__dirname, "test"),
      /Not a webda application folder/g
    );
    assert.throws(
      () => new DeploymentManager(WebdaSampleApplication.getAppPath(), "test"),
      /Unknown deployment/g
    );
    let deploymentManager = new DeploymentManager(
      WebdaSampleApplication.getAppPath(),
      "Shell"
    );
    assert.equal(Object.keys(deploymentManager.deployers).length, 1);
    assert.rejects(
      () => deploymentManager.getDeployer("plop"),
      /Unknown deployer/g
    );
    assert.notEqual(await deploymentManager.getDeployer("Packager"), undefined);
  }
}
