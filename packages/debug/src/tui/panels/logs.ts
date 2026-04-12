import type { Panel } from "./panel.js";
import type { DebugClient, WsEvent } from "../client.js";

/**
 * A single log entry for display.
 */
interface LogEntry {
  /** Formatted timestamp string */
  time: string;
  /** Log level (INFO, WARN, ERROR, DEBUG, TRACE) */
  level: string;
  /** Log message */
  message: string;
  /** Raw timestamp for sorting */
  timestamp: number;
}

/**
 * Logs panel: displays application log entries with color-coded
 * levels and search filtering. Receives live log events via
 * WebSocket and allows searching with `/`.
 */
export class LogsPanel implements Panel {
  name = "Logs";
  private entries: LogEntry[] = [];
  private cursor = 0;
  private scrollOffset = 0;
  private visibleRows = 0;
  private searchQuery = "";
  private searchMode = false;
  /** Current minimum log level filter */
  private levelFilter = 2; // Index into LOG_LEVELS, default INFO
  /** Maximum entries to keep in memory */
  private maxEntries = 2000;

  /**
   * @param client - Debug API client
   */
  constructor(private client: DebugClient) {}

  /**
   * Fetch existing log entries from the server.
   */
  async refresh(): Promise<void> {
    try {
      const logs = await this.client.getLogs();
      this.entries = logs.map((entry: any) => this.toLogEntry(entry)).reverse();
    } catch {
      this.entries = [];
    }
  }

  /**
   * Handle a WebSocket event. Adds log events to the entries list.
   *
   * @param event - WebSocket event to process
   */
  onWsEvent(event: WsEvent): void {
    if (event.type === "log") {
      const logEvent = event as any;
      this.entries.unshift(this.toLogEntry(logEvent));
      if (this.entries.length > this.maxEntries) {
        this.entries.pop();
      }
    }
  }

  /**
   * Convert a raw log object to a display entry.
   *
   * @param raw - raw log data from API or WebSocket
   * @returns formatted log entry
   */
  private toLogEntry(raw: any): LogEntry {
    const ts = raw.timestamp || Date.now();
    return {
      time: this.formatTime(ts),
      level: (raw.level || "INFO").toUpperCase(),
      message: raw.message || raw.msg || String(raw),
      timestamp: ts
    };
  }

  /**
   * Format a timestamp as HH:MM:SS.mmm.
   *
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
      String(d.getSeconds()).padStart(2, "0") +
      "." +
      String(d.getMilliseconds()).padStart(3, "0")
    );
  }

  /**
   * Log level severity order — higher index means more severe.
   */
  private static readonly LOG_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

  /**
   * Get entries filtered by the current log level and optional search query.
   * Level filter is always applied. Text search is additional.
   *
   * @returns filtered log entries
   */
  private getFilteredEntries(): LogEntry[] {
    // Always filter by minimum level
    let result = this.entries.filter(
      entry => LogsPanel.LOG_LEVELS.indexOf(entry.level) >= this.levelFilter
    );
    // Apply text search if active
    if (this.searchQuery) {
      const lq = this.searchQuery.toLowerCase();
      result = result.filter(
        entry => entry.message.toLowerCase().includes(lq) || entry.level.toLowerCase().includes(lq)
      );
    }
    return result;
  }

  /**
   * Cycle the log level filter to the next level.
   */
  private cycleLevelUp(): void {
    this.levelFilter = Math.min(LogsPanel.LOG_LEVELS.length - 1, this.levelFilter + 1);
    this.cursor = 0;
    this.scrollOffset = 0;
  }

  /**
   * Cycle the log level filter to the previous level.
   */
  private cycleLevelDown(): void {
    this.levelFilter = Math.max(0, this.levelFilter - 1);
    this.cursor = 0;
    this.scrollOffset = 0;
  }

