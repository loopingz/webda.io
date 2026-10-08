import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DebugDashboard } from "../DebugDashboard.js";
import { DebugConnectionProvider } from "../connection.js";

/** Theme of the standalone page. */
export type Theme = "light" | "dark";

const THEME_KEY = "webda.debug.theme";

/**
 * Theme to apply at startup: the stored choice, else the OS preference.
 *
 * @returns the theme
 */
export function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
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
 * Light / dark toggle for the standalone page.
 *
 * @returns the button element
 */
export function ThemeToggle(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(THEME_KEY)) return;
      } catch {
        // follow the OS when storage is unavailable
      }
      setTheme(e.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="wdbg-btn wdbg-btn-ghost wdbg-theme-toggle"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        try {
          localStorage.setItem(THEME_KEY, next);
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

/** What the debug server injects into the page. */
interface InjectedSession {
  token?: string;
  debugApiVersion?: number;
}

/**
 * Session injected by `DebugService` into `index.html` (`window.__WEBDA_DEBUG__`).
 *
 * @returns the injected values, or an empty object
 */
export function injectedSession(): InjectedSession {
  const w = globalThis as unknown as { __WEBDA_DEBUG__?: InjectedSession };
  return w.__WEBDA_DEBUG__ ?? {};
}

/**
 * The standalone application: same-origin connection, theme toggle, no analytics.
 *
 * @returns the application element
 */
export function StandaloneApp(): React.JSX.Element {
  const session = injectedSession();
  return (
    <DebugConnectionProvider mode="local" baseUrl={location.origin} token={session.token}>
      <DebugDashboard headerExtra={<ThemeToggle />} />
    </DebugConnectionProvider>
  );
}

/**
 * Mount the standalone dashboard.
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
