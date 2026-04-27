"use strict";

/**
 * Custom navbar item for the "My Application" entry.
 *
 * Renders a standard Docusaurus navbar link to /configuration/welcome.
 * When the debug daemon is connected the link shows a small green dot and
 * is fully opaque. When no daemon is reachable the link fades to 50%
 * opacity — it remains clickable so users can still navigate to the page.
 */

import React from "react";
import Link from "@docusaurus/Link";
import { useDebugConnection } from "./useDebugConnection";

/** Props that Docusaurus passes to all custom navbar items. */
export interface AppNavbarItemProps {
  /** The item's position on the navbar ("left" | "right"). Unused but declared to match the API. */
  position?: "left" | "right";
  /** Any additional class name forwarded by Docusaurus. */
  className?: string;
}

/**
 * Renders the "My Application" navbar link.
 *
 * Opacity reflects the live daemon connection state:
 * - Connected → opacity 1 + a small green indicator dot
 * - Disconnected → opacity 0.5 (still fully clickable)
 */
export function AppNavbarItem({ className }: AppNavbarItemProps): JSX.Element {
  const { connected } = useDebugConnection();

  return (
    <Link
      to="/configuration/welcome"
      className={`navbar__item navbar__link${className ? ` ${className}` : ""}`}
      style={{
        opacity: connected ? 1 : 0.5,
        transition: "opacity 200ms ease",
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }}
      title={
        connected
          ? "My Application — daemon connected"
          : "My Application — no daemon connected (link still works)"
      }
    >
      My Application
      {connected && (
        <span
          aria-label="connected"
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
