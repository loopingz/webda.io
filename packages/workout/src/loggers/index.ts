import { getLogLevelOverride, WorkerLogLevel, WorkerMessage, WorkerOutput } from "../core.js";

/**
 * Abstract base class for all loggers
 * Provides common functionality for listening to WorkerOutput events and filtering log levels
 */
export abstract class WorkerLogger {
  /** Function that returns the current log level (allows dynamic level changes) */
  level: () => WorkerLogLevel;
  /** Message listener function attached to the WorkerOutput */
  listener: (msg: WorkerMessage) => void;
  /** The WorkerOutput instance this logger is attached to */
  output: WorkerOutput;

  /**
   * Create a new logger instance
   *
   * The effective log level is resolved as:
   * 1. Async-local override from {@link useLogLevel} (if active)
   * 2. The `level` parameter (string or function)
   * 3. `process.env.LOG_LEVEL` or `"INFO"` as fallback
   *
   * @param output - The WorkerOutput to listen to
   * @param level - Log level as string or function (defaults to process.env.LOG_LEVEL or "INFO")
   */
  constructor(output: WorkerOutput, level?: WorkerLogLevel | (() => WorkerLogLevel)) {
    const defaultLevel: () => WorkerLogLevel = level
      ? typeof level === "function"
        ? level
        : () => level
      : () => <any>process.env.LOG_LEVEL || "INFO";
    this.level = () => getLogLevelOverride() ?? defaultLevel();
    this.listener = msg => {
      this.onMessage(msg);
    };
    output.on("message", this.listener);
    this.output = output;
  }

  /**
   * Process a WorkerOutput message (must be implemented by subclasses)
   * @param msg - The message to process
   */
  abstract onMessage(msg: WorkerMessage): void;

  /**
   * Stop listening to messages (alias for close())
   *
   * @returns the result of close()
   */
  stop() {
    return this.close();
  }

  /**
   * Resume listening to messages after stopping
   */
  start() {
    if (!this.output.listeners("message").includes(this.listener)) {
      this.output.on("message", this.listener);
    }
  }

  /**
   * Stop listening to messages and remove the listener
   */
  close() {
    this.output.removeListener("message", this.listener);
  }
}
