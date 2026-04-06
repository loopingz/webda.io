import { ScrollablePanel } from "./panel.js";
import { DebugClient } from "../client.js";

/**
 * Services panel: displays all registered services in a table with
 * color-coded state indicators.
 */
export class ServicesPanel extends ScrollablePanel {
  name = "Services";
  private services: any[] = [];
  private visibleRows = 0;

  /**
   * @param client - Debug API client
   */
  constructor(private client: DebugClient) {
    super();
  }

  /**
   * Fetch services from the debug server.
   */
  async refresh(): Promise<void> {
    try {
      this.services = await this.client.getServices();
      this.itemCount = this.services.length;
      this.cursor = Math.min(this.cursor, Math.max(0, this.itemCount - 1));
    } catch {
      this.services = [];
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
   * Render the services table.
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

    // Header
    term.moveTo(1, startRow);
    term.eraseLine();
    term.bold("  Name" + " ".repeat(Math.max(1, 30 - 4)) + "Type" + " ".repeat(Math.max(1, 30 - 4)) + "State");

    const dataStart = startRow + 1;
    const visible = endRow - dataStart;

    for (let i = 0; i < visible; i++) {
      const idx = this.scrollOffset + i;
      const row = dataStart + i;
      term.moveTo(1, row);
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

      // Color-code the state
      if (state === "Running" || state === "running" || state === "Resolved") {
        if (isSelected) term.inverse.green(state);
        else term.green(state);
      } else if (state === "Stopped" || state === "stopped" || state === "error") {
        if (isSelected) term.inverse.red(state);
        else term.red(state);
      } else {
        if (isSelected) term.inverse.yellow(state);
        else term.yellow(state);
      }

      // Pad the rest of the line for inverse highlight
      if (isSelected) {
        const remaining = width - prefix.length - state.length;
        if (remaining > 0) term.inverse(" ".repeat(remaining));
      }
    }
  }

  /**
   * Clean up panel resources.
   */
  destroy(): void {
    this.services = [];
  }
}
