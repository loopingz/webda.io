import { ScrollablePanel } from "./panel.js";
import { DebugClient } from "../client.js";

/**
 * Operations panel: displays all registered operations in a table
 * with ID, input schema, and output schema.
 */
export class OperationsPanel extends ScrollablePanel {
  name = "Operations";
  private operations: any[] = [];
  private visibleRows = 0;

  /**
   * @param client - Debug API client
   */
  constructor(private client: DebugClient) {
    super();
  }

  /**
   * Fetch operations from the debug server.
   */
  async refresh(): Promise<void> {
    try {
      this.operations = await this.client.getOperations();
      this.itemCount = this.operations.length;
      this.cursor = Math.min(this.cursor, Math.max(0, this.itemCount - 1));
    } catch {
      this.operations = [];
      this.itemCount = 0;
    }
  }

  /**
   * Handle keyboard input.
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
    }
  }

  /**
   * Render the operations table.
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  render(term: any, startRow: number, endRow: number, width: number): void {
    this.visibleRows = endRow - startRow - 1;

    if (this.operations.length === 0) {
      term.moveTo(1, startRow);
      term.eraseLine();
      term("  No operations found. Is the debug server running?");
      return;
    }

    // Header
    term.moveTo(1, startRow);
    term.eraseLine();
    term.bold(
      "  ID" +
        " ".repeat(Math.max(1, 35 - 2)) +
        "Input" +
        " ".repeat(Math.max(1, 20 - 5)) +
        "Output"
    );

    const dataStart = startRow + 1;
    const visible = endRow - dataStart;

    for (let i = 0; i < visible; i++) {
      const idx = this.scrollOffset + i;
      const row = dataStart + i;
      term.moveTo(1, row);
      term.eraseLine();

      if (idx >= this.operations.length) continue;
      const op = this.operations[idx];
      const isSelected = idx === this.cursor;

      const id = (op.id || "unknown").substring(0, 33);
      const input = (op.input || "-").substring(0, 18);
      const output = (op.output || "-").substring(0, 18);

      const line = `  ${id.padEnd(33)}  ${input.padEnd(18)}  ${output.padEnd(18)}`;

      if (isSelected) {
        term.inverse(line.padEnd(width));
      } else {
        term(line);
      }
    }
  }

  /**
   * Clean up panel resources.
   */
  destroy(): void {
    this.operations = [];
  }
}
