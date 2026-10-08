/**
 * Custom navbar item for the "My Application" entry.
 *
 * A standard Docusaurus navbar link to the debug dashboard (/debug/). The
 * documentation pages never hold a session token, so the indicator can only
 * report whether a debug server answers on the remembered port: amber when one
 * is found (the dashboard will connect), nothing otherwise. The link always works.
 */

import React from "react";
import Link from "@docusaurus/Link";
import { useDebugConnection } from "@webda/debug-ui";

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
 * Renders the "My Application" navbar link with the server-found indicator.
 *
 * @param props - navbar item props
 * @returns the link element
 */
export function AppNavbarItem({ className }: AppNavbarItemProps): React.JSX.Element {
  const state = useDebugConnection();
  // Without a token the server answers 401: it is running, the dashboard will connect
  const found = state.status === "connected" || (state.status === "error" && state.failure === "unauthorized");
  return (
    <Link
      // The dashboard is a static page outside the Docusaurus app: a full navigation, not a route
      href="pathname:///debug/"
      target="_self"
      className={`navbar__item navbar__link${className ? ` ${className}` : ""}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      title={
        found ? "My Application — a debug server is running, open the dashboard" : "My Application — debug dashboard"
      }
    >
      My Application
      {found && (
        <span
          aria-label="debug server found"
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "#22c55e",
            flexShrink: 0
          }}
        />
      )}
    </Link>
  );
}
