import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaSampleApplication } from "../index.spec";
import { DeploymentManager } from "./deploymentmanager";
import { WorkerOutput } from "@webda/workout";
import WebdaConsole from "../console/webda";

@suite
class DeploymentManagerTest {
  @test
  async testGetDeployers() {
    let deploymentManager = new DeploymentManager(WebdaSampleApplication, "Shell");
    assert.strictEqual(Object.keys(deploymentManager.deployers).length, 1);
    assert.rejects(() => deploymentManager.getDeployer("plop"), /Unknown deployer/g);
    assert.notStrictEqual(await deploymentManager.getDeployer("Packager"), undefined);
    let output = deploymentManager.getOutput();
    deploymentManager.setOutput(null);
    assert.strictEqual(deploymentManager.getOutput(), null);
    assert.notStrictEqual(deploymentManager.getWebda(), undefined);
    assert.rejects(() => deploymentManager.run("bozou", {}), /Unknown deployer type bozou/);
    deploymentManager.getPackageDescription();
  }

  @test
  async commandLine() {
    let deploymentManager = new DeploymentManager(WebdaSampleApplication, "Shell", {
      out: console.log,
      err: console.error
    });
    // @ts-ignore
    assert.strictEqual(await deploymentManager.commandLine({ _: ["name", "deploy"] }), 1);
    // @ts-ignore
    deploymentManager.getDeployer = async () => ({
      deploy: async () => {}
    });
    // @ts-ignore
    assert.strictEqual(await deploymentManager.commandLine({ _: [] }), 0);
  }
}
