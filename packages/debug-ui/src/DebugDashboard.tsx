import React, { useEffect, useState } from "react";
import { useTrack } from "./analytics.js";
import { ConnectionError } from "./components/ConnectionError.js";
import { ConnectionStatus } from "./components/ConnectionStatus.js";
import { useDebugConnection } from "./connection.js";
import { ConfigPanel } from "./panels/ConfigPanel.js";
import { LogsPanel } from "./panels/LogsPanel.js";
import { ModelsPanel } from "./panels/ModelsPanel.js";
import { OperationsPanel } from "./panels/OperationsPanel.js";
import { RequestsPanel } from "./panels/RequestsPanel.js";
import { ServicesPanel } from "./panels/ServicesPanel.js";
import { SUPPORTED_DEBUG_API_VERSION } from "./version.js";

/** Identifier of a panel. */
export type PanelId = "logs" | "models" | "services" | "operations" | "requests" | "config";

/** Tabs of the dashboard, in order. */
export const PANELS: { id: PanelId; label: string; color: string }[] = [
  { id: "logs", label: "Logs", color: "var(--wdbg-orange)" },
  { id: "models", label: "Models", color: "var(--wdbg-green)" },
  { id: "services", label: "Services", color: "var(--wdbg-blue)" },
  { id: "operations", label: "Operations", color: "var(--wdbg-neutral)" },
  { id: "requests", label: "Requests", color: "var(--wdbg-blue)" },
  { id: "config", label: "Config", color: "var(--wdbg-purple)" }
];

/** Documentation page of the dashboard (hosted vs local, data collected, opt-out). */
export const DOCS_URL = "https://webda.io/docs/Debug/DebugDashboard";

/** Props of {@link DebugDashboard}. */
export interface DebugDashboardProps {
  /** Panel shown first */
  initialPanel?: PanelId;
  /** Link of the footer; defaults to {@link DOCS_URL} */
  docsUrl?: string;
  /** Extra header content (e.g. a theme toggle) */
  headerExtra?: React.ReactNode;
  /** Hide the header logo (when the hosting page already shows one) */
  compact?: boolean;
}

/**
 * Shorten a working directory for the header (`/Users/me/app` → `~/app`).
 *
 * @param cwd - the directory
 * @returns the shortened path
 */
export function shortenCwd(cwd: string | undefined): string {
  return (cwd || "").replace(/^\/(Users|home)\/[^/]+\//, "~/");
}

/**
 * The debug dashboard: header with application info and connection state,
 * the panel tabs (left/right arrows switch them), the active panel and the footer.
 *
 * Needs a {@link DebugConnectionProvider} above it.
 *
 * @param props - initial panel, docs link, header extras
 * @returns the dashboard element
 */
export function DebugDashboard(props: DebugDashboardProps): React.JSX.Element {
  const state = useDebugConnection();
  const track = useTrack();
  const [panel, setPanel] = useState<PanelId>(props.initialPanel ?? "logs");
  const panels = PANELS.filter(p => p.id !== "config" || state.features.config);
  const connected = state.status === "connected";

  useEffect(() => {
    if (connected) track("panel_open", { panel });
  }, [panel, connected, track]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      setPanel(prev => {
        const idx = panels.findIndex(p => p.id === prev);
        const next = e.key === "ArrowLeft" ? (idx - 1 + panels.length) % panels.length : (idx + 1) % panels.length;
        return panels[next].id;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panels]);

  const active = panels.find(p => p.id === panel) ?? panels[0];
  const appName = state.info?.package?.name || state.info?.name;
  const versionNotice =
    state.version && state.version.state === "newer"
      ? `This dashboard supports debug API v${SUPPORTED_DEBUG_API_VERSION} but the server speaks v${state.version.server}: some panels may misbehave. Update the dashboard.`
      : null;

  return (
    <div className={`webda-debug-ui ${connected && state.wsConnected ? "" : "wdbg-disconnected"}`}>
      <header className="wdbg-header">
        {!props.compact && (
          <div className="wdbg-brand">
            <WebdaLogo />
            <div className="wdbg-brand-title">
              web<span>da</span> debug
            </div>
          </div>
        )}
        {state.info && (
          <div className="wdbg-app-info">
            <div className="wdbg-app-name">{appName || "unknown"}</div>
            <div className="wdbg-app-cwd wdbg-mono" title={String(state.info.workingDirectory || "")}>
              {shortenCwd(state.info.workingDirectory as string)}
            </div>
          </div>
        )}
        <nav className="wdbg-tabs" role="tablist" aria-label="Debug panels">
          {panels.map(p => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active.id === p.id}
              className={`wdbg-tab ${active.id === p.id ? "wdbg-tab-active" : ""}`}
              style={active.id === p.id ? { color: p.color, borderBottomColor: p.color } : undefined}
              onClick={() => setPanel(p.id)}
            >
              {p.label}
            </button>
          ))}
        </nav>
        <ConnectionStatus withLabel className="wdbg-header-status" />
        {props.headerExtra}
      </header>
      {versionNotice && (
        <div className="wdbg-alert wdbg-alert-warning" role="alert">
          {versionNotice}
        </div>
      )}
      <main className="wdbg-content">{connected ? <Panel id={active.id} /> : <ConnectionError />}</main>
      <footer className="wdbg-footer">
        <a href={props.docsUrl ?? DOCS_URL} target="_blank" rel="noreferrer">
          Debug dashboard &amp; telemetry
        </a>
        {state.info?.debugVersion && <span className="wdbg-muted">@webda/debug {String(state.info.debugVersion)}</span>}
        {state.info?.frameworkVersion && (
          <span className="wdbg-muted">@webda/core {String(state.info.frameworkVersion)}</span>
        )}
      </footer>
    </div>
  );
}

/**
 * The active panel.
 *
 * @param props - the panel id
 * @returns the panel element
 */
function Panel(props: { id: PanelId }): React.JSX.Element | null {
  switch (props.id) {
    case "models":
      return <ModelsPanel />;
    case "services":
      return <ServicesPanel />;
    case "operations":
      return <OperationsPanel />;
    case "requests":
      return <RequestsPanel />;
    case "config":
      return <ConfigPanel />;
    case "logs":
      return <LogsPanel />;
    default:
      return null;
  }
}

/**
 * The Webda jigsaw logo, inline so the local page loads nothing external.
 *
 * @returns the SVG element
 */
export function WebdaLogo(): React.JSX.Element {
  return (
    <svg className="wdbg-logo" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <path
        d="M191.08,189.7c1.53-11.46,11.31-14.06,19.26-5.96,4.28,4.28,7.8,9.94,18.34,9.94,11.77,0,26.75-11.92,26.75-32.25s-14.98-32.25-26.75-32.25c-10.55,0-14.06,5.66-18.34,9.94-8.1,8.1-17.88,5.5-19.26-5.96h0c-.15-.92-.15-1.99-.15-3.21v-65.43h-65.58c-3.52,0-6.27-.61-8.41-1.68-6.73-3.36-7.34-11.16-.61-17.73,4.28-4.28,9.94-7.8,9.94-18.34C126.26,15.13,114.34.15,94.16,0c-20.18.15-32.1,14.98-32.1,26.75,0,10.55,5.66,14.06,9.94,18.34,8.87,8.71,5.04,19.57-9.17,19.57H0v173.81c0,8.44,6.84,15.29,15.29,15.29h175.64v-60.84c0-1.07,0-2.14.15-3.21Z"
        fill="currentColor"
      />
    </svg>
  );
}
