/**
 * Swizzled Root component — wraps the Docusaurus app with:
 *   - a token-less DebugConnectionProvider for the "My Application" navbar
 *     item, enabled only when this browser has used the dashboard before
 *     (a port is remembered), so plain visitors never trigger a local-network
 *     request from a public page. It can only tell whether a debug server
 *     answers (401 = found, open the dashboard): the session token never
 *     exists on documentation pages, which run the site's analytics;
 *   - the Consent Mode v2 banner of the documentation pages.
 *
 * The dashboard itself lives at /debug/, a static page outside Docusaurus.
 * Docusaurus treats theme/Root/index.tsx as a "safe" swizzle (wrap mode).
 */

import React, { useEffect, useState } from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { DebugConnectionProvider, getStoredPort, hasUsedDashboard } from "@webda/debug-ui";
import { ConsentBanner } from "@site/src/components/ConsentBanner";

interface RootProps {
  children: React.ReactNode;
}

/**
 * Root of the site.
 *
 * @param props - the page
 * @returns the wrapped page
 */
export default function Root({ children }: RootProps): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const measurementId = (siteConfig.customFields?.gaMeasurementId as string | undefined) || undefined;
  const [probe, setProbe] = useState<{ enabled: boolean; port?: number }>({ enabled: false });

  useEffect(() => {
    // Browser only
    setProbe({ enabled: hasUsedDashboard(), port: getStoredPort() });
  }, []);

  return (
    <DebugConnectionProvider mode="hosted" port={probe.port} enabled={probe.enabled} probeIntervalMs={15000}>
      {children}
      {measurementId && <ConsentBanner />}
    </DebugConnectionProvider>
  );
}
