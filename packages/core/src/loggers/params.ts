import { WorkerLogLevel } from "@webda/workout";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useLog } from "./hooks.js";

export class LoggerServiceParameters extends ServiceParameters {
  /**
   * Specify the log level of this service
   */
  logLevel: WorkerLogLevel;
  /**
   * Add file and line number of the log producer (if possible)
   */
  addLogProducerLine?: boolean;

  /**
   * @inheritdoc
   */
  load(params: any = {}): this {
    super.load(params);
    this.logLevel ??= (process.env["LOG_LEVEL"] || "INFO").toUpperCase() as WorkerLogLevel;
    const levels: WorkerLogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR", "TRACE"];
    if (!levels.includes(this.logLevel)) {
      useLog("WARN", "Invalid log level", this.logLevel, "fallback to INFO");
      this.logLevel = "INFO";
    }
    return this;
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
