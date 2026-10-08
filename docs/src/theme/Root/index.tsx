/**
 * Swizzled Root component — wraps the Docusaurus app with:
 *   - the AnalyticsProvider feeding the dashboard's usage events to gtag
 *     (only when a measurement id is configured and the session did not opt out);
 *   - the DebugConnectionProvider shared by the `/debug/` page and the
 *     "My Application" navbar item, enabled only when the tab was opened by
 *     `webda debug --web` (a token is known) or on the dashboard route, so
 *     plain visitors never trigger a local-network request;
 *   - the consent banner.
 *
 * Docusaurus treats theme/Root/index.tsx as a "safe" swizzle (wrap mode).
 */

import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import {
  AnalyticsProvider,
  DebugConnectionProvider,
  hasDebugSession,
  readSession,
  type TrackFunction
} from "@webda/debug-ui";
import { ConsentBanner } from "@site/src/components/ConsentBanner";

interface RootProps {
  children: React.ReactNode;
}

interface Session {
  enabled: boolean;
  port?: number;
  token?: string;
  telemetry: boolean;
}

/**
 * Call gtag when it is loaded on the page.
 *
 * @param event - event name
 * @param params - allowlisted parameters (already sanitized by the dashboard)
 */
const sendToGtag: TrackFunction = (event, params) => {
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  w.gtag?.("event", event, params ?? {});
};

/**
 * Root of the site.
 *
 * @param props - the page
 * @returns the wrapped page
 */
export default function Root({ children }: RootProps): React.JSX.Element {
  const { pathname } = useLocation();
  const { siteConfig } = useDocusaurusContext();
  const measurementId = (siteConfig.customFields?.gaMeasurementId as string | undefined) || undefined;
  const [session, setSession] = useState<Session>({ enabled: false, telemetry: true });

  useEffect(() => {
    // Browser only: reads ?port= and #token=, persists them and strips the fragment
    const found = readSession();
    setSession({
      enabled: hasDebugSession() || pathname.startsWith("/debug"),
      port: found.port,
      token: found.token,
      telemetry: found.telemetry
    });
  }, [pathname]);

  const track = useMemo(
    () => (measurementId && session.telemetry ? sendToGtag : null),
    [measurementId, session.telemetry]
  );

  return (
    <AnalyticsProvider value={track}>
      <DebugConnectionProvider mode="hosted" port={session.port} token={session.token} enabled={session.enabled}>
        {children}
        {measurementId && session.telemetry && <ConsentBanner />}
      </DebugConnectionProvider>
    </AnalyticsProvider>
  );
}
