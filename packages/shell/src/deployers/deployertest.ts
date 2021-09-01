import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaSampleApplication } from "../index.spec";
import { Deployer } from "./deployer";
import { WorkerOutput, ConsoleLogger, WorkerLogLevel } from "@webda/workout";

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
