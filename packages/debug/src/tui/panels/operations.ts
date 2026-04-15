import { ScrollablePanel } from "./panel.js";
import { DebugClient } from "../client.js";

/**
 * Operations panel: displays all registered operations in a table
 * with ID, REST method/URL, and input/output schemas.
 * Press Enter for detail view with implementor, schemas, and code.
 */
export class OperationsPanel extends ScrollablePanel {
  name = "Operations";
  private operations: any[] = [];
  private visibleRows = 0;
  private detailMode = false;
  private detailScroll = 0;

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
    if (this.detailMode) {
      switch (key) {
        case "ESCAPE":
        case "BACKSPACE":
          this.detailMode = false;
          this.detailScroll = 0;
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
        this.moveCursor(-1, this.visibleRows);
        break;
      case "DOWN":
        this.moveCursor(1, this.visibleRows);
        break;
      case "ENTER":
        if (this.operations.length > 0) {
          this.detailMode = true;
          this.detailScroll = 0;
        }
        break;
    }
  }

  /**
   * Color an HTTP method string.
   * @param term - terminal-kit instance
   * @param method - HTTP method
   * @param inverse - apply inverse
   */
  private colorMethod(term: any, method: string, inverse = false): void {
    const m = (method || "").toUpperCase();
    const fn =
      m === "GET"
        ? term.green
        : m === "POST"
          ? term.cyan
          : m === "PUT"
            ? term.yellow
            : m === "DELETE"
              ? term.red
              : m === "PATCH"
                ? term.magenta
                : term;
    if (inverse) fn.inverse(m.padEnd(7));
    else fn(m.padEnd(7));
  }

  /**
   * Render the operations table or detail view.
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

    if (this.detailMode) {
      this.renderDetail(term, startRow, endRow, width);
      return;
    }

    // Header
    term.moveTo(1, startRow);
    term.eraseLine();
    term.bold("  Method  ID" + " ".repeat(Math.max(1, 32 - 2)) + "URL");

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
      const rest = typeof op.rest === "object" ? op.rest : null;

      if (isSelected) term.inverse("  ");
      else term("  ");

      // HTTP method
      if (rest?.method) {
        this.colorMethod(term, rest.method, isSelected);
      } else {
        if (isSelected) term.inverse("       ");
        else term("       ");
      }

      const id = (op.id || "unknown").substring(0, 30);
      const url = (rest?.url || "").substring(0, width - 45);

      if (isSelected) {
        term.inverse(`  ${id.padEnd(30)}  `);
        term.dim.inverse(url.padEnd(Math.max(0, width - 43)));
      } else {
        term(`  ${id.padEnd(30)}  `);
        term.dim(url);
      }
    }
  }

  /**
   * Render detail view for the selected operation.
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  private renderDetail(term: any, startRow: number, endRow: number, width: number): void {
    const op = this.operations[this.cursor];
    if (!op) return;

    const lines: string[] = [];
    const add = function addLine(text: string) {
      lines.push(text);
    };

    add(`  Operation: ${op.id}`);
    if (op.summary) add(`  ${op.summary}`);
    add("");

    // REST
    const rest = typeof op.rest === "object" ? op.rest : null;
    if (rest?.method) {
      add(`  REST: ${rest.method.toUpperCase()} ${rest.url || rest.path || "/"}`);
    }

    // Input/Output
    add(`  Input:  ${op.input || "void"}`);
    add(`  Output: ${op.output || "void"}`);
    add("");

    // Implementor
    if (op.implementor) {
      const impl = op.implementor;
      add(`  ${impl.type === "model" ? "Model" : "Service"}: ${impl.name}${impl.method ? "." + impl.method + "()" : ""}`);
      add("");

      // Code
      if (impl.code) {
        add("  Code:");
        const codeLines = impl.code.split("\n");
        for (const line of codeLines) {
          add(`    ${line}`);
        }
        add("");
      }
    }

    // Tags
    if (op.tags?.length > 0) {
      add(`  Tags: ${op.tags.join(", ")}`);
      add("");
    }

    add("  Press ESC to go back  |  UP/DOWN to scroll");

    // Render with scroll
    const visible = endRow - startRow;
    this.detailScroll = Math.min(this.detailScroll, Math.max(0, lines.length - visible));

    for (let i = 0; i < visible; i++) {
      const lineIdx = this.detailScroll + i;
      const row = startRow + i;
      term.moveTo(1, row);
      term.eraseLine();
      if (lineIdx < lines.length) {
        const text = lines[lineIdx].substring(0, width);
        // Highlight keywords
        if (text.startsWith("  Operation:") || text.startsWith("  Code:") || text.startsWith("  REST:")) {
          term.bold(text);
        } else if (text.startsWith("    ")) {
          // Code lines
          term.dim(text);
        } else {
          term(text);
        }
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
