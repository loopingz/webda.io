import { ConsoleLogger, MemoryLogger, WorkerLogLevel, WorkerMessage, WorkerOutput } from "@webda/workout";
import { AsyncAction, AsyncOperationAction, AsyncWebdaAction } from "../models";
import AsyncJobService, { JobInfo } from "./asyncjobservice";
import { AgentInfo, Runner, RunnerParameters } from "./runner";
import { SimpleOperationContext } from "@webda/core";

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
 *
 */
export class ActionMemoryLogger extends MemoryLogger {
  protected timeout: NodeJS.Timeout;
  protected saver: (logs: string[]) => Promise<void>;

  /**
   *
   * @param output to connect to
   * @param level of logs
   * @param limit the size of the log
   * @param actionOrSaver the action to save the logs to or a function to save the logs
   * @param logSaveDelay delay before saving the logs
   * @param format format of the logs
   */
  constructor(
    output: WorkerOutput,
    level: WorkerLogLevel,
    limit: number,
    actionOrSaver: AsyncAction | ((logs: string[]) => Promise<void>),
    public logSaveDelay: number,
    public format?: string
  ) {
    super(output, level, limit);
    if (typeof actionOrSaver === "function") {
      this.saver = actionOrSaver;
    } else {
      this.saver = async (logs: string[]) => await actionOrSaver?.patch({ logs }, null);
    }
  }

  /**
   * @inheritdoc
   */
  onMessage(msg: WorkerMessage) {
    super.onMessage(msg);
    if (!this.timeout) {
      this.timeout = setTimeout(() => this.save(), this.logSaveDelay);
    }
  }

  /**
   * Save the logs to the action
   * @returns
   */
  save(): Promise<void> {
    this.clearTimeout();
    return this.saver(this.getFormattedLogs());
  }

  /**
   * Clear the timeout
   */
  clearTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  /**
   * Close the logger
   * @param clearTimeout clear the timeout
   * @returns
   */
  close(clearTimeout: boolean = false): void {
    if (clearTimeout) {
      this.clearTimeout();
    }
    return super.close();
  }

  /**
   * Returns the formatted logs based on this.format
   * @returns
   */
  getFormattedLogs(): string[] {
    return this.getLogs().map(msg => ConsoleLogger.format(msg, this.format));
  }

  /**
   * Save the logs and close the logger
   * @returns
   */
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
    if (!(action instanceof AsyncWebdaAction || action instanceof AsyncOperationAction)) {
      this.log("ERROR", "Can only handle AsyncWebdaAction or AsyncOperationAction got", action.constructor.name);
      throw new Error("Can only handle AsyncWebdaAction or AsyncOperationAction got " + action.constructor.name);
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
        if (action instanceof AsyncWebdaAction) {
          await this.getService(action.serviceName)[action.method](...(action.arguments || []));
        } else {
          let ctx: SimpleOperationContext = new SimpleOperationContext(this.getWebda());
          // Unserialization might not have happened
          ctx.setSession(action.context.getSession ? action.context.getSession() : action.context["session"]);
          // Unserialization might not have happened
          ctx.setInput(Buffer.from(action.context["input"]?.data || []));
          await this.getWebda().callOperation(ctx, action.operationId);
        }
        await logger.saveAndClose();

        await action.patch({ status: "SUCCESS" }, null);
        this.log("INFO", "Job", action.getUuid(), "finished");
      } catch (err) {
        await logger?.saveAndClose();
        await action.patch(
          {
            status: "ERROR",
            errorMessage: JSON.stringify(err, Object.getOwnPropertyNames(err))
          },
          null
        );
        this.log("ERROR", "Job", action.getUuid(), "errored", err);
      }
    })(action);

    return {
      agent: Runner.getAgentInfo(),
      promise
    };
  }
}
