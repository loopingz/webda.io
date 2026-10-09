import React, { useState } from "react";
import { useDebugConnection, type ConnectionFailure } from "../connection.js";
import { parsePort } from "../session.js";
import { LAST_UNSUPPORTED_DEBUG_VERSION } from "../version.js";

/** Copy shown for each failure reason. */
export interface FailureMessage {
  title: string;
  lines: string[];
}

/**
 * Message describing a connection failure and what to do about it.
 *
 * @param failure - the failure reason
 * @param baseUrl - where the dashboard tried to connect
 * @param mode - hosted or local
 * @returns title and lines
 */
export function failureMessage(
  failure: ConnectionFailure | null,
  baseUrl: string,
  mode: "hosted" | "local"
): FailureMessage {
  const local = "Or run `webda debug --web --local` to open the dashboard from the debug server itself.";
  switch (failure) {
    case "mixed_content":
      return {
        title: "Your browser blocked the connection to localhost",
        lines: [
          `This page is served over https and the debug server at ${baseUrl} speaks plain http. Some browsers (notably Safari) refuse that.`,
          "Use Chrome or Firefox, which allow localhost from secure pages.",
          local
        ]
      };
    case "unauthorized":
      return {
        title: "The debug server refused the session token",
        lines: [
          "The server was restarted since this page was opened, or the page was reached without the link printed by the command.",
          "Run `webda debug --web` again and open the URL it prints: it carries a fresh token.",
          local
        ]
      };
    case "version":
      return {
        title: "Update @webda/debug",
        lines: [
          `The running debug server is older than this dashboard supports (any @webda/debug newer than ${LAST_UNSUPPORTED_DEBUG_VERSION} works).`,
          "Update it with `pnpm add -D @webda/debug@latest` (or npm / yarn), then run `webda debug --web` again."
        ]
      };
    case "unreachable":
    default:
      return {
        title: mode === "local" ? "The debug server is not responding" : `No debug server at ${baseUrl}`,
        lines:
          mode === "local"
            ? ["Waiting for the server to come back. If it was stopped, run `webda debug --web --local` again."]
            : [
                "Make sure `webda debug --web` is running in your application directory and that the port matches.",
                "Chrome may ask for permission to reach your local network: allow it.",
                "A server older than @webda/debug " +
                  LAST_UNSUPPORTED_DEBUG_VERSION +
                  " refuses this page: update it, or " +
                  local.charAt(0).toLowerCase() +
                  local.slice(1)
              ]
      };
  }
}

/**
 * Inline port picker (hosted mode).
 *
 * @param props - the current port and the change handler
 * @returns the form element
 */
export function PortPicker(props: { port: number; onChange: (port: number) => void }): React.JSX.Element {
  const [value, setValue] = useState(String(props.port));
  const parsed = parsePort(value);
  return (
    <form
      className="wdbg-port-picker"
      onSubmit={e => {
        e.preventDefault();
        if (parsed) props.onChange(parsed);
      }}
    >
      <label htmlFor="wdbg-port">Debug port</label>
      <input
        id="wdbg-port"
        type="number"
        min={1}
        max={65535}
        value={value}
        onChange={e => setValue(e.target.value)}
        className="wdbg-search wdbg-mono"
      />
      <button type="submit" className="wdbg-btn wdbg-btn-primary" disabled={!parsed || parsed === props.port}>
        Use port
      </button>
    </form>
  );
}

/**
 * Full-panel explanation of why the dashboard is not connected, with the
 * retry button and, when hosted, the port picker.
 *
 * @returns the error element
 */
export function ConnectionError(): React.JSX.Element {
  const state = useDebugConnection();
  const message = failureMessage(state.failure, state.baseUrl, state.mode);
  const connecting = state.status === "connecting" || state.status === "idle";
  return (
    <div className="wdbg-connection-error" role="status">
      <h2>{connecting ? "Connecting to your application…" : message.title}</h2>
      {connecting ? (
        <p className="wdbg-muted">Looking for `webda debug --web` at {state.baseUrl || "the debug server"}.</p>
      ) : (
        message.lines.map((line, i) => (
          <p key={i} className={i === 0 ? "" : "wdbg-muted"}>
            {renderInlineCode(line)}
          </p>
        ))
      )}
      <div className="wdbg-actions">
        <button type="button" className="wdbg-btn wdbg-btn-primary" onClick={state.retry}>
          Retry now
        </button>
      </div>
      {state.mode === "hosted" && state.failure !== "version" && (
        <PortPicker port={state.port} onChange={state.setPort} />
      )}
    </div>
  );
}

/**
 * Render `code` spans for the backtick segments of a line.
 *
 * @param line - the text
 * @returns text and code nodes
 */
function renderInlineCode(line: string): React.ReactNode[] {
  return line
    .split("`")
    .map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : <React.Fragment key={i}>{part}</React.Fragment>));
}
