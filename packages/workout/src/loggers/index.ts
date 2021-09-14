import { WorkerLogLevel, WorkerMessage, WorkerOutput } from "../core";

/**
 * Abstract Logger class
 */
export abstract class Logger {
  level: WorkerLogLevel;
  listener: (msg: WorkerMessage) => void;
  output: WorkerOutput;

  constructor(output: WorkerOutput, level: WorkerLogLevel = undefined) {
    this.level = level ? level : <any>process.env.LOG_LEVEL || "INFO";
    this.listener = msg => {
      this.onMessage(msg);
    };
    output.on("message", this.listener);
    this.output = output;
  }

  /**
   * Process a WorkerOutput message
   * @param msg
   */
  abstract onMessage(msg: WorkerMessage): void;

  /**
   * Close the listener
   */
  close() {
    this.output.removeListener("message", this.listener);
  }
}
