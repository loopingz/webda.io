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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { terminal: term } = termkit;
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname, "..", "..", "webui", "webda.png");

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
  private appInfo: any = null;
  private logoDrawn = false;
  private logoHeight = 0;

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

    // Try to draw logo image (works in iTerm2, Kitty, etc.)
    await this.tryDrawLogo();

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
    refreshPromises.push(this.client.getAppInfo().then(info => { this.appInfo = info; }));
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

    const headerStart = this.logoHeight + 1;

    // Header bar
    this.renderHeader(width, headerStart);

    // Content area
    const contentStart = headerStart + 2;
    const panel = this.panels[this.activeTab];
    for (let row = contentStart; row < height; row++) {
      term.moveTo(1, row);
      term.eraseLine();
    }
    panel.render(term, contentStart, height - 1, width);

    // Status bar (last row)
    this.renderStatusBar(width, height);
  }

  /**
   * Try to draw the logo image in the terminal.
   * Works in iTerm2, Kitty, and other image-capable terminals.
   * Falls back silently if not supported.
   */
  private async tryDrawLogo(): Promise<void> {
    try {
      const { existsSync } = await import("node:fs");
      if (!existsSync(LOGO_PATH)) return;
      await new Promise<void>((resolve, reject) => {
        term.drawImage(LOGO_PATH, { shrink: { width: 20, height: 6 } }, (err: any) => {
          if (err) {
            reject(err);
            return;
          }
          this.logoDrawn = true;
          this.logoHeight = 6;
          resolve();
        });
      });
    } catch {
      // Terminal doesn't support images — keep text-only header
      this.logoDrawn = false;
      this.logoHeight = 0;
    }
  }

  /**
   * Render the header/tab bar.
   * @param width - terminal width in columns
   * @param row - starting row number
   */
  private renderHeader(width: number, row: number = 1): void {
    term.moveTo(1, row);
    term.eraseLine();
    term.white("web");
    term.yellow("da");
    term.white(" debug");

    if (this.appInfo) {
      const name = this.appInfo.package?.name || "";
      const cwd = (this.appInfo.workingDirectory || "").replace(/^\/(Users|home)\/[^/]+\//, "~/");
      term.dim(` | ${name} ${cwd}`);
    }

    term("  ");

    for (let i = 0; i < this.panels.length; i++) {
      const label = ` ${i + 1}:${this.panels[i].name} `;
      if (i === this.activeTab) {
        term.bgCyan.black.bold(label);
      } else {
        term.dim(label);
      }
    }

    // Separator line
    term.moveTo(1, row + 1);
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
