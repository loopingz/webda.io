import { LogFilter, WorkerLogLevel, WorkerMessage, WorkerOutput } from "..";

/**
 * Record all messages in memory
 */
export class MemoryLogger {
  protected messages: WorkerMessage[] = [];
  protected includeAll: boolean;

  constructor(output: WorkerOutput, includeAll: boolean = false, level: WorkerLogLevel = "DEBUG", limit = 2000) {
    this.includeAll = includeAll;
    output.on("message", (msg: WorkerMessage) => {
      if (!includeAll && msg.type !== "log") {
        return;
      }
      if (msg.type === "log" && !LogFilter(msg.log.level, level)) {
        return;
      }
      this.messages.push(msg);
      if (this.messages.length > limit) {
        this.messages.shift();
      }
    });
  }

  /**
   * Get all messages recorded
   */
  getMessages() {
    return this.messages;
  }

  /**
   * Get all logs messages
   */
  getLogs() {
    // If includeAll we need to filter
    if (this.includeAll) {
      return this.messages.filter((t) => t.type === "log").map(() => {});
    }
    return this.messages;
  }

  /**
   * Clear all messages
   */
  clear() {
    this.messages = [];
  }
}
