import { WorkerLogger } from "./index";
import { LogFilter, WorkerLogLevel, WorkerMessage, WorkerOutput } from "../core";

/**
 * Logger that stores messages in memory for later retrieval
 * Useful for testing, debugging, or implementing in-memory log buffers
 * Automatically maintains a circular buffer by removing oldest messages when limit is reached
 *
 * @example
 * ```typescript
 * const output = new WorkerOutput();
 * const logger = new MemoryLogger(output, "DEBUG", 1000, true);
 * output.log("INFO", "Test message");
 * console.log(logger.getLogs()); // Retrieve all logs
 * ```
 */
export class MemoryLogger extends WorkerLogger {
  /**
   * Messages received and stored in memory
   */
  protected messages: WorkerMessage[] = [];
  /**
   * Whether to store all message types (true) or only log messages (false)
   */
  protected includeAll: boolean;
  /**
   * Maximum number of messages to keep in memory
   */
  protected limit: number;

  /**
   * Create a new memory logger
   * @param output - WorkerOutput instance to listen to
   * @param level - Log level to filter messages (default: "DEBUG")
   * @param limit - Maximum number of messages to keep (default: 2000)
   * @param includeAll - Whether to store all message types or only logs (default: false)
   */
  constructor(output: WorkerOutput, level: WorkerLogLevel = "DEBUG", limit = 2000, includeAll: boolean = false) {
    super(output, level);
    this.includeAll = includeAll;
    this.limit = limit;
  }

  /**
   * Process and store a message if it passes filtering criteria
   * @param msg - The message to process
   */
  onMessage(msg: WorkerMessage) {
    if (!this.includeAll && msg.type !== "log") {
      return;
    }
    if (msg.type === "log" && !LogFilter(msg.log.level, this.level())) {
      return;
    }
    this.messages.push(msg);
    if (this.messages.length > this.limit) {
      this.messages.shift();
    }
  }

  /**
   * Update the log level for filtering future messages
   * @param level - New log level as string or function
   */
  setLogLevel(level: WorkerLogLevel | (() => WorkerLogLevel)) {
    this.level = typeof level === "function" ? level : () => level;
  }

  /**
   * Get all messages stored in memory
   * @returns Array of all recorded messages
   */
  getMessages() {
    return this.messages;
  }

  /**
   * Get only log messages, filtering out other message types
   * @returns Array of log messages only
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
