import { WorkerLogLevel, WorkerOutput, Logger as WorkoutLogger } from "@webda/workout";

let workerOutput: WorkerOutput;

/**
 * Get the worker output
 * @returns
 */
export function useWorkerOutput(): WorkerOutput {
  workerOutput ??= new WorkerOutput();
  return workerOutput;
}

/**
 * Set the worker output
 * @param output
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

  /** Get the worker output, falling back to the global output */
  get output(): WorkerOutput {
    return this._output || useWorkerOutput();
  }

  constructor(output: WorkerOutput, context: any = {}) {
    this.output = output || useWorkerOutput();
    this.context = context;
  }

  /** Log a message at the specified level with the default context */
  log(level: WorkerLogLevel, ...args) {
    this.logWithContext(level, this.context, ...args);
  }

  /** Log a message at the specified level with a custom context merged with defaults */
  logWithContext(level: WorkerLogLevel, context: any, ...args) {
    if (!context.class) {
      context.class = this.context.class;
    }
    this.output?.logWithContext(level, { ...this.context, ...context }, ...args);
  }

  /** Open a named log group */
  logGroupOpen(name: string) {
    this.output.openGroup(name);
  }

  /** Close the current log group */
  logGroupClose() {
    this.output.closeGroup();
  }

  /** Start a new progress tracker */
  logProgressStart(uid: string, total: number, title: string = undefined) {
    this.output.startProgress(uid, total, title);
  }

  /** Increment the progress tracker by a given amount */
  logProgressIncrement(inc: number = 1, uid: string = undefined) {
    this.output.incrementProgress(inc, uid);
  }
  /** Update the progress tracker to a specific value */
  logProgressUpdate(current: number, uid: string = undefined, title: string = undefined) {
    this.output.updateProgress(current, uid, title);
  }

  /** Set the current log output title */
  logTitle(title: string) {
    this.output.setTitle(title);
  }
}
