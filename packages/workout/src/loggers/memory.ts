import { LogFilter, WorkerLogLevel, WorkerMessage, WorkerOutput } from "..";

/**
 * Record all messages in memory
 */
export class MemoryLogger {
  protected messages: WorkerMessage[] = [];
  protected includeAll: boolean;
  protected level: WorkerLogLevel;

  constructor(output: WorkerOutput, level: WorkerLogLevel = "DEBUG", limit = 2000, includeAll: boolean = false) {
    this.includeAll = includeAll;
    this.level = level;
    output.on("message", (msg: WorkerMessage) => {
      if (!includeAll && msg.type !== "log") {
        return;
      }
      if (msg.type === "log" && !LogFilter(msg.log.level, this.level)) {
        return;
      }
      this.messages.push(msg);
      if (this.messages.length > limit) {
        this.messages.shift();
      }
    });
  }

  /**
   * Set LogLevel
   */
  setLogLevel(level: WorkerLogLevel) {
    this.level = level;
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
  getLogs(): WorkerMessage[] {
    // If includeAll we need to filter
    if (this.includeAll) {
      return this.messages.filter(t => t.type === "log");
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
