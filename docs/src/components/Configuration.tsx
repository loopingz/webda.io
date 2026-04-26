"use strict";

/**
 * Configuration page — the "/configuration/*" route.
 *
 * This component is the shell for the debug inspection panels. It is mounted
 * by the "webda-configuration" Docusaurus plugin (src/plugins/configuration.js)
 * at path /configuration/** as a single-page app.
 *
 * Docusaurus already provides a Router context (via @docusaurus/core), so we
 * do NOT use BrowserRouter here — that would break SSR / static generation.
 * Instead we use useLocation from @docusaurus/router which is SSR-safe.
 *
 * The DebugConnectionProvider is already mounted high up in the tree by the
 * swizzled Root component (src/theme/Root/index.tsx), so the panels can call
 * useDebugConnection() without an additional provider here.
 */

import React from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { useLocation } from "@docusaurus/router";
import Layout from "@theme/Layout";
import DocSidebar from "@theme/DocSidebar";
import MDXContent from "@theme/MDXContent";
import WelcomeMD from "./Welcome.mdx";
import { ModelsPanel } from "../debug/panels/ModelsPanel";
import { ServicesPanel } from "../debug/panels/ServicesPanel";
import { OperationsPanel } from "../debug/panels/OperationsPanel";
import { RequestsPanel } from "../debug/panels/RequestsPanel";
import { LogsPanel } from "../debug/panels/LogsPanel";

// ---------------------------------------------------------------------------
// Sidebar definition
// ---------------------------------------------------------------------------

const SIDEBAR = [
  {
    label: "Welcome",
    type: "link" as const,
    href: "/configuration/welcome"
  },
  {
    label: "Models",
    type: "category" as const,
    href: "/configuration/models/hierarchy",
    collapsed: false,
    collapsible: false,
    items: [
      { label: "Hierarchy", href: "/configuration/models/hierarchy", type: "link" as const },
      { label: "Relations", href: "/configuration/models/relations", type: "link" as const }
    ]
  },
  {
    label: "Services",
    type: "link" as const,
    href: "/configuration/services"
  },
  {
    label: "Operations",
    type: "link" as const,
    href: "/configuration/operations"
  },
  {
    label: "Requests",
    type: "link" as const,
    href: "/configuration/requests"
  },
  {
    label: "Logs",
    type: "link" as const,
    href: "/configuration/logs"
  }
];

// ---------------------------------------------------------------------------
// Panel router — picks the right panel from the current URL path
// ---------------------------------------------------------------------------

/**
 * Selects which panel to render based on the current pathname.
 * This avoids BrowserRouter (incompatible with Docusaurus SSR) by reading
 * the location from the already-present Docusaurus router context.
 */
function PanelRouter() {
  const { pathname } = useLocation();

  if (pathname.startsWith("/configuration/models")) {
    return <ModelsPanel />;
  }
  if (pathname.startsWith("/configuration/services")) {
    return <ServicesPanel />;
  }
  if (pathname.startsWith("/configuration/operations")) {
    return <OperationsPanel />;
  }
  if (pathname.startsWith("/configuration/requests")) {
    return <RequestsPanel />;
  }
  if (pathname.startsWith("/configuration/logs")) {
    return <LogsPanel />;
  }

  // Welcome / default (handles /configuration and /configuration/welcome).
  // Welcome.mdx already renders <WelcomeStatus />, so we just render the MDX
  // here and don't add a second one.
  return (
    <MDXContent>
      <WelcomeMD />
    </MDXContent>
  );
}

// ---------------------------------------------------------------------------
// Full layout (sidebar + panel area)
// ---------------------------------------------------------------------------

function ConfigurationLayout() {
  const { pathname } = useLocation();

  return (
    <div className="configurationMenu" style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <DocSidebar
        onCollapse={() => {}}
        isHidden={false}
        path={pathname}
        sidebar={SIDEBAR}
      />
      <div style={{ flex: 1, overflow: "auto", padding: "1rem 1.5rem" }}>
        <PanelRouter />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disconnected welcome — rendered before a daemon is chosen
// ---------------------------------------------------------------------------

function NoApp() {
  const onClick = () => {
    alert("Not implemented");
  };
  // Welcome.mdx already renders <WelcomeStatus /> internally — don't double-render.
  return (
    <div style={{ padding: 30 }}>
      <MDXContent>
        <WelcomeMD onClick={onClick} />
      </MDXContent>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------

export default function Configuration() {
  useDocusaurusContext(); // ensures context is loaded (no-op at runtime but keeps the hook)
  const { pathname } = useLocation();
  const isConfigurationPath = pathname.startsWith("/configuration");

  return (
    <Layout noFooter>
      {isConfigurationPath ? <ConfigurationLayout /> : <NoApp />}
    </Layout>
  );
}
