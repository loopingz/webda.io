import {
  callOperation,
  OperationContext,
  SimpleOperationContext,
  useApplication,
  useDynamicService
} from "@webda/core";
import {
  ConsoleLogger,
  MemoryLogger,
  useWorkerOutput,
  WorkerLogLevel,
  WorkerMessage,
  WorkerOutput
} from "@webda/workout";
import { AsyncAction, AsyncOperationAction, AsyncWebdaAction } from "../asyncaction.model.js";
import type { AsyncJobService, JobInfo } from "./asyncjobservice.service.js";
import { AgentInfo, Runner, RunnerParameters } from "./runner.service.js";

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
 * Object receiving the captured logs
 */
export type ActionLogTarget = { patch(data: { logs: string[] }): Promise<any> };

/**
 * Keep log in memory and save it to the action object every 5s
 */
export class ActionMemoryLogger extends MemoryLogger {
  protected timeout: NodeJS.Timeout;

  /**
   * @param output - the worker output to listen to
   * @param level - the log level
   * @param limit - the maximum number of logs
   * @param action - the action to save logs to
   * @param logSaveDelay - delay before saving logs
   * @param format - the log format
   */
  constructor(
    output: WorkerOutput,
    level: WorkerLogLevel,
    limit: number,
    protected action: ActionLogTarget,
    public logSaveDelay: number,
    public format?: string
  ) {
    super(output, level, limit);
  }

  /**
   * Schedule a save on each message
   * @param msg - the message
   */
  onMessage(msg: WorkerMessage) {
    super.onMessage(msg);
    if (!this.timeout) {
      this.timeout = setTimeout(() => this.save(), this.logSaveDelay);
    }
  }

  /**
   * Save the logs to the action
   */
  async save(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    await this.action.patch({ logs: this.getLogs().map(msg => ConsoleLogger.format(msg, this.format)) });
  }

  /**
   * Close the logger and save the logs
   * @returns the save promise
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

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.logSaveDelay ??= 5000;
    return this;
  }
}

/**
 * Run a Job locally on the server by spawning a child process
 *
 * @WebdaModda
 */
export default class ServiceRunner<T extends ServiceRunnerParameters = ServiceRunnerParameters> extends Runner<T> {
  /**
   * Rebuild an operation context if the action was loaded from a store
   * @param context - the stored context
   * @returns an operation context
   */
  protected getOperationContext(context: any): OperationContext {
    if (context instanceof OperationContext) {
      return context;
    }
    const input = context?.input;
    return new SimpleOperationContext().setInput(
      Buffer.isBuffer(input) ? input : input?.type === "Buffer" ? Buffer.from(input.data) : Buffer.from("{}")
    );
  }

  /**
   * @inheritdoc
   * @param action - the action to launch
   * @param info - the job information
   * @returns the service action
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
        this.log("INFO", "Job", action.uuid, "started");
        // Inject a MemoryLogger to capture and report any logs
        logger = new ActionMemoryLogger(
          useApplication()?.getWorkerOutput() || useWorkerOutput(),
          action.logLevel,
          useDynamicService<AsyncJobService>(info.JOB_ORCHESTRATOR)?.getParameters().logsLimit || 5000,
          action,
          this.parameters.logSaveDelay,
          this.parameters.logFormat
        );
        if (action instanceof AsyncWebdaAction) {
          await useDynamicService(action.serviceName)[action.method](...(action.arguments || []));
        } else {
          await callOperation(this.getOperationContext(action.context), action.operationId);
        }
        await logger.saveAndClose();

        await action.patch({ status: "SUCCESS" });
        this.log("INFO", "Job", action.uuid, "finished");
      } catch (err: unknown) {
        await logger?.saveAndClose();
        await action.patch({
          status: "ERROR",
          errorMessage: (err as Error).message,
          errorName: (err as Error).name
        });
        this.log("ERROR", "Job", action.uuid, "errored", err);
      }
    })(action);

    return {
      agent: Runner.getAgentInfo(),
      promise
    };
  }
}

export { ServiceRunner };
