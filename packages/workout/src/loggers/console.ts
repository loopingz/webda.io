import chalk from "yoctocolors";
import { sprintf } from "sprintf-js";
import * as util from "util";
import { isWorkerLogLevel, LogFilter, WorkerLogLevel, WorkerMessage, WorkerOutput } from "../core.js";
import { WorkerLogger } from "./index.js";

/**
 * Internal shape passed to sprintf when formatting a log line
 */
/**
 * Stream a console logger writes its log lines to
 */
export type ConsoleLogStream = "stdout" | "stderr";

interface WorkerLogMessage {
  /** Formatted message text */
  m: string;
  /** Log level string (right-padded) */
  l: string;
  /** Unix timestamp in milliseconds */
  t: number;
  [key: string]: any;
}
/**
 * Console logger that outputs formatted and colored log messages to stdout (or stderr)
 * Supports custom format strings using sprintf-style placeholders
 *
 * Raw output messages (see `useOutput`) are always written unformatted to stdout,
 * so logs can be sent to stderr while a command result stays pipeable.
 *
 * @example
 * ```typescript
 * const output = new WorkerOutput();
 * new ConsoleLogger(output, "INFO");
 * output.log("INFO", "Application started");
 * ```
 */
class ConsoleLogger extends WorkerLogger {
  /** Default sprintf format string (date, level, message) */
  static defaultFormat = "%(d)s [%(l)s] %(m)s";
  /** Extended format string that also prints caller file, line, column and function */
  static defaultFormatWithLine = "%(d)s [%(l)s] %(m)s (%(f)s:%(ll)d:%(c)d %(ff)s)";
  /** Active sprintf format string used for output */
  format: string;
  /** Stream receiving the log lines */
  logStream: NodeJS.WritableStream;

  /**
   * Create a new console logger
   * @param output - WorkerOutput instance to listen to
   * @param level - Minimum log level to display (default: LOG_LEVEL env var or "INFO")
   * @param format - Optional sprintf format string; defaults to defaultFormat or defaultFormatWithLine
   * @param logStream - Stream for log lines (default: stdout); raw output always goes to stdout
   */
  constructor(
    output: WorkerOutput,
    level: WorkerLogLevel = isWorkerLogLevel(process.env.LOG_LEVEL) ? process.env.LOG_LEVEL : "INFO",
    format?: string,
    logStream: ConsoleLogStream = "stdout"
  ) {
    super(output, level);
    this.logStream = logStream === "stderr" ? process.stderr : process.stdout;

    this.format =
      format || (output.addLogProducerLine ? ConsoleLogger.defaultFormatWithLine : ConsoleLogger.defaultFormat);
  }

  /**
   * Process a WorkerOutput message
   * @param msg - The message to handle
   * @override
   */
  onMessage(msg: WorkerMessage) {
    ConsoleLogger.handleMessage(msg, this.level(), this.format, this.logStream);
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
   * @param stream - Stream for log lines (default: stdout)
   */
  static handleMessage(
    msg: WorkerMessage,
    level: WorkerLogLevel,
    format: string = ConsoleLogger.defaultFormat,
    stream: NodeJS.WritableStream = process.stdout
  ) {
    if (msg.type === "output") {
      ConsoleLogger.writeOutput(msg);
      return;
    }
    if (msg.type === "title.set" && LogFilter("INFO", level)) {
      ConsoleLogger.display(
        <any>{
          timestamp: msg.timestamp,
          log: {
            level: "INFO",
            args: [msg.title]
          }
        },
        format,
        stream
      );
    }
    if (msg.type === "log" && LogFilter(msg.log.level, level)) {
      ConsoleLogger.display(msg, format, stream);
    }
  }

  /**
   * Write a raw output message, unformatted, to stdout
   * @param msg - Output message to write
   */
  static writeOutput(msg: WorkerMessage) {
    process.stdout.write(`${msg.data ?? ""}\n`);
  }

  /**
   * Display a formatted and colored log message
   *
   * Writes to the stream directly rather than through `console`, so a patched
   * console (see `patchConsole`) cannot loop back into the logger.
   * @param msg - Message to display
   * @param format - Format string for output
   * @param stream - Stream to write to (default: stdout)
   */
  static display(
    msg: WorkerMessage,
    format: string = ConsoleLogger.defaultFormat,
    stream: NodeJS.WritableStream = process.stdout
  ) {
    stream.write(`${this.getColor(msg.log.level)(this.format(msg, format))}\n`);
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
      c: msg.context?.column ?? 0
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
