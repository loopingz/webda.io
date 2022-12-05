import { ConsoleLogger, MemoryLogger, WorkerLogLevel, WorkerMessage, WorkerOutput } from "@webda/workout";
import { AsyncAction, AsyncOperationAction, AsyncWebdaAction } from "../models";
import AsyncJobService, { JobInfo } from "./asyncjobservice";
import { AgentInfo, Runner, RunnerParameters } from "./runner";

/**
 * Type of action returned by LocalRunner
 */
export interface ServiceAction {
  /**
   * Info on the server running it
   */
  agent: AgentInfo;
  /**
   * Promise of the implementation
   *
   * Useful for unit test
   */
  promise: Promise<void>;
}

/**
 * Keep log in memory and save it to the action object every 5s
 */
export class ActionMemoryLogger extends MemoryLogger {
  protected timeout: NodeJS.Timeout;

  constructor(
    output: WorkerOutput,
    level: WorkerLogLevel,
    limit: number,
    protected action: AsyncAction,
    public logSaveDelay: number,
    public format?: string
  ) {
    super(output, level, limit);
  }

  onMessage(msg: WorkerMessage) {
    super.onMessage(msg);
    if (!this.timeout) {
      setTimeout(() => this.save(), this.logSaveDelay);
    }
  }

  save(): Promise<void> {
    this.timeout = undefined;
    return (
      this.action
        // @ts-ignore
        .patch({ logs: this.getLogs().map(msg => ConsoleLogger.format(msg, this.format)) }, null)
        .then(async () => {
          console.log("ACTION", this.action);
          console.log("OK SAVE DONE", await this.action.getStore().get(this.action.getUuid()));
        })
    );
  }

  async saveAndClose() {
    this.close();
    return this.save();
  }
}

/**
 * Add the log format to capture
 */
export class ServiceRunnerParameters extends RunnerParameters {
  /**
   * Define the log format
   *
   * @default ConsoleLoggerDefaultFormat
   */
  logFormat?: string;
  /**
   * How long before saving logs (in ms)
   *
   * @default 5000
   */
  logSaveDelay?: number;

  constructor(params: any) {
    super(params);
    this.logSaveDelay ??= 5000;
  }
}

/**
 * Run a Job locally on the server by spawning a child process
 *
 * @WebdaModda
 */
export default class ServiceRunner<T extends ServiceRunnerParameters = ServiceRunnerParameters> extends Runner<T> {
  /**
   * Load parameters
   * @param params
   * @returns
   */
  loadParameters(params: any) {
    return new ServiceRunnerParameters(params);
  }
  /**
   * @inheritdoc
   */
  async launchAction(action: AsyncAction, info: JobInfo): Promise<ServiceAction> {
    if (action.type !== "AsyncWebdaAction" && action.type !== "AsyncOperationAction") {
      this.log("ERROR", "Can only handle AsyncWebdaAction or AsyncOperationAction got", action.type);
      throw new Error("Can only handle AsyncWebdaAction or AsyncOperationAction got " + action.type);
    }

    // Launch within current process
    let promise = (async (action: AsyncWebdaAction | AsyncOperationAction) => {
      let logger;
      try {
        await action.patch({ status: "RUNNING" });
        this.log("INFO", "Job", action.getUuid(), "started");
        // Inject a MemoryLogger to capture and report any logs
        logger = new ActionMemoryLogger(
          this.getWebda().getWorkerOutput(),
          action.logLevel,
          this.getService<AsyncJobService>(info.JOB_ORCHESTRATOR)?.getParameters().logsLimit || 5000,
          action,
          this.parameters.logSaveDelay,
          this.parameters.logFormat
        );
        if (action.type === "AsyncWebdaAction") {
          const webdaAction = <AsyncWebdaAction>action;
          await this.getService(webdaAction.serviceName)[webdaAction.method](...(webdaAction.arguments || []));
        } else {
          const operationAction = <AsyncOperationAction>action;
          await this.getWebda().callOperation(operationAction.context, operationAction.operationId);
        }
        await logger.saveAndClose();

        await action.patch({ status: "SUCCESS" });
        this.log("INFO", "Job", action.getUuid(), "finished");
      } catch (err) {
        await logger?.saveAndClose();
        await action.patch({
          status: "ERROR",
          errorMessage: JSON.stringify(err, Object.getOwnPropertyNames(err))
        });
        this.log("INFO", "Job", action.getUuid(), "errored", err);
      }
    })(<AsyncOperationAction | AsyncWebdaAction>action);

    return {
      agent: Runner.getAgentInfo(),
      promise
    };
  }
}
