import * as fs from "fs";
import * as path from "path";
import { LogFilter, WorkerLog, WorkerLogLevel, WorkerMessage, WorkerOutput } from "../core";
import { WorkerLogger } from "./index";
import { ConsoleLogger } from "./console";

/**
 * Record all messages in file
 */
export class FileLogger extends WorkerLogger {
  // File descriptor
  outputStream?: fs.WriteStream;
  outputCount: number = 0;
  filepath: string;
  sizeLimit: number;
  format: string;

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

  filter(msg: WorkerMessage) {
    if (msg.type === "log") {
      return LogFilter(msg.log.level, this.level());
    } else if (msg.type === "title.set" && LogFilter("INFO", this.level())) {
      return true;
    }
    return false;
  }

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
