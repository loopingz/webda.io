import { FileLogger } from "./file";
import { WorkerMessage, WorkerOutput } from "..";

export class DebugLogger extends FileLogger {
  constructor(output: WorkerOutput, filepath: string) {
    super(output, "TRACE", filepath, -1);
  }

  filter() {
    return true;
  }

  getLine(msg: WorkerMessage) {
    return `${msg.type}:${msg.timestamp}:${JSON.stringify(msg)}\n`;
  }
}
