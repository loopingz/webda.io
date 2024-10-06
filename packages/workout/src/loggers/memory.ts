import { WorkerLogger } from "./index";
import { LogFilter, WorkerLogLevel, WorkerMessage, WorkerOutput } from "../core";

/**
 * Record all messages in memory
 */
export class MemoryLogger extends WorkerLogger {
  /**
   * Messages received
   */
  protected messages: WorkerMessage[] = [];
  /**
   * Also store other message than logs if true
   */
  protected includeAll: boolean;
  /**
   * Max number of messages kept
   */
  protected limit: number;

  constructor(output: WorkerOutput, level: WorkerLogLevel = "DEBUG", limit = 2000, includeAll: boolean = false) {
    super(output, level);
    this.includeAll = includeAll;
    this.limit = limit;
  }

  onMessage(msg: WorkerMessage) {
    if (!this.includeAll && msg.type !== "log") {
      return;
    }
    if (msg.type === "log" && !LogFilter(msg.log.level, this.level)) {
      return;
    }
    this.messages.push(msg);
    if (this.messages.length > this.limit) {
      this.messages.shift();
    }
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
