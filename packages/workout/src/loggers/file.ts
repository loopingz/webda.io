import { ConsoleLogger, LogFilter, WorkerLogLevel, WorkerMessage, WorkerOutput } from "..";
import * as fs from "fs";
import * as path from "path";
import { Logger } from ".";

/**
 * Record all messages in memory
 */
export class FileLogger extends Logger {
  // File descriptor
  outputFileStream: fs.WriteStream;
  outputStream: any;
  outputCount: number = 0;
  level: WorkerLogLevel;
  filepath: string;
  sizeLimit: number;
  format: string;

  constructor(
    output: WorkerOutput,
    level: WorkerLogLevel,
    filepath: string,
    sizeLimit = 50 * 1024 * 1024, // 50Mb by default
    format = ConsoleLogger.defaultFormat
  ) {
    super(output, level);
    this.filepath = filepath;
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
    let line = this.getLine(msg);
    this.outputStream.write(line);
    this.outputCount += line.length;

    if (this.sizeLimit > 0 && this.outputCount >= this.sizeLimit) {
      this.rotateLogs(this.filepath);
    }
  }

  filter(msg: WorkerMessage) {
    if (msg.type === "log" && !LogFilter(msg.log.level, this.level)) {
      return false;
    }
    return true;
  }

  getLine(msg: WorkerMessage) {
    return ConsoleLogger.format(msg, this.format) + "\n";
  }

  rotateLogs(filepath: string) {
    this.outputStream.close();
    let filename = path.basename(filepath);
    let dirname = path.dirname(filepath);
    let num = fs.readdirSync(dirname).filter(n => n.startsWith(filename)).length + 1;
    fs.renameSync(filepath, path.join(dirname, filename + num));
    this.outputStream = fs.createWriteStream(filepath, { flags: "a" });
    this.outputCount = 0;
  }
}
