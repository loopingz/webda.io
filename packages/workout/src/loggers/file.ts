import * as fs from "fs";
import * as path from "path";
import { LogFilter, WorkerLog, WorkerLogLevel, WorkerMessage, WorkerOutput } from "../core";
import { WorkerLogger } from "./index";
import { ConsoleLogger } from "./console";

/**
 * Logger that writes formatted log messages to a file with automatic rotation
 * Supports size-based log rotation and custom format strings
 *
 * @example
 * ```typescript
 * const output = new WorkerOutput();
 * new FileLogger(output, "INFO", "/var/log/app.log", 50 * 1024 * 1024);
 * output.log("INFO", "Application started");
 * ```
 */
export class FileLogger extends WorkerLogger {
  /** Write stream for the log file */
  outputStream?: fs.WriteStream;
  /** Current size of the log file in bytes */
  outputCount: number = 0;
  /** Path to the log file */
  filepath: string;
  /** Maximum file size before rotation in bytes */
  sizeLimit: number;
  /** Format string for log messages */
  format: string;

  /**
   * Create a new file logger
   * @param output - WorkerOutput instance to listen to
   * @param level - Log level or function returning log level (default: "INFO")
   * @param filepath - Path to the log file (required)
   * @param sizeLimit - Maximum file size in bytes before rotation (default: 50MB)
   * @param format - Log format string (default: ConsoleLogger.defaultFormat)
   */
  constructor(
    output: WorkerOutput,
    level: WorkerLogLevel | (() => WorkerLogLevel) = "INFO",
    filepath: string,
    sizeLimit = 50 * 1024 * 1024, // 50Mb by default
    format = ConsoleLogger.defaultFormat
  ) {
    super(output, level);
    this.filepath = filepath;
    if (!filepath) {
      throw new Error("FileLogger: filepath is required");
    }
    this.sizeLimit = sizeLimit;
    this.format = format;
  }

  /**
   * Process a WorkerMessage and write it to the log file
   * @param msg - The message to process
   */
  onMessage(msg: WorkerMessage) {
    if (!this.filter(msg)) {
      return;
    }
    if (!this.outputStream) {
      if (fs.existsSync(this.filepath)) {
        this.outputCount += fs.lstatSync(this.filepath).size;
      } else {
        this.outputCount = 0;
      }
      this.outputStream = fs.createWriteStream(this.filepath, { flags: "a" });
    }
    const line = this.getLine(msg);
    this.outputStream.write(line);
    this.outputCount += line.length;

    if (this.sizeLimit > 0 && this.outputCount >= this.sizeLimit) {
      this.rotateLogs(this.filepath);
    }
  }

  /**
   * Determine if a message should be logged based on its type and level
   * @param msg - The message to filter
   * @returns true if the message should be logged, false otherwise
   */
  filter(msg: WorkerMessage) {
    if (msg.type === "log") {
      return LogFilter(msg.log.level, this.level());
    } else if (msg.type === "title.set" && LogFilter("INFO", this.level())) {
      return true;
    }
    return false;
  }

  /**
   * Format a message into a log line with newline
   * @param msg - The message to format
   * @returns Formatted log line with newline character
   */
  getLine(msg: WorkerMessage) {
    if (msg.type === "title.set") {
      return (
        ConsoleLogger.format(
          {
            ...msg,
            type: "log",
            log: new WorkerLog("INFO", [msg.title])
          },
          this.format
        ) + "\n"
      );
    }
    return ConsoleLogger.format(msg, this.format) + "\n";
  }

  /**
   * Rotate the log file by renaming it with a numeric suffix
   * Creates a new empty log file at the original path
   * @param filepath - Path to the log file to rotate
   */
  rotateLogs(filepath: string) {
    this.outputStream?.close();
    const filename = path.basename(filepath);
    const dirname = path.dirname(filepath);
    const num = fs.readdirSync(dirname).filter(n => n.startsWith(filename)).length + 1;
    fs.renameSync(filepath, path.join(dirname, filename + num));
    this.outputStream = fs.createWriteStream(filepath, { flags: "a" });
    this.outputCount = 0;
  }
}
