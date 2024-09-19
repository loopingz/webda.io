import { ConsoleLogger, WorkerLogLevel, WorkerOutput } from "@webda/workout";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaSampleApplication } from "../index.spec";
import { Deployer } from "./deployer";

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
    const workerOutput = new WorkerOutput();
    if (logger) {
      new ConsoleLogger(workerOutput, logger);
    }
    await WebdaSampleApplication.load();
    this.manager = new DeploymentManager(WebdaSampleApplication, "Production");
    this.deployer = await this.getDeployer(this.manager);
  }
}
