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

  set output(output: WorkerOutput) {
    this._output = output;
  }

  get output(): WorkerOutput {
    return this._output || useWorkerOutput();
  }

  constructor(output: WorkerOutput, context: any = {}) {
    this.output = output || useWorkerOutput();
    this.context = context;
  }

  log(level: WorkerLogLevel, ...args) {
    this.logWithContext(level, this.context, ...args);
  }

  logWithContext(level: WorkerLogLevel, context: any, ...args) {
    if (!context.class) {
      context.class = this.context.class;
    }
    this.output?.logWithContext(level, { ...this.context, ...context }, ...args);
  }

  logGroupOpen(name: string) {
    this.output.openGroup(name);
  }

  logGroupClose() {
    this.output.closeGroup();
  }

  logProgressStart(uid: string, total: number, title: string = undefined) {
    this.output.startProgress(uid, total, title);
  }

  logProgressIncrement(inc: number = 1, uid: string = undefined) {
    this.output.incrementProgress(inc, uid);
  }
  logProgressUpdate(current: number, uid: string = undefined, title: string = undefined) {
    this.output.updateProgress(current, uid, title);
  }

  logTitle(title: string) {
    this.output.setTitle(title);
  }
}
