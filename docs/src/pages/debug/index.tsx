import React from "react";
import Layout from "@theme/Layout";
import { DebugDashboard } from "@webda/debug-ui";
import "@webda/debug-ui/styles.css";

/**
 * The hosted debug dashboard: `webda debug --web` opens
 * `https://webda.io/debug/?port=<port>#token=<token>`.
 *
 * The connection provider lives in the swizzled Root so the navbar indicator
 * shares it; this page only renders the dashboard.
 *
 * @returns the page
 */
export default function DebugPage(): React.JSX.Element {
  return (
    <Layout
      title="Debug dashboard"
      description="Inspect your running Webda application: models, services, operations, requests, logs and configuration."
      noFooter
    >
      <div className="webda-debug-page">
        <DebugDashboard compact docsUrl="/docs/Debug/DebugDashboard" />
      </div>
    </Layout>
  );
}
