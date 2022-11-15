import { AsyncAction, WebdaAsyncAction } from "../models";
import { JobInfo } from "./asyncjobservice";
import { AgentInfo, Runner, RunnerParameters } from "./runner";

/**
 * Type of action returned by LocalRunner
 */
export interface ProcessAction {
  agent: AgentInfo;
  pid: number;
}

/**
 * Run a Job locally on the server by spawning a child process
 *
 * @WebdaModda
 */
export default class WebdaRunner<T extends RunnerParameters = RunnerParameters> extends Runner<T> {
  /**
   * @inheritdoc
   */
  async launchAction(action: AsyncAction, info: JobInfo): Promise<ProcessAction> {
    if (action.type !== "WebdaAsyncAction") {
      this.log("ERROR", "Can only handle WebdaAsyncAction got", action.type);
      return;
    }
    const webdaAction = <WebdaAsyncAction>action;

    // Launch within current process
    (async () => {
      try {
        await action.getStore().patch({ status: "RUNNING" });
        this.log("INFO", "Job", action.getUuid(), "started");
        await this.getService(webdaAction.serviceName)[webdaAction.method](...webdaAction.arguments);
        await action.getStore().patch({ status: "SUCCESS" });
        this.log("INFO", "Job", action.getUuid(), "finished");
      } catch (err) {
        await action.getStore().patch({ status: "ERROR", errorMessage: err });
        this.log("INFO", "Job", action.getUuid(), "errored", err);
      }
    })();

    return {
      agent: Runner.getAgentInfo(),
      pid: 0
    };
  }
}
