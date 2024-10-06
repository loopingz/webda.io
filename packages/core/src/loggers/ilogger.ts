import { WorkerLogLevel, WorkerOutput, Logger as WorkoutLogger } from "@webda/workout";

let workerOutput: WorkerOutput;

/**
 * Get the worker output
 * @returns
 */
export function useWorkerOutput(): WorkerOutput {
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
  output: WorkerOutput;
  clazz: string;

  constructor(output: WorkerOutput, clazz: string) {
    this.output = output;
    this.clazz = clazz;
  }

  log(level: WorkerLogLevel, ...args) {
    this.logWithContext(level, { class: this.clazz }, ...args);
  }

  logWithContext(level: WorkerLogLevel, context: any, ...args) {
    if (!context.class) {
      context.class = this.clazz;
    }
    this.output.logWithContext(level, context, ...args);
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
