import type { Panel } from "./panel.js";
import type { DebugClient, WsEvent } from "../client.js";

/**
 * A single formatted request entry for display.
 */
interface DisplayEntry {
  /** Stable identifier (matches RequestLogEntry.id) */
  id: string;
  /** Formatted timestamp string */
  time: string;
  /** Raw timestamp for ordering */
  timestamp: number;
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
 *
 * Press Enter or Right-arrow on a row to drill into the captured
 * headers/bodies. Press Left-arrow, Escape, or Enter again to return to the list.
 */
export class RequestsPanel implements Panel {
  name = "Requests";
  private entries: DisplayEntry[] = [];
  /** Map of request id to entry for updating on result */
  private byId = new Map<string, DisplayEntry>();
  /** Unsubscribe function for WebSocket events */
  private unsubscribe?: () => void;
  /** Maximum entries to keep in memory */
  private maxEntries = 500;
  /** Scroll offset from top */
  private scrollOffset = 0;
  /** Cursor position into the entries array */
  private cursor = 0;
  /** Visible rows (updated on render) */
  private visibleRows = 0;
  /** When non-null, the panel is showing a detail view for this id */
  private detailId: string | null = null;
  /** Cached detail entry currently displayed */
  private detail: any = null;
  /** Detail view error message, if any */
  private detailError: string | null = null;
  /** Loading flag for detail */
  private detailLoading = false;
  /** Detail view scroll offset */
  private detailScroll = 0;

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
      this.entries = history.map((entry: any) => this.toDisplay(entry)).reverse();
      this.byId.clear();
      for (const entry of this.entries) this.byId.set(entry.id, entry);
    } catch {
      this.entries = [];
      this.byId.clear();
    }

