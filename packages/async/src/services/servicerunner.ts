import { AsyncAction, AsyncOperationAction } from "../models";
import { JobInfo } from "./asyncjobservice";
import { AgentInfo, Runner, RunnerParameters } from "./runner";

/**
 * Type of action returned by LocalRunner
 */
export interface ServiceAction {
  agent: AgentInfo;
}

/**
 * Run a Job locally on the server by spawning a child process
 *
 * @WebdaModda
 */
export default class ServiceRunner<T extends RunnerParameters = RunnerParameters> extends Runner<T> {
  /**
   * @inheritdoc
   */
  async launchAction(action: AsyncAction, info: JobInfo): Promise<ServiceAction> {
    if (action.type !== "AsyncOperationAction") {
      this.log("ERROR", "Can only handle AsyncOperationAction got", action.type);
      throw new Error("Can only handle AsyncOperationAction got " + action.type);
    }
    const webdaAction = <AsyncOperationAction>action;

    // Launch within current process
    (async () => {
      try {
        await action.patch({ status: "RUNNING" });
        this.log("INFO", "Job", action.getUuid(), "started");
        await this.getService(webdaAction.serviceName)[webdaAction.method](...(webdaAction.arguments || []));
        await action.patch({ status: "SUCCESS" });
        this.log("INFO", "Job", action.getUuid(), "finished");
      } catch (err) {
        await action.patch({
          status: "ERROR",
          errorMessage: JSON.stringify(err, Object.getOwnPropertyNames(err))
        });
        this.log("INFO", "Job", action.getUuid(), "errored", err);
      }
    })();

    return {
      agent: Runner.getAgentInfo()
    };
  }
}
