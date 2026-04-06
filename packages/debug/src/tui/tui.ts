import termkit from "terminal-kit";
import { DebugClient } from "./client.js";
import { ModelsPanel } from "./panels/models.js";
import { ServicesPanel } from "./panels/services.js";
import { OperationsPanel } from "./panels/operations.js";
import { RoutesPanel } from "./panels/routes.js";
import { ConfigPanel } from "./panels/config.js";
import { RequestsPanel } from "./panels/requests.js";
import { LogsPanel } from "./panels/logs.js";
import type { Panel } from "./panels/panel.js";

const { terminal: term } = termkit;

/**
 * Terminal UI dashboard for the Webda debug server.
 *
 * Provides a tab-based interface with seven panels (Logs, Models, Services,
 * Operations, Routes, Config, Requests) and live WebSocket updates.
 * Connect to an already-running debug server started with `webda debug`.
 */
export class DebugTui {
  private client: DebugClient;
  private panels: Panel[] = [];
  private logsPanel: LogsPanel;
  private activeTab = 0;
  private running = false;
  private renderTimer?: ReturnType<typeof setInterval>;
  private lastRefresh = "";
  private wsUnsubscribe?: () => void;

  /**
   * Create a new TUI instance.
   *
   * @param port - Port of the debug server to connect to
   */
  constructor(port: number = 18181) {
    this.client = new DebugClient(`http://localhost:${port}`);
    this.logsPanel = new LogsPanel(this.client);
    this.panels = [
      this.logsPanel,
      new ModelsPanel(this.client),
      new ServicesPanel(this.client),
      new OperationsPanel(this.client),
      new RoutesPanel(this.client),
      new ConfigPanel(this.client),
      new RequestsPanel(this.client)
    ];
  }

  /**
   * Start the TUI: initialize terminal, load data, and begin rendering.
   */
  async start(): Promise<void> {
    this.running = true;

    // Set up terminal
    term.fullscreen(true);
    term.hideCursor();
    term.grabInput(true);

    // Handle input
    term.on("key", (key: string) => this.handleKey(key));

    // Connect WebSocket for live events
    this.client.connectWebSocket();

    // Listen for WebSocket events: restart triggers refetch, log events go to LogsPanel
    this.wsUnsubscribe = this.client.onEvent(event => {
      if (event.type === "restart") {
        this.refreshAll();
      } else if (event.type === "log") {
        this.logsPanel.onWsEvent(event);
      }
    });

    // Initial data load
    await this.refreshAll();

    // Periodic render (for live updates like requests panel)
    this.renderTimer = setInterval(() => {
      if (this.running) this.render();
    }, 500);

    // Initial render
    this.render();
  }

  /**
   * Refresh data for all panels.
   */
  private async refreshAll(): Promise<void> {
    const now = new Date();
    this.lastRefresh =
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0") +
      ":" +
      String(now.getSeconds()).padStart(2, "0");

    const refreshPromises = this.panels.map(p => (p.refresh ? p.refresh() : Promise.resolve()));
    await Promise.allSettled(refreshPromises);

    if (this.running) this.render();
  }

  /**
   * Handle keyboard input.
   * @param key - key name from terminal-kit
   */
  private handleKey(key: string): void {
    // Quit
    if (key === "q" || key === "CTRL_C") {
      this.stop();
      return;
    }

    // Tab switching with number keys
    const tabKeys = ["1", "2", "3", "4", "5", "6", "7"];
    const tabIdx = tabKeys.indexOf(key);
    if (tabIdx >= 0 && tabIdx < this.panels.length) {
      this.activeTab = tabIdx;
      this.render();
      return;
    }

    // Tab switching with left/right arrows (shift+arrow or tab/shift+tab)
    if (key === "TAB" || key === "RIGHT") {
      this.activeTab = (this.activeTab + 1) % this.panels.length;
      this.render();
      return;
    }
    if (key === "SHIFT_TAB" || key === "LEFT") {
      this.activeTab = (this.activeTab - 1 + this.panels.length) % this.panels.length;
      this.render();
      return;
    }

    // Refresh
    if (key === "r" || key === "R") {
      this.refreshAll();
      return;
    }

    // Forward to active panel
    const panel = this.panels[this.activeTab];
    if (panel.onKey) {
      panel.onKey(key);
      this.render();
    }
  }

  /**
   * Full render: header, panel content, status bar.
   */
  private render(): void {
    if (!this.running) return;

    const width = term.width;
    const height = term.height;

    // Header bar (row 1)
    this.renderHeader(width);

    // Content area (row 3 to height - 1)
    const panel = this.panels[this.activeTab];
    // Clear content area
    for (let row = 3; row < height; row++) {
      term.moveTo(1, row);
      term.eraseLine();
    }
    panel.render(term, 3, height - 1, width);

    // Status bar (last row)
    this.renderStatusBar(width, height);
  }

  /**
   * Render the header/tab bar.
   * @param width - terminal width in columns
   */
  private renderHeader(width: number): void {
    term.moveTo(1, 1);
    term.eraseLine();
    term.bgWhite.black(" Webda Debug Dashboard ");
    term("  ");

    for (let i = 0; i < this.panels.length; i++) {
      const label = ` ${i + 1}:${this.panels[i].name} `;
      if (i === this.activeTab) {
        term.bgCyan.black.bold(label);
      } else {
        term.dim(label);
      }
    }

    // Fill rest of line
    const curX = term.getCursorLocation ? 0 : 0;
    term(" ".repeat(Math.max(0, 2)));

    // Separator line
    term.moveTo(1, 2);
    term.eraseLine();
    term.dim("-".repeat(width));
  }

  /**
   * Render the status bar at the bottom.
   * @param width - terminal width in columns
   * @param height - terminal height in rows
   */
  private renderStatusBar(width: number, height: number): void {
    term.moveTo(1, height);
    term.eraseLine();

    // Connection status
    if (this.client.connected) {
      term.bgGreen.black(" CONNECTED ");
    } else {
      term.bgRed.white(" DISCONNECTED ");
    }

    term("  ");
    term.dim(`Last refresh: ${this.lastRefresh || "never"}`);

    // Right-aligned help
    const help = " q:Quit  r:Refresh  1-7:Tabs  Arrows:Navigate ";
    const pos = Math.max(1, width - help.length);
    term.moveTo(pos, height);
    term.dim(help);
  }

  /**
   * Stop the TUI and clean up.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = undefined;
    }

    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = undefined;
    }

    // Destroy all panels
    for (const panel of this.panels) {
      panel.destroy();
    }

    // Disconnect from server
    this.client.disconnect();

    // Restore terminal
    term.hideCursor(false);
    term.grabInput(false);
    term.fullscreen(false);
    term.clear();

    term.processExit(0);
  }
}
