import { WorkerMessage, WorkerOutput } from "../core";
import { FileLogger } from "./file";

/**
 * Debug logger that writes all messages (including non-log events) to a file in JSON format
 * Useful for debugging and troubleshooting by capturing the complete message stream
 *
 * @example
 * ```typescript
 * const output = new WorkerOutput();
 * new DebugLogger(output, "/var/log/debug.log");
 * output.log("INFO", "Test"); // Writes full JSON message
 * output.startProgress("task", 100); // Also captured
 * ```
 */
export class DebugLogger extends FileLogger {
  /**
   * Create a new debug logger
   * @param output - WorkerOutput instance to listen to
   * @param filepath - Path to the debug log file
   */
  constructor(output: WorkerOutput, filepath: string) {
    super(output, "TRACE", filepath, -1);
  }

  /**
   * Accept all messages without filtering
   * @returns Always returns true to log all message types
   */
  filter() {
    return true;
  }

  /**
   * Format a message as a JSON string with type and timestamp
   * @param msg - The message to format
   * @returns JSON formatted log line with newline
   */
  getLine(msg: WorkerMessage) {
    return `${msg.type}:${msg.timestamp}:${JSON.stringify(msg)}\n`;
  }
}
