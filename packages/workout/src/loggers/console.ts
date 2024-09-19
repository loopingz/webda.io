import chalk from "chalk";
import { sprintf } from "sprintf-js";
import * as util from "util";
import { LogFilter, WorkerLogLevel, WorkerMessage, WorkerOutput } from "../index";
import { WorkerLogger } from "./index";

interface WorkerLogMessage {
  m: string;
  l: string;
  t: number;
  [key: string]: any;
}
/**
 * ConsoleLogger
 */
class ConsoleLogger extends WorkerLogger {
  static defaultFormat = "%(d)s [%(l)s] %(m)s";
  format: string;

  constructor(output: WorkerOutput, level?: WorkerLogLevel, format: string = ConsoleLogger.defaultFormat) {
    super(output, level);
    this.format = format;
  }

  /**
   * @override
   */
  onMessage(msg: WorkerMessage) {
    ConsoleLogger.handleMessage(msg, this.level, this.format);
  }

  /**
   *
   * @param level to get color from
   */
  static getColor(level: WorkerLogLevel): (s: string) => string {
    if (level === "ERROR") {
      return s => chalk.red(s);
    } else if (level === "WARN") {
      return s => chalk.yellow(s);
    } else if (level === "DEBUG" || level === "TRACE") {
      return s => chalk.grey(s);
    }
    return s => s;
  }

  /**
   * Commonly handle a message
   * @param msg
   * @param level
   * @param format
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
   * Display a message to the console
   *
   * @param msg
   * @param format
   */
  static display(msg: WorkerMessage, format: string = ConsoleLogger.defaultFormat) {
    console.log(this.getColor(msg.log.level)(this.format(msg, format)));
  }

  /**
   * Format a log based on format string
   *
   * @param msg
   * @param format
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
      d: () => new Date(msg.timestamp).toISOString()
    };
    try {
      return sprintf(format, info);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return "bad log format: " + format;
      }
      return "";
    }
  }
}

export { ConsoleLogger };
