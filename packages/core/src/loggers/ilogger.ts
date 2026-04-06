import { WorkerLogLevel, WorkerOutput, Logger as WorkoutLogger } from "@webda/workout";

let workerOutput: WorkerOutput;

/**
 * Get the worker output
 * @returns the result
 */
export function useWorkerOutput(): WorkerOutput {
  workerOutput ??= new WorkerOutput();
  return workerOutput;
}

/**
 * Set the worker output
 * @param output - the output destination
 */
export function setWorkerOutput(output: WorkerOutput) {
  workerOutput = output;
}

/**
 * Logger default implementation
 */
export class Logger implements WorkoutLogger {
  context: any = {};
  private _output: WorkerOutput;

  /** Set the worker output target */
  set output(output: WorkerOutput) {
    this._output = output;
  }

  /**
   * Get the worker output, falling back to the global output
   * @returns the result
   */
  get output(): WorkerOutput {
    return this._output || useWorkerOutput();
  }

  /** Create a new ILogger
   * @param output - the worker output
   * @param context - the logging context
   */
  constructor(output: WorkerOutput, context: any = {}) {
    this.output = output || useWorkerOutput();
    this.context = context;
  }

  /**
   * Log a message at the specified level with the default context
   * @param level - the log level
   * @param args - additional arguments
   */
  log(level: WorkerLogLevel, ...args) {
    this.logWithContext(level, this.context, ...args);
  }

  /**
   * Log a message at the specified level with a custom context merged with defaults
   * @param level - the log level
   * @param context - the execution context
   * @param args - additional arguments
   */
  logWithContext(level: WorkerLogLevel, context: any, ...args) {
    if (!context.class) {
      context.class = this.context.class;
    }
    this.output?.logWithContext(level, { ...this.context, ...context }, ...args);
  }

  /**
   * Open a named log group
   * @param name - the name to use
   */
  logGroupOpen(name: string) {
    this.output.openGroup(name);
  }

  /** Close the current log group */
  logGroupClose() {
    this.output.closeGroup();
  }

  /**
   * Start a new progress tracker
   * @param uid - the unique identifier
   * @param total - the total count
   * @param title - the title
   */
  logProgressStart(uid: string, total: number, title: string = undefined) {
    this.output.startProgress(uid, total, title);
  }

  /**
   * Increment the progress tracker by a given amount
   * @param inc - the increment value
   * @param uid - the unique identifier
   */
  logProgressIncrement(inc: number = 1, uid: string = undefined) {
    this.output.incrementProgress(inc, uid);
  }
  /**
   * Update the progress tracker to a specific value
   * @param current - the current value
   * @param uid - the unique identifier
   * @param title - the title
   */
  logProgressUpdate(current: number, uid: string = undefined, title: string = undefined) {
    this.output.updateProgress(current, uid, title);
  }

  /**
   * Set the current log output title
   * @param title - the title
   */
  logTitle(title: string) {
    this.output.setTitle(title);
  }
}
