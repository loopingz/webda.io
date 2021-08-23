import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaSampleApplication } from "../index.spec";
import { DeploymentManager } from "./deploymentmanager";
import { WorkerOutput } from "@webda/workout";

@suite
class DeploymentManagerTest {
  @test
  async testGetDeployers() {
    assert.throws(
      () => new DeploymentManager(new WorkerOutput(), __dirname, "test"),
      /Not a webda application folder/g
    );
    assert.throws(
      () => new DeploymentManager(new WorkerOutput(), WebdaSampleApplication.getAppPath(), "test"),
      /Unknown deployment/g
    );
    let deploymentManager = new DeploymentManager(new WorkerOutput(), WebdaSampleApplication.getAppPath(), "Shell");
    assert.strictEqual(Object.keys(deploymentManager.deployers).length, 1);
    assert.rejects(() => deploymentManager.getDeployer("plop"), /Unknown deployer/g);
    assert.notStrictEqual(await deploymentManager.getDeployer("Packager"), undefined);
    let output = deploymentManager.getOutput();
    deploymentManager.setOutput(null);
    assert.strictEqual(deploymentManager.getOutput(), null);
    assert.notStrictEqual(deploymentManager.getWebda(), undefined);
    assert.rejects(() => deploymentManager.run("bozou", {}), /Unknown deployer type bozou/);
  }
}
