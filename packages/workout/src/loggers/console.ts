import chalk from "yoctocolors";
import { sprintf } from "sprintf-js";
import * as util from "util";
import { isWorkerLogLevel, LogFilter, WorkerLogLevel, WorkerMessage, WorkerOutput } from "../core";
import { WorkerLogger } from "./index";

interface WorkerLogMessage {
  m: string;
  l: string;
  t: number;
  [key: string]: any;
}
/**
 * Console logger that outputs formatted and colored log messages to stdout
 * Supports custom format strings using sprintf-style placeholders
 *
 * @example
 * ```typescript
 * const output = new WorkerOutput();
 * new ConsoleLogger(output, "INFO");
 * output.log("INFO", "Application started");
 * ```
 */
class ConsoleLogger extends WorkerLogger {
  static defaultFormat = "%(d)s [%(l)s] %(m)s";
  static defaultFormatWithLine = "%(d)s [%(l)s] %(m)s (%(f)s:%(ll)d:%(c)d %(ff)s)";
  format: string;

  constructor(output: WorkerOutput, level: WorkerLogLevel = isWorkerLogLevel(process.env.LOG_LEVEL) ? process.env.LOG_LEVEL : "INFO", format?: string) {
    super(output, level);

    this.format = format || (output.addLogProducerLine ? ConsoleLogger.defaultFormatWithLine : ConsoleLogger.defaultFormat);
  }

  /**
   * Process a WorkerOutput message
   * @param msg - The message to handle
   * @override
   */
  onMessage(msg: WorkerMessage) {
    ConsoleLogger.handleMessage(msg, this.level(), this.format);
  }

  /**
   * Get the color function for a given log level
   * @param level - The log level to get color for
   * @returns A function that applies the appropriate color to a string
   */
  static getColor(level: WorkerLogLevel): (s: string) => string {
    if (level === "ERROR") {
      return s => chalk.red(s);
    } else if (level === "WARN") {
      return s => chalk.yellow(s);
    } else if (level === "DEBUG" || level === "TRACE") {
      return s => chalk.gray(s);
    }
    return s => s;
  }

  /**
   * Handle log and title messages with level filtering
   * @param msg - Message to process
   * @param level - Current log level for filtering
   * @param format - Format string for log output
   */
  static handleMessage(msg: WorkerMessage, level: WorkerLogLevel, format: string = ConsoleLogger.defaultFormat) {
    if (msg.type === "title.set" && LogFilter("INFO", level)) {
      ConsoleLogger.display(
        <any>{
          timestamp: msg.timestamp,
          log: {
            level: "INFO",
            args: [msg.title]
          }
        },
        format
      );
    }
    if (msg.type === "log" && LogFilter(msg.log.level, level)) {
      ConsoleLogger.display(msg, format);
    }
  }

  /**
   * Display a formatted and colored log message to stdout
   * @param msg - Message to display
   * @param format - Format string for output
   */
  static display(msg: WorkerMessage, format: string = ConsoleLogger.defaultFormat) {
    console.log(this.getColor(msg.log.level)(this.format(msg, format)));
  }

  /**
   * Format a log message using sprintf-style placeholders
   * Supports: %(d)s (date), %(l)s (level), %(m)s (message), %(f)s (file), %(ll)d (line), %(c)d (column), %(ff)s (function)
   * @param msg - Message to format
   * @param format - Format string with placeholders
   * @returns Formatted log string
   */
  static format(msg: WorkerMessage, format: string = ConsoleLogger.defaultFormat): string {
    if (!msg.log) {
      return "";
    }
    const info: WorkerLogMessage = {
      m: msg.log.args
        .map(a => {
          if (a === undefined) {
            return "undefined";
          } else if (typeof a === "object") {
            return util.inspect(a);
          }
          return a.toString();
        })
        .join(" "),
      l: msg.log.level.padStart(5),
      t: msg.timestamp,
      d: () => new Date(msg.timestamp).toISOString(),
      ll: msg.context?.line ?? 0,
      ff: msg.context?.function ?? "",
      f: msg.context?.file ?? "",
      c: msg.context?.column ?? 0,
    };
    try {
      return sprintf(format, info);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return "bad log format: " + format;
      }
      return `Error: ${(err as Error).message} while formatting log with format: ` + format;
    }
  }
}

export { ConsoleLogger };
