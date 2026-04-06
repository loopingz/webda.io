import { ScrollablePanel } from "./panel.js";
import { DebugClient } from "../client.js";

/**
 * Routes panel: displays all registered routes with path, HTTP methods
 * (color-coded), and executor service name.
 */
export class RoutesPanel extends ScrollablePanel {
  name = "Routes";
  private routes: any[] = [];
  private visibleRows = 0;

  /**
   * @param client - Debug API client
   */
  constructor(private client: DebugClient) {
    super();
  }

  /**
   * Fetch routes from the debug server.
   */
  async refresh(): Promise<void> {
    try {
      this.routes = await this.client.getRoutes();
      this.itemCount = this.routes.length;
      this.cursor = Math.min(this.cursor, Math.max(0, this.itemCount - 1));
    } catch {
      this.routes = [];
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
   * Render the routes table.
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  render(term: any, startRow: number, endRow: number, width: number): void {
    this.visibleRows = endRow - startRow - 1;

    if (this.routes.length === 0) {
      term.moveTo(1, startRow);
      term.eraseLine();
      term("  No routes found. Is the debug server running?");
      return;
    }

    // Header
    term.moveTo(1, startRow);
    term.eraseLine();
    term.bold("  Path" + " ".repeat(Math.max(1, 40 - 4)) + "Methods" + " ".repeat(Math.max(1, 25 - 7)) + "Executor");

    const dataStart = startRow + 1;
    const visible = endRow - dataStart;

    for (let i = 0; i < visible; i++) {
      const idx = this.scrollOffset + i;
      const row = dataStart + i;
      term.moveTo(1, row);
      term.eraseLine();

      if (idx >= this.routes.length) continue;
      const route = this.routes[idx];
      const isSelected = idx === this.cursor;

      const path = (route.path || "unknown").substring(0, 38);
      const methods: string[] = route.methods || [];
      const executor = (route.executor || "unknown").substring(0, width - 70);

      const pathCol = `  ${path.padEnd(38)}  `;

      if (isSelected) {
        term.inverse(pathCol);
      } else {
        term(pathCol);
      }

      // Color-code HTTP methods
      for (let m = 0; m < methods.length; m++) {
        if (m > 0) {
          if (isSelected) term.inverse(",");
          else term(",");
        }
        const method = methods[m];
        const colorFn = this.getMethodColor(term, method, isSelected);
        colorFn(method);
      }

      // Pad methods column and add executor
      const methodsStr = methods.join(",");
      const remaining = 23 - methodsStr.length;
      const pad = remaining > 0 ? " ".repeat(remaining) : " ";

      if (isSelected) {
        term.inverse(pad + executor);
        const totalLen = pathCol.length + methodsStr.length + pad.length + executor.length;
        const endPad = width - totalLen;
        if (endPad > 0) term.inverse(" ".repeat(endPad));
      } else {
        term(pad + executor);
      }
    }
  }

  /**
   * Get a color function for an HTTP method.
   * @param term - terminal-kit instance
   * @param method - HTTP method string
   * @param inverse - whether to apply inverse styling
   * @returns bound color function
   */
  private getMethodColor(term: any, method: string, inverse: boolean): any {
    const m = method.toUpperCase();
    if (inverse) {
      if (m === "GET") return term.inverse.green.bind(term);
      if (m === "POST") return term.inverse.cyan.bind(term);
      if (m === "PUT") return term.inverse.yellow.bind(term);
      if (m === "DELETE") return term.inverse.red.bind(term);
      if (m === "PATCH") return term.inverse.magenta.bind(term);
      return term.inverse.bind(term);
    }
    if (m === "GET") return term.green.bind(term);
    if (m === "POST") return term.cyan.bind(term);
    if (m === "PUT") return term.yellow.bind(term);
    if (m === "DELETE") return term.red.bind(term);
    if (m === "PATCH") return term.magenta.bind(term);
    return term.bind(term);
  }

  /**
   * Clean up panel resources.
   */
  destroy(): void {
    this.routes = [];
  }
}
