import { useWorkerOutput, type WorkerLogLevel } from "@webda/workout";

/**
 * A single captured log entry.
 */
export interface LogEntry {
  /** Unique identifier for this entry */
  id: string;
  /** Unix timestamp when the log was emitted */
  timestamp: number;
  /** Severity level */
  level: WorkerLogLevel;
  /** Formatted message string */
  message: string;
  /** Raw arguments from the log call */
  args: any[];
}

/**
 * Event emitted when a new log entry is captured.
 */
export type LogEvent = { type: "log"; id: string; timestamp: number; level: WorkerLogLevel; message: string };

type LogEventCallback = (event: LogEvent) => void;

/**
 * Ring buffer that captures application logs from WorkerOutput
 * and notifies subscribers of new entries in real time.
 */
export class LogBuffer {
  /** Stored log entries */
  private entries: LogEntry[] = [];
  /** Active event subscribers */
  private subscribers: Set<LogEventCallback> = new Set();
  /** Listener function attached to WorkerOutput */
  private listener: (msg: any) => void;

  /**
   * Create a new LogBuffer.
   * @param maxSize - Maximum number of entries to retain (oldest are evicted)
   */
  constructor(private maxSize: number = 2000) {
    this.listener = (msg: any) => {
      if (msg.type !== "log" || !msg.log) return;
      const id = Math.random().toString(36).substring(2);
      const entry: LogEntry = {
        id,
        timestamp: msg.timestamp,
        level: msg.log.level,
        message: msg.log.args
          .map((a: any) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
          .join(" "),
        args: msg.log.args
      };
      if (this.entries.length >= this.maxSize) {
        this.entries.shift();
      }
      this.entries.push(entry);
      const event: LogEvent = {
        type: "log",
        id,
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message
      };
      for (const cb of this.subscribers) {
        cb(event);
      }
    };
  }

  /**
   * Start listening to WorkerOutput messages.
   */
  subscribe(): void {
    useWorkerOutput().on("message", this.listener);
  }

  /**
   * Stop listening to WorkerOutput messages.
   */
  unsubscribe(): void {
    try {
      useWorkerOutput().removeListener("message", this.listener);
    } catch {
      // WorkerOutput may not be available
    }
  }

  /**
   * Return a shallow copy of all stored entries.
   * @returns array of log entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Filter entries whose message or level contains the query (case-insensitive).
   * @param query - search string
   * @returns matching entries
   */
  search(query: string): LogEntry[] {
    const lower = query.toLowerCase();
    return this.entries.filter(
      e => e.message.toLowerCase().includes(lower) || e.level.toLowerCase().includes(lower)
    );
  }

  /**
   * Register a callback for new log events.
   * @param callback - function invoked on each new log event
   * @returns unsubscribe function
   */
  onEvent(callback: LogEventCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
}
