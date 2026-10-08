import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnalyticsProvider, createIframeTracker, type TrackFunction } from "../analytics.js";
import { DebugClientError, exchangeBootstrapCode } from "../client.js";
import { DebugDashboard, WebdaLogo } from "../DebugDashboard.js";
import { DebugConnectionProvider } from "../connection.js";
import { clearStoredToken, readHostedSession, readLocalSession, setStoredToken } from "../session.js";

/** Theme of the page. */
export type Theme = "light" | "dark";

/** localStorage key of the theme on the local page (the hosted page uses Docusaurus's `theme`). */
export const LOCAL_THEME_KEY = "webda.debug.theme";

/**
 * Theme to apply at startup: the stored choice, else the OS preference.
 *
 * @param storageKey - localStorage key of the choice
 * @returns the theme
 */
export function initialTheme(storageKey: string = LOCAL_THEME_KEY): Theme {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // storage may be unavailable
  }
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Apply a theme the way Docusaurus does: `data-theme` on `<html>`.
 *
 * @param theme - the theme
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Light / dark toggle.
 *
 * @param props - storage key of the choice
 * @returns the button element
 */
export function ThemeToggle(props: { storageKey?: string }): React.JSX.Element {
  const storageKey = props.storageKey ?? LOCAL_THEME_KEY;
  const [theme, setTheme] = useState<Theme>(() => initialTheme(storageKey));
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(storageKey)) return;
      } catch {
        // follow the OS when storage is unavailable
      }
      setTheme(e.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [storageKey]);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="wdbg-btn wdbg-btn-ghost wdbg-theme-toggle"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          // storage may be unavailable
        }
        setTheme(next);
      }}
    >
      {theme === "dark" ? "☀" : "☽"}
    </button>
  );
}

/** State of the local bootstrap. */
type LocalSession =
  { status: "exchanging" } | { status: "ready"; token?: string } | { status: "failed"; message: string };

/**
 * Obtain the local session token: from the one-time code in the URL, else from
 * the token remembered for this origin.
 *
 * @param session - what the URL and the storage hold
 * @param baseUrl - the debug server
 * @returns the token, or `undefined` when neither is available
 */
export async function bootstrapLocalSession(
  session: { code?: string; token?: string },
  baseUrl: string
): Promise<{ token?: string; error?: string }> {
  if (session.code) {
    try {
      const { token } = await exchangeBootstrapCode(baseUrl, session.code);
      setStoredToken(token);
      return { token };
    } catch (err) {
      const reason = err instanceof DebugClientError ? err.reason : "unreachable";
      if (reason === "unauthorized" && session.token) return { token: session.token };
      return {
        error:
          reason === "unauthorized"
            ? "This link was already used or has expired: run `webda debug --web --local` again and open the URL it prints."
            : "The debug server did not answer the session exchange."
      };
    }
  }
  return { token: session.token };
}

/**
 * The local application (`--local`): same origin, one-time code exchange, no analytics.
 *
 * @returns the application element
 */
export function StandaloneApp(): React.JSX.Element {
  const [session, setSession] = useState<LocalSession>({ status: "exchanging" });
  useEffect(() => {
    let cancelled = false;
    bootstrapLocalSession(readLocalSession(), location.origin).then(result => {
      if (cancelled) return;
      if (result.error) setSession({ status: "failed", message: result.error });
      else setSession({ status: "ready", token: result.token });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (session.status === "exchanging") {
    return <div className="webda-debug-ui wdbg-boot">Opening the debug session…</div>;
  }
  if (session.status === "failed") {
    return (
      <div className="webda-debug-ui wdbg-boot" role="alert">
        <h2>Cannot open the debug session</h2>
        <p>{session.message}</p>
      </div>
    );
  }
  return (
    <DebugConnectionProvider
      mode="local"
      baseUrl={location.origin}
      token={session.token}
      onUnauthorized={clearStoredToken}
    >
      <DebugDashboard headerExtra={<ThemeToggle />} />
    </DebugConnectionProvider>
  );
}

/**
 * Mount the local dashboard.
 *
 * @param element - the container (defaults to `#app`)
 */
export function mountStandalone(element?: HTMLElement | null): void {
  applyTheme(initialTheme());
  const container = element ?? document.getElementById("app");
  if (!container) throw new Error("No container to mount the debug dashboard");
  createRoot(container).render(
    <React.StrictMode>
      <StandaloneApp />
    </React.StrictMode>
  );
}

/** Options of {@link HostedApp}. */
export interface HostedAppProps {
  /** GA4 measurement id (`<meta name="webda-ga">`); no iframe without it */
  measurementId?: string;
  /** Path of the analytics iframe page */
  analyticsPage?: string;
  /** Link back to the documentation */
  docsHome?: string;
  /** Link of the "Debug dashboard & telemetry" page */
  docsUrl?: string;
}

/**
 * Consent choice made on the docs site (same origin, localStorage `webda.consent`).
 *
 * @returns `granted` or `denied`
 */
function docsConsent(): "granted" | "denied" {
  try {
    return localStorage.getItem("webda.consent") === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/**
 * The hosted application (`https://webda.io/debug/`): token in memory only,
 * analytics relayed to a sandboxed iframe, nothing else runs on the page.
 *
 * @param props - measurement id and links
 * @returns the application element
 */
export function HostedApp(props: HostedAppProps): React.JSX.Element {
  const [session] = useState(() => readHostedSession());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const analyticsEnabled = !!props.measurementId && session.telemetry;
  const track = useMemo<TrackFunction | null>(
    () => (analyticsEnabled ? createIframeTracker(() => iframeRef.current?.contentWindow) : null),
    [analyticsEnabled]
  );
  const iframeSrc = analyticsEnabled
    ? `${props.analyticsPage ?? "./analytics.html"}?id=${encodeURIComponent(props.measurementId!)}&consent=${docsConsent()}`
    : undefined;
  return (
    <AnalyticsProvider value={track}>
      <DebugConnectionProvider mode="hosted" port={session.port} token={session.token}>
        <div className="wdbg-hosted-bar">
          <a href={props.docsHome ?? "/"} className="wdbg-hosted-brand">
            <WebdaLogo /> Webda.io
          </a>
          <a href={props.docsHome ?? "/"} className="wdbg-hosted-link">
            Back to the documentation
          </a>
          <ThemeToggle storageKey="theme" />
        </div>
        <DebugDashboard compact docsUrl={props.docsUrl ?? "/docs/Debug/DebugDashboard"} />
        {iframeSrc && (
          <iframe
            ref={iframeRef}
            title="Usage analytics"
            src={iframeSrc}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            style={{ display: "none", width: 0, height: 0, border: 0 }}
            aria-hidden="true"
          />
        )}
      </DebugConnectionProvider>
    </AnalyticsProvider>
  );
}

/**
 * Mount the hosted dashboard.
 *
 * @param element - the container (defaults to `#app`)
 */
export function mountHosted(element?: HTMLElement | null): void {
  applyTheme(initialTheme("theme"));
  const container = element ?? document.getElementById("app");
  if (!container) throw new Error("No container to mount the debug dashboard");
  const meta = document.querySelector('meta[name="webda-ga"]');
  const measurementId = meta?.getAttribute("content") || undefined;
  createRoot(container).render(
    <React.StrictMode>
      <HostedApp measurementId={/^G-[A-Z0-9]+$/.test(measurementId ?? "") ? measurementId : undefined} />
    </React.StrictMode>
  );
}
