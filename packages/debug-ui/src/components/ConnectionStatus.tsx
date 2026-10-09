import React from "react";
import { useDebugConnection } from "../connection.js";

/** Props of {@link ConnectionStatus}. */
export interface ConnectionStatusProps {
  /** Show the label next to the dot */
  withLabel?: boolean;
  className?: string;
}

/**
 * Short description of the connection for tooltips and labels.
 *
 * @param state - the connection state
 * @returns `{ label, tone }`
 */
export function describeConnection(state: ReturnType<typeof useDebugConnection>): {
  label: string;
  tone: "ok" | "warn" | "off" | "idle";
} {
  if (state.status === "connected") {
    const name = state.info?.package?.name || state.info?.name;
    return state.wsConnected
      ? { label: name ? `Connected to ${name}` : "Connected", tone: "ok" }
      : { label: "Connected, live updates reconnecting…", tone: "warn" };
  }
  if (state.status === "connecting") return { label: "Connecting…", tone: "warn" };
  if (state.status === "error") {
    if (state.failure === "unauthorized")
      return { label: "Debug server found, token missing or expired", tone: "warn" };
    if (state.failure === "version") return { label: "Debug server too old", tone: "warn" };
    return { label: "No debug server detected", tone: "off" };
  }
  return { label: "Not connected", tone: "idle" };
}

/**
 * Connection indicator: a coloured dot and, optionally, a label.
 *
 * Used in the dashboard header and in the docs navbar.
 *
 * @param props - label and class
 * @returns the indicator element
 */
export function ConnectionStatus(props: ConnectionStatusProps): React.JSX.Element {
  const state = useDebugConnection();
  const { label, tone } = describeConnection(state);
  return (
    <span className={`wdbg-conn wdbg-conn-${tone} ${props.className ?? ""}`} title={label} aria-live="polite">
      <span className="wdbg-conn-dot" aria-hidden="true" />
      {props.withLabel && <span className="wdbg-conn-label">{label}</span>}
    </span>
  );
}
