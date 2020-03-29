import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaSampleApplication } from "../index.spec";
import { Deployer } from "./deployer";

export abstract class DeployerTest<T> {
  deployer: T;
  manager: DeploymentManager;

  abstract getDeployer(manager: DeploymentManager): T;

  before() {
    this.manager = new DeploymentManager(
      WebdaSampleApplication.getAppPath(),
      "Production"
    );
    this.deployer = this.getDeployer(this.manager);
  }
}

class TestDeployer extends Deployer {
  async deploy(): Promise<any> {}
}

@suite
class CommonDeployerTest extends DeployerTest<TestDeployer> {
  getDeployer(manager) {
    return new TestDeployer(manager, { replace: "Plop" });
  }
  @test
  testStringParameter() {
    assert.equal(
      this.deployer.stringParameter("Test${this.resources.replace}"),
      "TestPlop"
    );
  }

  @test
  testGetApplication() {
    assert.equal(this.deployer.getApplication(), this.deployer.app);
  }

  @test
  testObjectParameter() {
    assert.deepEqual(
      this.deployer.objectParameter({
        test: true,
        bouzouf: {
          yop: "${this.resources.replace}"
        }
      }),
      {
        test: true,
        bouzouf: {
          yop: "Plop"
        }
      }
    );
  }
}
