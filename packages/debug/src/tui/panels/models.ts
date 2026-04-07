import { ScrollablePanel } from "./panel.js";
import { DebugClient } from "../client.js";

/**
 * Models panel: displays registered models in a scrollable list.
 * Press Enter to toggle detail view showing schema, relations, and actions.
 */
export class ModelsPanel extends ScrollablePanel {
  name = "Models";
  private models: any[] = [];
  private detailMode = false;
  /** Number of visible rows in the viewport (updated on render) */
  private visibleRows = 0;

  /**
   * @param client - Debug API client
   */
  constructor(private client: DebugClient) {
    super();
  }

  /**
   * Fetch models from the debug server.
   */
  async refresh(): Promise<void> {
    try {
      this.models = await this.client.getModels();
      this.itemCount = this.models.length;
      this.cursor = Math.min(this.cursor, Math.max(0, this.itemCount - 1));
    } catch {
      this.models = [];
      this.itemCount = 0;
    }
  }

  /**
   * Handle keyboard input.
   * @param key - key name from terminal-kit
   */
  onKey(key: string): void {
    if (this.detailMode) {
      if (key === "ESCAPE" || key === "BACKSPACE" || key === "ENTER") {
        this.detailMode = false;
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
        if (this.models.length > 0) {
          this.detailMode = true;
        }
        break;
    }
  }

  /**
   * Render the models list or detail view.
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  render(term: any, startRow: number, endRow: number, width: number): void {
    this.visibleRows = endRow - startRow;

    if (this.models.length === 0) {
      term.moveTo(1, startRow);
      term.eraseLine();
      term("  No models found. Is the debug server running?");
      return;
    }

    if (this.detailMode) {
      this.renderDetail(term, startRow, endRow, width);
      return;
    }

    // Column header
    term.moveTo(1, startRow);
    term.eraseLine();
    term.bold("  ID" + " ".repeat(Math.max(1, 40 - 4)) + "Plural" + " ".repeat(Math.max(1, 20 - 6)) + "Actions");

    const dataStart = startRow + 1;
    const visible = endRow - dataStart;

    for (let i = 0; i < visible; i++) {
      const idx = this.scrollOffset + i;
      const row = dataStart + i;
      term.moveTo(1, row);
      term.eraseLine();

      if (idx >= this.models.length) continue;
      const model = this.models[idx];
      const isSelected = idx === this.cursor;

      const id = (model.id || "unknown").substring(0, 38);
      const plural = (model.plural || "").substring(0, 18);
      const actions = (model.actions || []).join(", ").substring(0, width - 65);

      const line = `  ${id.padEnd(38)}  ${plural.padEnd(18)}  ${actions}`;

      if (isSelected) {
        term.inverse(line.padEnd(width));
      } else {
        term(line);
      }
    }
  }

  /**
   * Render detail view for the selected model.
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  private renderDetail(term: any, startRow: number, endRow: number, width: number): void {
    const model = this.models[this.cursor];
    if (!model) return;

    let row = startRow;
    const print = function printLine(text: string) {
      if (row >= endRow) return;
      term.moveTo(1, row);
      term.eraseLine();
      term(text);
      row++;
    };

    term.moveTo(1, row);
    term.eraseLine();
    term.bold(`  Model: ${model.id}`);
    row++;

    print(`  Plural: ${model.plural || "N/A"}`);
    print("");

    if (model.actions && model.actions.length > 0) {
      term.moveTo(1, row);
      term.eraseLine();
      term.bold("  Actions:");
      row++;
      for (const action of model.actions) {
        print(`    - ${action}`);
      }
      print("");
    }

    if (model.relations && Object.keys(model.relations).length > 0) {
      term.moveTo(1, row);
      term.eraseLine();
      term.bold("  Relations:");
      row++;
      const json = JSON.stringify(model.relations, null, 2);
      for (const line of json.split("\n")) {
        print(`    ${line}`);
      }
      print("");
    }

    print("  Press ENTER or ESC to go back");

    // Clear remaining rows
    while (row < endRow) {
      term.moveTo(1, row);
      term.eraseLine();
      row++;
    }
  }

  /**
   * Clean up panel resources.
   */
  destroy(): void {
    this.models = [];
  }
}