  /**
   * Handle keyboard input for scrolling and search.
   *
   * @param key - key name from terminal-kit
   */
  onKey(key: string): void {
    if (key === "/") {
      this.searchMode = true;
      this.searchQuery = "";
      return;
    }

    // Level filter: l/+ to increase severity, L/- to decrease
    if (key === "l" || key === "+") {
      this.cycleLevelUp();
      return;
    }
    if (key === "L" || key === "-") {
      this.cycleLevelDown();
      return;
    }

    if (this.searchMode) {
      if (key === "ENTER") {
        this.searchMode = false;
        this.cursor = 0;
        this.scrollOffset = 0;
      } else if (key === "ESCAPE") {
        this.searchMode = false;
        this.searchQuery = "";
        this.cursor = 0;
        this.scrollOffset = 0;
      } else if (key === "BACKSPACE") {
        this.searchQuery = this.searchQuery.slice(0, -1);
      } else if (key.length === 1) {
        this.searchQuery += key;
      }
      return;
    }

    const filtered = this.getFilteredEntries();

    switch (key) {
      case "UP":
        if (this.cursor > 0) this.cursor--;
        break;
      case "DOWN":
        if (this.cursor < filtered.length - 1) this.cursor++;
        break;
      case "PAGE_UP":
        this.cursor = Math.max(0, this.cursor - this.visibleRows);
        break;
      case "PAGE_DOWN":
        this.cursor = Math.min(filtered.length - 1, this.cursor + this.visibleRows);
        break;
      case "HOME":
        this.cursor = 0;
        this.scrollOffset = 0;
        break;
      case "END":
        this.cursor = Math.max(0, filtered.length - 1);
        break;
    }

    // Adjust scroll to keep cursor visible
    if (this.cursor < this.scrollOffset) {
      this.scrollOffset = this.cursor;
    } else if (this.cursor >= this.scrollOffset + this.visibleRows) {
      this.scrollOffset = this.cursor - this.visibleRows + 1;
    }
  }

  /**
   * Render the log entries with color-coded levels and optional search bar.
   *
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  render(term: any, startRow: number, endRow: number, width: number): void {
    // Level filter bar (always visible, first row)
    term.moveTo(1, startRow);
    term.eraseLine();
    term.dim("  Level: ");
    for (let i = 0; i < LogsPanel.LOG_LEVELS.length; i++) {
      const lvl = LogsPanel.LOG_LEVELS[i];
      if (i === this.levelFilter) {
        term.bgCyan.black.bold(` ${lvl} `);
      } else if (i < this.levelFilter) {
        term.dim(` ${lvl} `);
      } else {
        this.renderLevel(term, lvl);
      }
      term(" ");
    }
    term.dim("  (l/+ more, L/- less)");

    const contentStart = startRow + 1;
    // Reserve one row for search bar when in search mode
    const searchBarRow = this.searchMode ? endRow - 1 : -1;
    const contentEnd = this.searchMode ? endRow - 1 : endRow;
    this.visibleRows = contentEnd - contentStart;

    const filtered = this.getFilteredEntries();

    // Clamp cursor
    if (filtered.length > 0 && this.cursor >= filtered.length) {
      this.cursor = filtered.length - 1;
    }

    if (filtered.length === 0) {
      term.moveTo(1, contentStart);
      term.eraseLine();
      if (this.searchQuery) {
        term(`  No logs matching "${this.searchQuery}"`);
      } else {
        term("  No log entries. Press / to search.");
      }
    } else {
      for (let i = 0; i < this.visibleRows; i++) {
        const idx = this.scrollOffset + i;
        const row = contentStart + i;
        term.moveTo(1, row);
        term.eraseLine();

        if (idx >= filtered.length) continue;

        const entry = filtered[idx];
        const isCurrent = idx === this.cursor;

        if (isCurrent) {
          term.bgGray();
        }

        // Timestamp
        term.dim(`  ${entry.time} `);

        // Level with color
        this.renderLevel(term, entry.level);

        // Message (truncated to fit)
        const prefixLen = 2 + 12 + 1 + 6 + 1;
        const maxMsgLen = Math.max(10, width - prefixLen);
        const msg = entry.message.length > maxMsgLen ? entry.message.substring(0, maxMsgLen - 3) + "..." : entry.message;
        term(` ${msg}`);

        if (isCurrent) {
          term.styleReset();
        }
      }
    }

    // Search bar
    if (this.searchMode && searchBarRow > 0) {
      term.moveTo(1, searchBarRow);
      term.eraseLine();
      term.bgBlue.white(` Search: ${this.searchQuery}_ `);
      term.styleReset();
    }
  }

  /**
   * Render a log level with appropriate color.
   *
   * @param term - terminal-kit instance
   * @param level - log level string
   */
  private renderLevel(term: any, level: string): void {
    const padded = level.padEnd(5);
    switch (level) {
      case "ERROR":
        term.red.bold(padded);
        break;
      case "WARN":
        term.yellow(padded);
        break;
      case "INFO":
        term.green(padded);
        break;
      case "DEBUG":
        term.cyan(padded);
        break;
      case "TRACE":
        term.dim(padded);
        break;
      default:
        term(padded);
    }
  }

  /**
   * Clean up panel resources.
   */
  destroy(): void {
    this.entries = [];
  }
}
