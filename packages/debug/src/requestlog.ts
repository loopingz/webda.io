

/**
 * The body of a captured request or response.
 *
 * - `text`: text payload that fit entirely within the configured size limit.
 * - `text-truncated`: text payload truncated at the size limit; `content` is the prefix and `size` is the total byte count.
 * - `binary`: binary payload — only `size` and a short hex `preview` are kept.
 * - `empty`: no body at all.
 */
export type RequestLogBody =
  | { kind: "text"; content: string; size: number }
  | { kind: "text-truncated"; content: string; size: number }
  | { kind: "binary"; size: number; preview: string }
  | { kind: "empty" };

/**
 * Captured error attached to a request, when one was thrown.
 */
export interface RequestLogError {
  message: string;
  stack?: string;
}

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
  /** Captured request headers (lowercased keys, single string values). */
  requestHeaders?: Record<string, string>;
  /** Captured request body. */
  requestBody?: RequestLogBody;
  /** Captured response headers (single string values). */
  responseHeaders?: Record<string, string>;
  /** Captured response body. */
  responseBody?: RequestLogBody;
  /** Captured error, if the request failed. */
  error?: RequestLogError;
}

/**
 * Summary fields returned by the list endpoint — keep this cheap (no bodies, no headers).
 */
export type RequestLogSummary = Pick<RequestLogEntry, "id" | "method" | "url" | "timestamp" | "statusCode" | "duration">;

/**
 * Optional details that can be attached to an existing entry after capture.
 */
export interface RequestLogDetails {
  requestHeaders?: Record<string, string>;
  requestBody?: RequestLogBody;
  responseHeaders?: Record<string, string>;
  responseBody?: RequestLogBody;
  error?: RequestLogError;
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
   * Attach captured headers, bodies, and/or error details to an existing entry.
   *
   * Merges the provided fields onto the entry. Does nothing (silently) if the
   * id is unknown — the caller should call this only after `startRequest`.
   *
   * @param id - Unique identifier of the request.
   * @param details - Captured details to attach.
   */
  attachDetails(id: string, details: RequestLogDetails): void {
    const entry = this.index.get(id);
    if (!entry) return;
    if (details.requestHeaders !== undefined) entry.requestHeaders = details.requestHeaders;
    if (details.requestBody !== undefined) entry.requestBody = details.requestBody;
    if (details.responseHeaders !== undefined) entry.responseHeaders = details.responseHeaders;
    if (details.responseBody !== undefined) entry.responseBody = details.responseBody;
    if (details.error !== undefined) entry.error = details.error;
  }

  /**
   * Returns a shallow copy of all currently stored entries in insertion order.
   *
   * Includes any captured headers, bodies, and error details.
   *
   * @returns Array of {@link RequestLogEntry} objects.
   */
  getEntries(): RequestLogEntry[] {
    return [...this.entries];
  }

  /**
   * Returns lightweight summaries of all stored entries — no headers or bodies.
   *
   * Use this for the list view; use {@link getEntry} when the user drills in.
   *
   * @returns Array of {@link RequestLogSummary} objects in insertion order.
   */
  getSummaries(): RequestLogSummary[] {
    return this.entries.map(e => ({
      id: e.id,
      method: e.method,
      url: e.url,
      timestamp: e.timestamp,
      statusCode: e.statusCode,
      duration: e.duration
    }));
  }

  /**
   * Look up a single entry by id.
   *
   * @param id - Unique identifier of the request.
   * @returns The entry, or `undefined` if not found.
   */
  getEntry(id: string): RequestLogEntry | undefined {
    return this.index.get(id);
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
