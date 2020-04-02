import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaSampleApplication } from "../index.spec";
import { Deployer } from "./deployer";

export abstract class DeployerTest<T> {
  deployer: T;
  manager: DeploymentManager;
  execs: any[] = [];
  mockExecute: any = async (...args) => {
    this.execs.push(args);
    return { status: 0, output: "", error: "" };
  };

  abstract async getDeployer(manager: DeploymentManager): Promise<T>;

  async before() {
    this.manager = new DeploymentManager(
      WebdaSampleApplication.getAppPath(),
      "Production"
    );
    this.deployer = await this.getDeployer(this.manager);
  }
}

class TestDeployer extends Deployer<any> {
  async deploy(): Promise<any> {}
}

@suite
class CommonDeployerTest extends DeployerTest<TestDeployer> {
  async getDeployer(manager) {
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

  @test
  async testExecute() {
    let info = await this.deployer.execute("ls -alh");
    assert.equal(info.status, 0);
    assert.rejects(this.deployer.execute("[ 0 = 1 ]"));
    info = await this.deployer.execute("cat", "bouzouf");
    assert.equal(info.output, "bouzouf");
    info = await this.deployer.execute("cat 1>&2", "bouzouf");
    assert.equal(info.error, "bouzouf");
  }
}
