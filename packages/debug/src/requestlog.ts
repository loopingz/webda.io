

/**
 * A single entry in the request log
 */
export interface RequestLogEntry {
  id: string;
  method: string;
  url: string;
  timestamp: number;
  statusCode?: number;
  duration?: number;
}

/**
 * Events emitted by the RequestLog for request lifecycle changes
 */
export type RequestLogEvent =
  | { type: "request"; id: string; method: string; url: string; timestamp: number }
  | { type: "result"; id: string; statusCode: number; duration: number }
  | { type: "404"; id: string; method: string; url: string };

type EventCallback = (event: RequestLogEvent) => void;

/**
 * A fixed-size ring buffer that tracks HTTP requests and pushes lifecycle events to subscribers.
 *
 * When the buffer is full, the oldest entry is evicted to make room for the new one.
 */
export class RequestLog {
  private entries: RequestLogEntry[] = [];
  private index = new Map<string, RequestLogEntry>();
  private subscribers: Set<EventCallback> = new Set();

  /**
   * Creates a new RequestLog.
   *
   * @param maxSize - Maximum number of entries to retain before evicting the oldest. Defaults to 1000.
   */
  constructor(private maxSize: number = 1000) {}

  /**
   * Records the start of an incoming HTTP request.
   *
   * If the buffer is at capacity the oldest entry is removed first.
   * A `"request"` event is pushed to all subscribers.
   *
   * @param id - Unique identifier for the request.
   * @param method - HTTP method (e.g. "GET", "POST").
   * @param url - Request URL.
   */
  startRequest(id: string, method: string, url: string): void {
    const entry: RequestLogEntry = { id, method, url, timestamp: Date.now() };
    if (this.entries.length >= this.maxSize) {
      const removed = this.entries.shift();
      if (removed) this.index.delete(removed.id);
    }
    this.entries.push(entry);
    this.index.set(id, entry);
    this.notify({ type: "request", id, method, url, timestamp: entry.timestamp });
  }

  /**
   * Records the completion of a previously started request.
   *
   * Updates the entry with the final status code and duration, then pushes a
   * `"result"` event to all subscribers. Does nothing if the id is unknown.
   *
   * @param id - Unique identifier of the request.
   * @param statusCode - HTTP response status code.
   * @param duration - Request duration in milliseconds.
   */
  completeRequest(id: string, statusCode: number, duration: number): void {
    const entry = this.index.get(id);
    if (!entry) return;
    entry.statusCode = statusCode;
    entry.duration = duration;
    this.notify({ type: "result", id, statusCode, duration });
  }

  /**
   * Marks a previously started request as a 404 Not Found response.
   *
   * Updates the entry's status code to 404 and pushes a `"404"` event to all
   * subscribers. Does nothing if the id is unknown.
   *
   * @param id - Unique identifier of the request.
   */
  markNotFound(id: string): void {
    const entry = this.index.get(id);
    if (!entry) return;
    entry.statusCode = 404;
    this.notify({ type: "404", id, method: entry.method, url: entry.url });
  }

  /**
   * Returns a shallow copy of all currently stored entries in insertion order.
   *
   * @returns Array of {@link RequestLogEntry} objects.
   */
  getEntries(): RequestLogEntry[] {
    return [...this.entries];
  }

  /**
   * Registers a callback that will be invoked for every future log event.
   *
   * @param callback - Function called with each {@link RequestLogEvent}.
   * @returns An unsubscribe function. Call it to stop receiving events.
   */
  onEvent(callback: EventCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Dispatches an event to all current subscribers.
   *
   * @param event - The event to dispatch.
   */
  private notify(event: RequestLogEvent): void {
    for (const cb of this.subscribers) {
      cb(event);
    }
  }
}
