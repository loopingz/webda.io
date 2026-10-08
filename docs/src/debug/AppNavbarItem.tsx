/**
 * Custom navbar item for the "My Application" entry.
 *
 * A standard Docusaurus navbar link to the debug dashboard (/debug/) carrying
 * the shared connection indicator: a green dot when `webda debug --web` is
 * connected, amber while connecting or when the token was refused, and a
 * faded link when no application is detected. The link always works.
 */

import React from "react";
import Link from "@docusaurus/Link";
import { ConnectionStatus, describeConnection, useDebugConnection } from "@webda/debug-ui";

/** Props that Docusaurus passes to all custom navbar items. */
export interface AppNavbarItemProps {
  /** The item's position on the navbar ("left" | "right"). Unused but declared to match the API. */
  position?: "left" | "right";
  /** Any additional class name forwarded by Docusaurus. */
  className?: string;
  /** Mobile sidebar rendering flag forwarded by Docusaurus. */
  mobile?: boolean;
}

/**
 * Renders the "My Application" navbar link with the connection indicator.
 *
 * @param props - navbar item props
 * @returns the link element
 */
export function AppNavbarItem({ className }: AppNavbarItemProps): React.JSX.Element {
  const state = useDebugConnection();
  const { label } = describeConnection(state);
  const connected = state.status === "connected";
  return (
    <Link
      to="/debug/"
      className={`navbar__item navbar__link${className ? ` ${className}` : ""}`}
      style={{
        opacity: connected || state.status === "connecting" ? 1 : 0.6,
        transition: "opacity 200ms ease",
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }}
      title={`My Application — ${label}`}
    >
      My Application
      {state.status !== "idle" && <ConnectionStatus />}
    </Link>
  );
}
