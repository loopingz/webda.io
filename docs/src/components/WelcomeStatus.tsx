"use strict";

/**
 * WelcomeStatus — connection-aware content for the /configuration/welcome page.
 *
 * Renders different content depending on whether the debug daemon is reachable:
 * - Disconnected: instructions to run `webda debug --web`
 * - Connected: confirmation + quick links to the inspection panels
 *
 * This component is deliberately separate from Welcome.mdx so that the static
 * MDX can render a header while the dynamic connection state is shown below it.
 */

import React from "react";
import Link from "@docusaurus/Link";
import { useDebugConnection } from "../debug/useDebugConnection";

/** Props that can be forwarded from the MDX file. */
export interface WelcomeStatusProps {
  /** Optional callback for the "try sample application" link. */
  onTrySample?: () => void;
}

/**
 * Shows a connection-state-aware block on the welcome page.
 *
 * When no daemon is detected the user is shown how to start the daemon and a
 * "try sample application" link if an `onTrySample` handler is provided.
 *
 * When a daemon is connected the user is directed to the inspection panels.
 */
export function WelcomeStatus({ onTrySample }: WelcomeStatusProps) {
  const { connected, info } = useDebugConnection();

  if (!connected) {
    return (
      <div
        style={{
          marginTop: "1.5rem",
          padding: "1.25rem 1.5rem",
          borderRadius: 6,
          border: "1px solid var(--ifm-color-emphasis-300)",
          background: "var(--ifm-background-surface-color)"
        }}
      >
        <h2 style={{ marginTop: 0 }}>No application detected</h2>
        <p>
          You can visualize information from your Webda application by running the
          following command in its directory:
        </p>
        <pre>
          <code>webda debug --web</code>
        </pre>
        <p>
          Then return here — the page will automatically update once a connection
          is established.
        </p>
        {onTrySample && (
          <p>
            Alternatively you can{" "}
            <a href="#" onClick={e => { e.preventDefault(); onTrySample(); }}>
              try the sample application
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  const appName = (info?.name as string) ?? (info as any)?.package?.name ?? "your application";

  return (
    <div
      style={{
        marginTop: "1.5rem",
        padding: "1.25rem 1.5rem",
        borderRadius: 6,
        border: "1px solid #16a34a",
        background: "var(--ifm-background-surface-color)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.75rem" }}>
        <span
          aria-label="connected"
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: "#22c55e",
            flexShrink: 0
          }}
        />
        <h2 style={{ margin: 0 }}>Connected to {appName}</h2>
      </div>
      <p style={{ marginBottom: "1rem" }}>
        Use the sidebar to inspect your running application in real time.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link to="/configuration/models/hierarchy" className="button button--primary button--sm">
          Models
        </Link>
        <Link to="/configuration/services" className="button button--secondary button--sm">
          Services
        </Link>
        <Link to="/configuration/operations" className="button button--secondary button--sm">
          Operations
        </Link>
        <Link to="/configuration/requests" className="button button--secondary button--sm">
          Requests
        </Link>
        <Link to="/configuration/logs" className="button button--secondary button--sm">
          Logs
        </Link>
      </div>
    </div>
  );
}
