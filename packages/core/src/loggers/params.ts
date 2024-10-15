import { WorkerLogLevel } from "@webda/workout";
import { ServiceParameters } from "../interfaces";
import { useLog } from "./hooks";

export class LoggerServiceParameters extends ServiceParameters {
  /**
   * Specify the log level of this service
   */
  logLevel: WorkerLogLevel;

  /**
   * @inheritdoc
   */
  constructor(params: any) {
    super();
    this.logLevel = (params.logLevel || process.env["LOG_LEVEL"] || "INFO").toUpperCase() as WorkerLogLevel;
    const levels: WorkerLogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR", "TRACE"];
    if (!levels.includes(this.logLevel)) {
      useLog("WARN", "Invalid log level", this.logLevel, "fallback to INFO");
      this.logLevel = "INFO";
    }
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
