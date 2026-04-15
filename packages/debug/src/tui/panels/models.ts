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

    const lines: { render: (t: any, w: number) => void }[] = [];
    const addText = function addTextLine(text: string, style?: string) {
      lines.push({
        render: function renderText(t: any, w: number) {
          const s = text.substring(0, w);
          if (style === "bold") t.bold(s);
          else if (style === "dim") t.dim(s);
          else if (style === "cyan") t.cyan(s);
          else t(s);
        }
      });
    };
    const addEmpty = function addEmptyLine() {
      lines.push({ render: function renderEmpty() {} });
    };

    addText(`  Model: ${model.id}`, "bold");
    if (model.plural) addText(`  Plural: ${model.plural}`);
    if (model.store) addText(`  Store: ${model.store}${model.storeType ? " (" + model.storeType + ")" : ""}`);
    addEmpty();

    // Inheritance
    const ancestors = model.metadata?.Ancestors || [];
    const subclasses = model.metadata?.Subclasses || [];
    if (ancestors.length > 0 || subclasses.length > 0) {
      addText("  Inheritance:", "bold");
      if (ancestors.length > 0) {
        addText(`    Ancestors: ${[...ancestors].reverse().join(" → ")} → ${model.id.split("/").pop()}`);
      }
      if (subclasses.length > 0) {
        addText(`    Subclasses: ${subclasses.join(", ")}`);
      }
      addEmpty();
    }

    // Relations
    const rel = model.relations || {};
    const relLines: string[] = [];
    if (rel.parent) relLines.push(`    parent    ${rel.parent.attribute.padEnd(20)} → ${rel.parent.model}`);
    (rel.links || []).forEach((l: any) => relLines.push(`    ${(l.type || "link").padEnd(10)} ${l.attribute.padEnd(20)} → ${l.model}`));
    (rel.queries || []).forEach((q: any) => relLines.push(`    query     ${q.attribute.padEnd(20)} → ${q.model}`));
    (rel.maps || []).forEach((m: any) => relLines.push(`    map       ${m.attribute.padEnd(20)} → ${m.model}`));
    (rel.children || []).forEach((c: string) => relLines.push(`    child     ${"".padEnd(20)} → ${c}`));
    (rel.binaries || []).forEach((b: any) => relLines.push(`    binary    ${b.attribute.padEnd(20)}   (${b.cardinality})`));

    if (relLines.length > 0) {
      addText("  Relations:", "bold");
      relLines.forEach(l => addText(l));
      addEmpty();
    }

    // Actions
    if (model.actions?.length > 0) {
      addText("  Actions:", "bold");
      addText(`    ${model.actions.join(", ")}`);
      addEmpty();
    }

    addText("  Press ENTER or ESC to go back", "dim");

    // Render with scroll (reuse detailMode scroll if we had one)
    const visible = endRow - startRow;
    for (let i = 0; i < visible; i++) {
      const row = startRow + i;
      term.moveTo(1, row);
      term.eraseLine();
      if (i < lines.length) {
        lines[i].render(term, width);
      }
    }
  }

  /**
   * Clean up panel resources.
   */
  destroy(): void {
    this.models = [];
  }
}
