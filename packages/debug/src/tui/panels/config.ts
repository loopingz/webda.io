import { ScrollablePanel } from "./panel.js";
import { DebugClient } from "../client.js";

/**
 * Config panel: displays the resolved application configuration
 * as syntax-highlighted, scrollable JSON.
 */
export class ConfigPanel extends ScrollablePanel {
  name = "Config";
  private lines: string[] = [];
  private visibleRows = 0;

  /**
   * @param client - Debug API client
   */
  constructor(private client: DebugClient) {
    super();
  }

  /**
   * Fetch and format the configuration.
   */
  async refresh(): Promise<void> {
    try {
      const config = await this.client.getConfig();
      this.lines = JSON.stringify(config, null, 2).split("\n");
      this.itemCount = this.lines.length;
      this.cursor = Math.min(this.cursor, Math.max(0, this.itemCount - 1));
    } catch {
      this.lines = ["  Error loading configuration"];
      this.itemCount = 1;
    }
  }

  /**
   * Handle keyboard input for scrolling.
   * @param key - key name from terminal-kit
   */
  onKey(key: string): void {
    switch (key) {
      case "UP":
        this.moveCursor(-1, this.visibleRows);
        break;
      case "DOWN":
        this.moveCursor(1, this.visibleRows);
        break;
      case "PAGE_UP":
        this.moveCursor(-this.visibleRows, this.visibleRows);
        break;
      case "PAGE_DOWN":
        this.moveCursor(this.visibleRows, this.visibleRows);
        break;
      case "HOME":
        this.cursor = 0;
        this.scrollOffset = 0;
        break;
      case "END":
        this.cursor = Math.max(0, this.itemCount - 1);
        this.scrollOffset = Math.max(0, this.itemCount - this.visibleRows);
        break;
    }
  }

  /**
   * Render the JSON content with syntax highlighting.
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  render(term: any, startRow: number, endRow: number, width: number): void {
    this.visibleRows = endRow - startRow;

    if (this.lines.length === 0) {
      term.moveTo(1, startRow);
      term.eraseLine();
      term("  No configuration loaded.");
      return;
    }

    for (let i = 0; i < this.visibleRows; i++) {
      const idx = this.scrollOffset + i;
      const row = startRow + i;
      term.moveTo(1, row);
      term.eraseLine();

      if (idx >= this.lines.length) continue;

      const line = this.lines[idx];
      const lineNum = String(idx + 1).padStart(4) + "  ";

      term.dim(lineNum);
      this.renderJsonLine(term, line);
    }
  }

  /**
   * Render a single JSON line with basic syntax highlighting.
   *
   * @param term - terminal-kit instance
   * @param line - Raw JSON text line
   */
  private renderJsonLine(term: any, line: string): void {
    // Simple regex-based highlighting
    const parts = line.split(/("(?:[^"\\]|\\.)*")/g);
    let isKey = true;

    for (const part of parts) {
      if (part.startsWith('"') && part.endsWith('"')) {
        if (isKey && line.trimStart().startsWith('"')) {
          // JSON key
          term.cyan(part);
          isKey = false;
        } else {
          // String value
          term.green(part);
        }
      } else if (/\b(true|false)\b/.test(part)) {
        term.yellow(part);
      } else if (/\b(null)\b/.test(part)) {
        term.red(part);
      } else if (/\b\d+\.?\d*\b/.test(part)) {
        // Could contain numbers mixed with punctuation
        term.magenta(part);
      } else {
        term(part);
      }
    }
  }

  /**
   * Clean up panel resources.
   */
  destroy(): void {
    this.lines = [];
  }
}
