import * as colors from "colors";
import { LogFilter, WorkerLogLevel, WorkerMessage, WorkerOutput } from "..";
import * as util from "util";
import { sprintf } from "sprintf-js";
import { Logger } from ".";

interface WorkerLogMessage {
  m: string;
  l: string;
  t: number;
  [key: string]: any;
}
/**
 * ConsoleLogger
 */
export class ConsoleLogger extends Logger {
  static defaultFormat = "%(d)s [%(l)s] %(m)s";
  format: string;
  level: WorkerLogLevel;
  listener: (msg: WorkerMessage) => void;
  output: WorkerOutput;

  constructor(output: WorkerOutput, level: WorkerLogLevel = undefined, format: string = ConsoleLogger.defaultFormat) {
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
      return colors.red;
    } else if (level === "WARN") {
      return colors.yellow;
    } else if (level === "DEBUG" || level === "TRACE") {
      return colors.grey;
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
    console.log(ConsoleLogger.getColor(msg.log.level)(ConsoleLogger.format(msg, format)));
  }

  /**
   * Format a log based on format string
   *
   * @param msg
   * @param format
   */
  static format(msg: WorkerMessage, format: string = ConsoleLogger.defaultFormat) {
    let info: WorkerLogMessage = {
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
      // TODO Add different format of dates
    };
    try {
      return sprintf(format, info);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return "bad log format: " + format;
      }
    }
  }
}
