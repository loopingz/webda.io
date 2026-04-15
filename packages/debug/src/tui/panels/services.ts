import { ScrollablePanel } from "./panel.js";
import { DebugClient } from "../client.js";

/**
 * Services panel: displays all registered services in a table with
 * color-coded state indicators. Press Enter for detail view with
 * configuration, capabilities, schema, and metrics.
 */
export class ServicesPanel extends ScrollablePanel {
  name = "Services";
  private services: any[] = [];
  private config: any = {};
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
   * Fetch services and config from the debug server.
   */
  async refresh(): Promise<void> {
    try {
      const [services, config] = await Promise.all([this.client.getServices(), this.client.getConfig()]);
      this.services = services;
      this.config = config || {};
      this.itemCount = this.services.length;
      this.cursor = Math.min(this.cursor, Math.max(0, this.itemCount - 1));
    } catch {
      this.services = [];
      this.config = {};
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
        if (this.services.length > 0) {
          this.detailMode = true;
          this.detailScroll = 0;
        }
        break;
    }
  }

  /**
   * Render the services table or detail view.
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  render(term: any, startRow: number, endRow: number, width: number): void {
    this.visibleRows = endRow - startRow - 1;

    if (this.services.length === 0) {
      term.moveTo(1, startRow);
      term.eraseLine();
      term("  No services found. Is the debug server running?");
      return;
    }

    if (this.detailMode) {
      this.renderDetail(term, startRow, endRow, width);
      return;
    }

    // Global Parameters header
    const params = this.config?.parameters || {};
    const paramKeys = Object.keys(params);

    let row = startRow;

    if (paramKeys.length > 0) {
      term.moveTo(1, row);
      term.eraseLine();
      term.bold.cyan("  Global Parameters");
      row++;
      for (const key of paramKeys.slice(0, 3)) {
        if (row >= endRow) break;
        term.moveTo(1, row);
        term.eraseLine();
        const val = typeof params[key] === "object" ? JSON.stringify(params[key]) : String(params[key]);
        term.dim(`    ${key}`);
        term.dim(" = ");
        term(`${val.substring(0, width - key.length - 10)}`);
        row++;
      }
      if (paramKeys.length > 3) {
        term.moveTo(1, row);
        term.eraseLine();
        term.dim(`    ... and ${paramKeys.length - 3} more`);
        row++;
      }
      term.moveTo(1, row);
      term.eraseLine();
      row++;
    }

    // Header
    term.moveTo(1, row);
    term.eraseLine();
    term.bold("  Name" + " ".repeat(Math.max(1, 30 - 4)) + "Type" + " ".repeat(Math.max(1, 30 - 4)) + "State");
    row++;

    const visible = endRow - row;

    for (let i = 0; i < visible; i++) {
      const idx = this.scrollOffset + i;
      const r = row + i;
      term.moveTo(1, r);
      term.eraseLine();

      if (idx >= this.services.length) continue;
      const svc = this.services[idx];
      const isSelected = idx === this.cursor;

      const name = (svc.name || "unknown").substring(0, 28);
      const type = (svc.type || "unknown").substring(0, 28);
      const state = svc.state || "unknown";

      const prefix = `  ${name.padEnd(28)}  ${type.padEnd(28)}  `;

      if (isSelected) {
        term.inverse(prefix);
      } else {
        term(prefix);
      }

      const sl = state.toLowerCase();
      if (sl === "running" || sl === "resolved") {
        if (isSelected) term.inverse.green(state);
        else term.green(state);
      } else if (sl === "stopped" || sl === "error" || sl === "failed") {
        if (isSelected) term.inverse.red(state);
        else term.red(state);
      } else {
        if (isSelected) term.inverse.yellow(state);
        else term.yellow(state);
      }

      if (isSelected) {
        const remaining = width - prefix.length - state.length;
        if (remaining > 0) term.inverse(" ".repeat(remaining));
      }
    }
  }

  /**
   * Render detail view for the selected service.
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  private renderDetail(term: any, startRow: number, endRow: number, width: number): void {
    const svc = this.services[this.cursor];
    if (!svc) return;

    const lines: { render: (t: any, w: number) => void }[] = [];

    const addText = function addTextLine(text: string, style?: string) {
      lines.push({
        render: function renderText(t: any, w: number) {
          if (style === "bold") t.bold(text.substring(0, w));
          else if (style === "dim") t.dim(text.substring(0, w));
          else if (style === "cyan") t.cyan(text.substring(0, w));
          else t(text.substring(0, w));
        }
      });
    };
    const addEmpty = function addEmptyLine() {
      lines.push({ render: function renderEmpty() {} });
    };

    addText(`  Service: ${svc.name}`, "bold");
    addText(`  Type: ${svc.type}  |  State: ${svc.state}`);
    addEmpty();

    // Capabilities
    const caps = Object.keys(svc.capabilities || {});
    if (caps.length > 0) {
      addText("  Capabilities:", "bold");
      addText(`    ${caps.join(", ")}`);
      addEmpty();
    }

    // Configuration
    const config = svc.configuration || {};
    const configKeys = Object.keys(config).filter(k => !k.startsWith("_"));
    if (configKeys.length > 0) {
      addText("  Configuration:", "bold");
      for (const key of configKeys) {
        const val = typeof config[key] === "object" ? JSON.stringify(config[key]) : String(config[key]);
        addText(`    ${key}: ${val}`);
      }
      addEmpty();
    }

    // Schema properties
    const schema = svc.schema;
    if (schema?.properties) {
      addText("  Schema Properties:", "bold");
      for (const [name, prop] of Object.entries(schema.properties) as [string, any][]) {
        const desc = prop.description ? ` - ${prop.description.substring(0, 60)}` : "";
        const def = prop.default !== undefined ? ` [default: ${JSON.stringify(prop.default)}]` : "";
        addText(`    ${name} (${prop.type || "ref"})${desc}${def}`);
      }
      addEmpty();
    }

    // Metrics
    if (svc.metrics?.length > 0) {
      addText("  Metrics:", "bold");
      for (const m of svc.metrics) {
        const val = m.values?.length ? m.values.reduce((a: number, v: any) => a + (v.value || 0), 0) : 0;
        addText(`    ${m.name} [${m.type}] = ${val}${m.help ? "  " + m.help : ""}`);
      }
      addEmpty();
    }

    addText("  Press ESC to go back", "dim");

    // Render with scroll
    const visible = endRow - startRow;
    this.detailScroll = Math.min(this.detailScroll, Math.max(0, lines.length - visible));

    for (let i = 0; i < visible; i++) {
      const lineIdx = this.detailScroll + i;
      const row = startRow + i;
      term.moveTo(1, row);
      term.eraseLine();
      if (lineIdx < lines.length) {
        lines[lineIdx].render(term, width);
      }
    }
  }

  /**
   * Clean up panel resources.
   */
  destroy(): void {
    this.services = [];
    this.config = {};
  }
}