    // Subscribe to WebSocket events (only once)
    if (!this.unsubscribe) {
      this.unsubscribe = this.client.onEvent((event: WsEvent) => {
        this.handleEvent(event);
      });
    }
  }

  /**
   * Convert a raw RequestLogEntry summary to a display entry.
   *
   * @param raw - raw entry from the API
   * @returns formatted display entry
   */
  private toDisplay(raw: any): DisplayEntry {
    return {
      id: raw.id,
      time: this.formatTime(raw.timestamp),
      timestamp: raw.timestamp,
      method: raw.method || "?",
      url: raw.url || "/",
      statusCode: raw.statusCode || 0,
      duration: raw.duration || 0,
      pending: !raw.statusCode
    };
  }

  /**
   * Handle a WebSocket event and update the entries list.
   * @param event - WebSocket event to process
   */
  private handleEvent(event: WsEvent): void {
    if (event.type === "request") {
      const entry: DisplayEntry = {
        id: event.id,
        time: this.formatTime(event.timestamp),
        timestamp: event.timestamp,
        method: event.method,
        url: event.url,
        statusCode: 0,
        duration: 0,
        pending: true
      };
      this.entries.unshift(entry);
      this.byId.set(event.id, entry);

      // Trim old entries
      if (this.entries.length > this.maxEntries) {
        const removed = this.entries.pop();
        if (removed) this.byId.delete(removed.id);
      }
    } else if (event.type === "result") {
      const entry = this.byId.get(event.id);
      if (entry) {
        entry.statusCode = event.statusCode;
        entry.duration = event.duration;
        entry.pending = false;
      }
    } else if (event.type === "404") {
      const entry = this.byId.get(event.id);
      if (entry) {
        entry.statusCode = 404;
        entry.pending = false;
      }
    }
  }

  /**
   * Asynchronously load the detail for the currently selected request id.
   * Updates internal state; the next render will reflect the result.
   *
   * @param id - request id to fetch
   */
  private async loadDetail(id: string): Promise<void> {
    this.detailLoading = true;
    this.detailError = null;
    this.detail = null;
    try {
      this.detail = await this.client.getRequestDetail(id);
    } catch (err: any) {
      this.detailError = err?.message ?? String(err);
    } finally {
      this.detailLoading = false;
    }
  }

  /**
   * Open the detail view for the entry at the current cursor.
   */
  private openDetail(): void {
    const entry = this.entries[this.cursor];
    if (!entry) return;
    this.detailId = entry.id;
    this.detailScroll = 0;
    // Fire-and-forget — render will show "Loading..." until the promise lands.
    void this.loadDetail(entry.id);
  }

  /**
   * Close the detail view and return to the list.
   */
  private closeDetail(): void {
    this.detailId = null;
    this.detail = null;
    this.detailError = null;
    this.detailLoading = false;
    this.detailScroll = 0;
  }

  /**
   * Handle keyboard input.
   * @param key - key name from terminal-kit
   */
  onKey(key: string): void {
    if (this.detailId) {
      // Detail view key handling
      switch (key) {
        case "ESCAPE":
        case "LEFT":
        case "BACKSPACE":
          this.closeDetail();
          break;
        case "UP":
          this.detailScroll = Math.max(0, this.detailScroll - 1);
          break;
        case "DOWN":
          this.detailScroll++;
          break;
        case "PAGE_UP":
          this.detailScroll = Math.max(0, this.detailScroll - this.visibleRows);
          break;
        case "PAGE_DOWN":
          this.detailScroll += this.visibleRows;
          break;
      }
      return;
    }

    switch (key) {
      case "UP":
        this.moveCursor(-1);
        break;
      case "DOWN":
        this.moveCursor(1);
        break;
      case "PAGE_UP":
        this.moveCursor(-this.visibleRows);
        break;
      case "PAGE_DOWN":
        this.moveCursor(this.visibleRows);
        break;
      case "HOME":
        this.cursor = 0;
        this.scrollOffset = 0;
        break;
      case "END":
        this.cursor = Math.max(0, this.entries.length - 1);
        break;
      case "ENTER":
      case "RIGHT":
        this.openDetail();
        break;
    }
  }

  /**
   * Move cursor by delta, keeping it in range and adjusting scroll.
   *
   * @param delta - rows to move (negative = up)
   */
  private moveCursor(delta: number): void {
    if (this.entries.length === 0) return;
    this.cursor = Math.max(0, Math.min(this.entries.length - 1, this.cursor + delta));
    if (this.cursor < this.scrollOffset) {
      this.scrollOffset = this.cursor;
    } else if (this.cursor >= this.scrollOffset + this.visibleRows) {
      this.scrollOffset = this.cursor - this.visibleRows + 1;
    }
  }

  /**
   * Render the panel: either the request list or the detail view.
   *
   * @param term - terminal-kit instance
   * @param startRow - first row available for content
   * @param endRow - last row available for content
   * @param width - terminal width in columns
   */
  render(term: any, startRow: number, endRow: number, width: number): void {
    if (this.detailId) {
      this.renderDetail(term, startRow, endRow, width);
    } else {
      this.renderList(term, startRow, endRow, width);
    }
  }

  /**
   * Render the request list (default view).
   *
   * @param term - terminal-kit instance
   * @param startRow - first row available for content
   * @param endRow - last row available for content
   * @param width - terminal width in columns
   */
  private renderList(term: any, startRow: number, endRow: number, width: number): void {
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
      const isCurrent = idx === this.cursor;

      if (isCurrent) {
        term.bgGray();
      }

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

      if (isCurrent) {
        term.styleReset();
      }
    }
  }

  /**
   * Render the detail view for the selected request.
   *
   * @param term - terminal-kit instance
   * @param startRow - first row available for content
   * @param endRow - last row available for content
   * @param width - terminal width in columns
   */
  private renderDetail(term: any, startRow: number, endRow: number, width: number): void {
    this.visibleRows = endRow - startRow - 1;

    const lines = this.buildDetailLines(width);

    // Top header
    term.moveTo(1, startRow);
    term.eraseLine();
    term.bold("  Request Detail  ");
    term.dim("(Esc/← to return, ↑↓ to scroll)");

    const dataStart = startRow + 1;

    // Clamp scroll to content length
    const maxScroll = Math.max(0, lines.length - this.visibleRows);
    if (this.detailScroll > maxScroll) this.detailScroll = maxScroll;

    for (let i = 0; i < this.visibleRows; i++) {
      const row = dataStart + i;
      const lineIdx = this.detailScroll + i;
      term.moveTo(1, row);
      term.eraseLine();
      if (lineIdx >= lines.length) continue;
      term(lines[lineIdx]);
    }
  }

  /**
   * Build the wrapped, formatted lines that make up the detail view.
   * Returns an array of strings (one per terminal row).
   *
   * @param width - terminal width
   * @returns array of formatted lines
   */
  private buildDetailLines(width: number): string[] {
    const lines: string[] = [];

    if (this.detailLoading) {
      lines.push("  Loading...");
      return lines;
    }
    if (this.detailError) {
      lines.push(`  Failed to load detail: ${this.detailError}`);
      return lines;
    }
    if (!this.detail) {
      lines.push("  (no detail available)");
      return lines;
    }

    const e = this.detail;
    lines.push(`  ${e.method || "?"} ${e.url || "/"}`);
    lines.push(
      `  Status: ${e.statusCode ?? "pending"}    Duration: ${e.duration != null ? e.duration + "ms" : "-"}    Time: ${this.formatTime(e.timestamp || 0)}`
    );
    lines.push("");

    if (e.error) {
      lines.push("  Error:");
      lines.push(`    ${e.error.message || ""}`);
      if (e.error.stack) {
        for (const stackLine of String(e.error.stack).split("\n")) {
          lines.push(`    ${stackLine}`);
        }
      }
      lines.push("");
    }

    lines.push("  Request Headers:");
    this.appendHeadersBlock(lines, e.requestHeaders);
    lines.push("");
    lines.push("  Request Body:");
    this.appendBodyBlock(lines, e.requestBody, width);
    lines.push("");

    lines.push("  Response Headers:");
    this.appendHeadersBlock(lines, e.responseHeaders);
    lines.push("");
    lines.push("  Response Body:");
    this.appendBodyBlock(lines, e.responseBody, width);

    return lines;
  }

  /**
   * Append a flat key/value list of headers to a line buffer.
   *
   * @param lines - target line buffer that receives the formatted lines
   * @param headers - header map to render, may be undefined
   */
  private appendHeadersBlock(lines: string[], headers: Record<string, string> | undefined): void {
    if (!headers) {
      lines.push("    (not captured)");
      return;
    }
    const keys = Object.keys(headers).sort();
    if (keys.length === 0) {
      lines.push("    (none)");
      return;
    }
    for (const k of keys) {
      lines.push(`    ${k}: ${headers[k]}`);
    }
  }

  /**
   * Append a body capture (text / text-truncated / binary / empty) to the
   * line buffer, wrapping long lines to the terminal width.
   *
   * @param lines - target line buffer that receives the formatted lines
   * @param body - the captured body record (or undefined)
   * @param width - terminal width in columns, used for line wrapping
   */
  private appendBodyBlock(lines: string[], body: any, width: number): void {
    if (!body) {
      lines.push("    (not captured)");
      return;
    }
    if (body.kind === "empty") {
      lines.push("    (empty)");
      return;
    }
    if (body.kind === "binary") {
      lines.push(`    Binary, ${this.formatBytes(body.size)} (preview: 0x${body.preview || ""})`);
      return;
    }
    // text or text-truncated — render content with a 4-space indent, wrap at width
    const content: string = body.content || "";
    const wrapWidth = Math.max(20, width - 6);
    for (const rawLine of content.split("\n")) {
      if (rawLine.length <= wrapWidth) {
        lines.push(`    ${rawLine}`);
      } else {
        for (let i = 0; i < rawLine.length; i += wrapWidth) {
          lines.push(`    ${rawLine.substring(i, i + wrapWidth)}`);
        }
      }
    }
    if (body.kind === "text-truncated") {
      lines.push(`    [truncated — total ${this.formatBytes(body.size)}]`);
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
   * Format a byte count for display in the detail view.
   *
   * @param n - byte count, possibly undefined
   * @returns formatted human-readable byte count (e.g. "12.3 KB")
   */
  private formatBytes(n: number | undefined): string {
    if (n == null) return "?";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
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
    this.byId.clear();
    this.detail = null;
    this.detailId = null;
  }
}
