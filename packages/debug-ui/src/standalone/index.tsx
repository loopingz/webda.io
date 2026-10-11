import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnalyticsProvider, createIframeTracker, type TrackFunction } from "../analytics.js";
import { DebugClientError, exchangeBootstrapCode } from "../client.js";
import { DebugDashboard } from "../DebugDashboard.js";
import { DebugConnectionProvider } from "../connection.js";
import { clearStoredToken, readHostedSession, readLocalSession, setStoredToken } from "../session.js";

/** Theme of the page. */
export type Theme = "light" | "dark";

/** localStorage key of the theme on the local page (the hosted page uses Docusaurus's `theme`). */
export const LOCAL_THEME_KEY = "webda.debug.theme";

/** Docusaurus's light mode icon (theme-classic Icon/LightMode) */
const LIGHT_ICON =
  "M12,9c1.65,0,3,1.35,3,3s-1.35,3-3,3s-3-1.35-3-3S10.35,9,12,9 M12,7c-2.76,0-5,2.24-5,5s2.24,5,5,5s5-2.24,5-5 S14.76,7,12,7L12,7z M2,13l2,0c0.55,0,1-0.45,1-1s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S1.45,13,2,13z M20,13l2,0c0.55,0,1-0.45,1-1 s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S19.45,13,20,13z M11,2v2c0,0.55,0.45,1,1,1s1-0.45,1-1V2c0-0.55-0.45-1-1-1S11,1.45,11,2z M11,20v2c0,0.55,0.45,1,1,1s1-0.45,1-1v-2c0-0.55-0.45-1-1-1C11.45,19,11,19.45,11,20z M5.99,4.58c-0.39-0.39-1.03-0.39-1.41,0 c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0s0.39-1.03,0-1.41L5.99,4.58z M18.36,16.95 c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0c0.39-0.39,0.39-1.03,0-1.41 L18.36,16.95z M19.42,5.99c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41 s1.03,0.39,1.41,0L19.42,5.99z M7.05,18.36c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06 c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L7.05,18.36z";
/** Docusaurus's dark mode icon (theme-classic Icon/DarkMode) */
const DARK_ICON =
  "M9.37,5.51C9.19,6.15,9.1,6.82,9.1,7.5c0,4.08,3.32,7.4,7.4,7.4c0.68,0,1.35-0.09,1.99-0.27C17.45,17.19,14.93,19,12,19 c-3.86,0-7-3.14-7-7C5,9.07,6.81,6.55,9.37,5.51z M12,3c-4.97,0-9,4.03-9,9s4.03,9,9,9s9-4.03,9-9c0-0.46-0.04-0.92-0.1-1.36 c-0.98,1.37-2.58,2.26-4.4,2.26c-2.98,0-5.4-2.42-5.4-5.4c0-1.81,0.89-3.42,2.26-4.4C12.92,3.04,12.46,3,12,3L12,3z";
/** GitHub mark */
const GITHUB_ICON =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";

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
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d={theme === "dark" ? DARK_ICON : LIGHT_ICON} />
      </svg>
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

/** Links of the docs navbar, mirrored from docs/docusaurus.config.ts */
const DOCS_NAV_LEFT = [
  { label: "Quick Start", href: "/docs/QuickStart" },
  { label: "Concepts", href: "/docs/Concepts" },
  { label: "Typedoc", href: "/typedoc/core/" }
];
const DOCS_NAV_RIGHT = [
  { label: "My Application", href: "/debug/", current: true },
  { label: "Contribute", href: "/contribute/Contribute" }
];

/**
 * Top bar of the hosted page, styled like the docs site navbar so that
 * /debug/ reads as a page of the site. No search box: the page runs no
 * third-party script.
 *
 * @param props - link of the docs home
 * @returns the navbar element
 */
export function HostedNavbar(props: { docsHome?: string }): React.JSX.Element {
  const link = (item: { label: string; href: string; current?: boolean }) => (
    <a
      key={item.href}
      href={item.href}
      className={`wdbg-navbar-link${item.current ? " wdbg-navbar-link-active" : ""}`}
      aria-current={item.current ? "page" : undefined}
    >
      {item.label}
    </a>
  );
  return (
    <nav className="wdbg-navbar" aria-label="Documentation">
      <a href={props.docsHome ?? "/"} className="wdbg-navbar-brand">
        <img src="/img/webda.svg" alt="" width="32" height="32" />
        <b>Webda.io</b>
      </a>
      <div className="wdbg-navbar-items">{DOCS_NAV_LEFT.map(link)}</div>
      <div className="wdbg-navbar-items wdbg-navbar-items-right">
        {DOCS_NAV_RIGHT.map(link)}
        <a href="https://github.com/loopingz/webda.io" className="wdbg-navbar-github" aria-label="GitHub repository">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d={GITHUB_ICON} />
          </svg>
        </a>
        <ThemeToggle storageKey="theme" />
      </div>
    </nav>
  );
}

/** Options of {@link HostedApp}. */
export interface HostedAppProps {
  /** GA4 measurement id (`<meta name="webda-ga">`, also baked into the relay); no iframe without it */
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
    ? `${props.analyticsPage ?? "./analytics.html"}?consent=${docsConsent()}`
    : undefined;
  return (
    <AnalyticsProvider value={track}>
      <DebugConnectionProvider mode="hosted" port={session.port} token={session.token}>
        <HostedNavbar docsHome={props.docsHome} />
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
