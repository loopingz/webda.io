import { ConsoleLogger, MemoryLogger, WorkerLogLevel, WorkerMessage, WorkerOutput } from "@webda/workout";
import { AsyncAction, AsyncOperationAction, AsyncWebdaAction } from "../models";
import AsyncJobService, { JobInfo } from "./asyncjobservice";
import { AgentInfo, Runner, RunnerParameters } from "./runner";
import { OperationContext } from "@webda/core";

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
      this.timeout = setTimeout(() => this.save(), this.logSaveDelay);
    }
  }

  save(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    return this.action.patch({ logs: this.getLogs().map(msg => ConsoleLogger.format(msg, this.format)) }, null);
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
    if (!(action instanceof AsyncWebdaAction || action instanceof AsyncOperationAction)) {
      this.log("ERROR", "Can only handle AsyncWebdaAction or AsyncOperationAction got", action.constructor.name);
      throw new Error("Can only handle AsyncWebdaAction or AsyncOperationAction got " + action.constructor.name);
    }

    // Launch within current process
    const promise = (async (action: AsyncWebdaAction | AsyncOperationAction) => {
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
          let ctx = new OperationContext(this.getWebda());
          ctx.session = action.context.session;
          ctx.input = action.context.input.data;
          ctx.getRawInput = async function () {
            return Buffer.from(ctx.input);
          };
          ctx.getCurrentUserId = function () {
            if (this.session) {
              return this.session.userId;
            }
            return undefined;
          };
          await this.getWebda().callOperation(ctx, action.operationId);
        }
        await logger.saveAndClose();

        await action.patch({ status: "SUCCESS" }, null);
        this.log("INFO", "Job", action.getUuid(), "finished");
      } catch (err: unknown) {
        await logger?.saveAndClose();
        await action.patch(
          {
            status: "ERROR",
            errorMessage: (err as Error).message,
            errorName: (err as Error).name
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
