import type { Panel } from "./panel.js";
import type { DebugClient, WsEvent } from "../client.js";

/**
 * A single formatted request entry for display.
 */
interface DisplayEntry {
  /** Formatted timestamp string */
  time: string;
  /** HTTP method */
  method: string;
  /** Request URL */
  url: string;
  /** HTTP status code (0 if pending) */
  statusCode: number;
  /** Duration in milliseconds */
  duration: number;
  /** Whether the request is still pending */
  pending: boolean;
}

/**
 * Requests panel: displays a live-updating list of HTTP requests
 * received from the debug server WebSocket. Newest entries appear at top.
 */
export class RequestsPanel implements Panel {
  name = "Requests";
  private entries: DisplayEntry[] = [];
  /** Map of request id to entry index for updating on result */
  private pendingMap = new Map<string, DisplayEntry>();
  /** Unsubscribe function for WebSocket events */
  private unsubscribe?: () => void;
  /** Maximum entries to keep in memory */
  private maxEntries = 500;
  /** Scroll offset from top */
  private scrollOffset = 0;
  /** Visible rows (updated on render) */
  private visibleRows = 0;

  /**
   * @param client - Debug API client
   */
  constructor(private client: DebugClient) {}

  /**
   * Load existing request history and subscribe to live events.
   */
  async refresh(): Promise<void> {
    // Fetch historical entries
    try {
      const history = await this.client.getRequests();
      this.entries = history.reverse().map((entry: any) => ({
        time: this.formatTime(entry.timestamp),
        method: entry.method,
        url: entry.url,
        statusCode: entry.statusCode || 0,
        duration: entry.duration || 0,
        pending: !entry.statusCode
      }));
    } catch {
      this.entries = [];
    }

    // Subscribe to WebSocket events (only once)
    if (!this.unsubscribe) {
      this.unsubscribe = this.client.onEvent((event: WsEvent) => {
        this.handleEvent(event);
      });
    }
  }

  /**
   * Handle a WebSocket event and update the entries list.
   * @param event - WebSocket event to process
   */
  private handleEvent(event: WsEvent): void {
    if (event.type === "request") {
      const entry: DisplayEntry = {
        time: this.formatTime(event.timestamp),
        method: event.method,
        url: event.url,
        statusCode: 0,
        duration: 0,
        pending: true
      };
      this.entries.unshift(entry);
      this.pendingMap.set(event.id, entry);

      // Trim old entries
      if (this.entries.length > this.maxEntries) {
        this.entries.length = this.maxEntries;
      }
    } else if (event.type === "result") {
      const entry = this.pendingMap.get(event.id);
      if (entry) {
        entry.statusCode = event.statusCode;
        entry.duration = event.duration;
        entry.pending = false;
        this.pendingMap.delete(event.id);
      }
    } else if (event.type === "404") {
      const entry = this.pendingMap.get(event.id);
      if (entry) {
        entry.statusCode = 404;
        entry.pending = false;
        this.pendingMap.delete(event.id);
      }
    }
  }

  /**
   * Handle keyboard input.
   * @param key - key name from terminal-kit
   */
  onKey(key: string): void {
    switch (key) {
      case "UP":
        this.scrollOffset = Math.max(0, this.scrollOffset - 1);
        break;
      case "DOWN":
        this.scrollOffset = Math.min(Math.max(0, this.entries.length - this.visibleRows), this.scrollOffset + 1);
        break;
      case "PAGE_UP":
        this.scrollOffset = Math.max(0, this.scrollOffset - this.visibleRows);
        break;
      case "PAGE_DOWN":
        this.scrollOffset = Math.min(
          Math.max(0, this.entries.length - this.visibleRows),
          this.scrollOffset + this.visibleRows
        );
        break;
      case "HOME":
        this.scrollOffset = 0;
        break;
    }
  }

  /**
   * Render the request log.
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  render(term: any, startRow: number, endRow: number, width: number): void {
    this.visibleRows = endRow - startRow - 1;

    // Header
    term.moveTo(1, startRow);
    term.eraseLine();
    term.bold("  Time       Method  URL" + " ".repeat(Math.max(1, 40 - 3)) + "Status  Duration");

    const dataStart = startRow + 1;

    if (this.entries.length === 0) {
      term.moveTo(1, dataStart);
      term.eraseLine();
      term("  Waiting for requests...");
      return;
    }

    for (let i = 0; i < this.visibleRows; i++) {
      const idx = this.scrollOffset + i;
      const row = dataStart + i;
      term.moveTo(1, row);
      term.eraseLine();

      if (idx >= this.entries.length) continue;
      const entry = this.entries[idx];

      // Time
      term.dim(`  ${entry.time}  `);

      // Method (color-coded)
      const methodStr = entry.method.padEnd(6);
      this.renderMethod(term, methodStr);
      term("  ");

      // URL (truncated)
      const maxUrlLen = Math.max(10, width - 55);
      const url = entry.url.length > maxUrlLen ? entry.url.substring(0, maxUrlLen - 3) + "..." : entry.url;
      term(url.padEnd(maxUrlLen));
      term("  ");

      // Status + Duration
      if (entry.pending) {
        term.yellow("...");
      } else {
        const status = String(entry.statusCode);
        if (entry.statusCode >= 200 && entry.statusCode < 300) {
          term.green(status);
        } else if (entry.statusCode >= 300 && entry.statusCode < 400) {
          term.yellow(status);
        } else {
          term.red(status);
        }
        term(`    ${entry.duration}ms`);
      }
    }
  }

  /**
   * Render an HTTP method with appropriate color.
   * @param term - terminal-kit instance
   * @param method - padded method string to render
   */
  private renderMethod(term: any, method: string): void {
    const m = method.trim().toUpperCase();
    if (m === "GET") term.green(method);
    else if (m === "POST") term.cyan(method);
    else if (m === "PUT") term.yellow(method);
    else if (m === "DELETE") term.red(method);
    else if (m === "PATCH") term.magenta(method);
    else term(method);
  }

  /**
   * Format a timestamp as HH:MM:SS.
   * @param ts - Unix timestamp in milliseconds
   * @returns formatted time string
   */
  private formatTime(ts: number): string {
    const d = new Date(ts);
    return (
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0") +
      ":" +
      String(d.getSeconds()).padStart(2, "0")
    );
  }

  /**
   * Clean up panel resources and unsubscribe from events.
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.entries = [];
    this.pendingMap.clear();
  }
}
