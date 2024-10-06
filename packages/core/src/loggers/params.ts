import { WorkerLogLevel } from "@webda/workout";
import { ServiceParameters } from "../services/iservices";

export class LoggerServiceParameters extends ServiceParameters {
  /**
   * Specify the log level of this service
   */
  logLevel: WorkerLogLevel;

  /**
   * @inheritdoc
   */
  constructor(params: any) {
    super(params);
    // Use the environment variable or fallback to INFO
    this.logLevel ??= <any>process.env["LOG_LEVEL"] || "INFO";
  }
}

export class MemoryLoggerServiceParameters extends LoggerServiceParameters {
  /**
   * Max size of the logs in memory
   */
  limit?: number;
}

export class ConsoleLoggerServiceParameters extends LoggerServiceParameters {
  /**
   * Format of the logs
   */
  format?: string;
}

export class FileLoggerServiceParameters extends LoggerServiceParameters {
  /**
   * Format of the logs
   */
  format?: string;
  /**
   * File to log into
   */
  file: string;
  /**
   * Limit of the file
   */
  sizeLimit?: number;
}
