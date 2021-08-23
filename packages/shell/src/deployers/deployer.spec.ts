import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaSampleApplication } from "../index.spec";
import { Deployer } from "./deployer";
import { WorkerOutput, ConsoleLogger, WorkerLogLevel } from "@webda/workout";
import { Logger } from "@webda/core";

export abstract class DeployerTest<T extends Deployer<any>> {
  deployer: T;
  manager: DeploymentManager;
  execs: any[] = [];
  mockExecute: any = async (...args) => {
    this.execs.push(args);
    return { status: 0, output: "", error: "" };
  };

  abstract getDeployer(manager: DeploymentManager): Promise<T>;

  async before(logger: WorkerLogLevel = "INFO") {
    let workerOutput = new WorkerOutput();
    if (logger) {
      new ConsoleLogger(workerOutput, logger);
    }
    this.manager = new DeploymentManager(workerOutput, WebdaSampleApplication.getAppPath(), "Production");
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
  testGetApplication() {
    assert.strictEqual(this.deployer.getApplication(), this.deployer.app);
  }

  @test
  testReplaceVariables() {
    this.deployer.resources = {
      replace: "bouzouf",
      test: true,
      bouzouf: {
        yop: "${resources.replace}"
      }
    };
    this.deployer.replaceResourcesVariables();
    assert.deepStrictEqual(this.deployer.resources, {
      replace: "bouzouf",
      test: true,
      bouzouf: {
        yop: "bouzouf"
      }
    });
  }

  @test
  async testExecute() {
    let info = await this.deployer.execute("ls -alh");
    assert.strictEqual(info.status, 0);
    assert.rejects(this.deployer.execute("[ 0 = 1 ]"));
    info = await this.deployer.execute("cat", "bouzouf");
    assert.strictEqual(info.output, "bouzouf");
    info = await this.deployer.execute("cat 1>&2", "bouzouf");
    assert.strictEqual(info.error, "bouzouf");
    await this.deployer.execute("[ 0 = 1 ]", undefined, true);
  }
}
