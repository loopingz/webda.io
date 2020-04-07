import * as colors from "colors";
import { LogFilter, WorkerLogLevel, WorkerMessage, WorkerOutput } from "..";
import * as util from "util";

/**
 * ConsoleLogger
 */
export class ConsoleLogger {
  format: string;
  level: WorkerLogLevel;

  constructor(output: WorkerOutput, level: WorkerLogLevel = "INFO", format: string = "%t [%l]") {
    this.level = level;
    this.format = format;
    output.on("message", (msg: WorkerMessage) => {
      if (msg.type === "log" && LogFilter(msg.log.level, this.level)) {
        ConsoleLogger.display(msg, this.format);
      }
    });
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
   * Display a message to the console
   *
   * @param msg
   * @param format
   */
  static display(msg: WorkerMessage, format: string = "%t [%l]") {
    console.log(
      ConsoleLogger.getColor(msg.log.level)(
        [
          msg.timestamp,
          msg.log.level,
          ...msg.log.args.map(a => (typeof a === "object" ? util.inspect(a) : a.toString()))
        ].join(" ")
      )
    );
  }
}
