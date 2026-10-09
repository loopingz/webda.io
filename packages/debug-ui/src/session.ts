/**
 * Where the dashboard finds the port, the token and the telemetry choice.
 *
 * - hosted: `webda debug --web` opens `https://webda.io/debug/?port=<port>#token=<token>[&telemetry=0]`.
 *   The port is remembered in localStorage (not secret). The token is kept in
 *   memory only: the docs origin also runs the site's scripts (analytics), and
 *   nothing readable by them may hold it. A reload therefore asks for the
 *   printed URL again, which is also what every server restart requires.
 * - local: `webda debug --web --local` opens `http://127.0.0.1:<port>/#code=<one-time code>`.
 *   The page exchanges the code for the token and keeps it in memory plus
 *   sessionStorage: that storage is scoped to the origin (host and port), where
 *   only the bundled dashboard runs, and it is what makes a reload work after
 *   the single-use code is spent.
 * The fragment is removed from the URL as soon as it has been read.
 */

/** localStorage key of the debug port. */
export const PORT_KEY = "webda.debug.port";
/** sessionStorage key of the session token (local mode only). */
export const TOKEN_KEY = "webda.debug.token";
/** sessionStorage key of the telemetry opt-out ("0" when disabled). */
export const TELEMETRY_KEY = "webda.debug.telemetry";
/** Default port of the debug server. */
export const DEFAULT_PORT = 18181;

/** What the dashboard URL carries. */
export interface DashboardLocation {
  /** `?port=` */
  port?: number;
  /** `#token=` */
  token?: string;
  /** `#code=` (local mode bootstrap code) */
  code?: string;
  /** `false` when the fragment carries `telemetry=0` */
  telemetry?: boolean;
}

/**
 * Validate a port number.
 *
 * @param value - raw value
 * @returns the port, or `undefined` when invalid
 */
export function parsePort(value: string | number | null | undefined): number | undefined {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : undefined;
}

/**
 * Parse the query string and the fragment of the dashboard URL.
 *
 * @param search - `location.search`
 * @param hash - `location.hash`
 * @returns the port, token and telemetry choice found
 */
export function parseDashboardLocation(search: string, hash: string): DashboardLocation {
  const result: DashboardLocation = {};
  const query = new URLSearchParams(search.startsWith("?") ? search.substring(1) : search);
  const port = parsePort(query.get("port"));
  if (port) result.port = port;
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.substring(1) : hash);
  const token = fragment.get("token");
  if (token) result.token = token;
  const code = fragment.get("code");
  if (code) result.code = code;
  if (fragment.get("telemetry") === "0") result.telemetry = false;
  return result;
}

/**
 * Remove the fragment from the current URL without a navigation.
 */
export function stripFragment(): void {
  try {
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  } catch {
    // history may be unavailable
  }
}

/** Minimal storage interface (localStorage / sessionStorage). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Storage accessor that swallows the exceptions private browsing modes throw.
 *
 * @param kind - which storage
 * @returns the storage, or `undefined` when unavailable
 */
function storage(kind: "local" | "session"): StorageLike | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const s = kind === "local" ? window.localStorage : window.sessionStorage;
    return s ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Port of the debug server remembered for this browser.
 *
 * @returns the stored port or the default
 */
export function getStoredPort(): number {
  return parsePort(storage("local")?.getItem(PORT_KEY)) ?? DEFAULT_PORT;
}

/**
 * Remember the debug port.
 *
 * @param port - the port
 */
export function setStoredPort(port: number): void {
  try {
    storage("local")?.setItem(PORT_KEY, String(port));
  } catch {
    // storage may be unavailable
  }
}

/**
 * Session token remembered for this tab.
 *
 * @returns the token or `undefined`
 */
export function getStoredToken(): string | undefined {
  return storage("session")?.getItem(TOKEN_KEY) ?? undefined;
}

/**
 * Whether usage analytics are allowed for this tab.
 *
 * @returns `false` when the session was opened with `telemetry=0`
 */
export function isTelemetryEnabled(): boolean {
  return storage("session")?.getItem(TELEMETRY_KEY) !== "0";
}

/**
 * Read the hosted dashboard URL and strip its fragment.
 *
 * Persists the port (localStorage) and the telemetry opt-out (sessionStorage);
 * the token is only returned, never stored.
 *
 * @returns the resolved port, token and telemetry choice
 */
export function readHostedSession(): { port: number; token?: string; telemetry: boolean } {
  if (typeof window === "undefined") {
    return { port: DEFAULT_PORT, telemetry: true };
  }
  const found = parseDashboardLocation(window.location.search, window.location.hash);
  try {
    if (found.port) setStoredPort(found.port);
    if (found.telemetry === false) storage("session")?.setItem(TELEMETRY_KEY, "0");
  } catch {
    // storage may be unavailable: the in-memory values are still returned
  }
  stripFragment();
  return {
    port: found.port ?? getStoredPort(),
    token: found.token,
    telemetry: found.telemetry ?? isTelemetryEnabled()
  };
}

/**
 * Read the local dashboard URL and strip its fragment.
 *
 * @returns the one-time code, if any, and the token remembered for this origin
 */
export function readLocalSession(): { code?: string; token?: string } {
  if (typeof window === "undefined") return {};
  const found = parseDashboardLocation(window.location.search, window.location.hash);
  stripFragment();
  return { code: found.code, token: getStoredToken() };
}

/**
 * Remember the local session token for this origin (reloads after the code is spent).
 *
 * @param token - the token
 */
export function setStoredToken(token: string): void {
  try {
    storage("session")?.setItem(TOKEN_KEY, token);
  } catch {
    // storage may be unavailable
  }
}

/**
 * Forget the local session token (after a 401, so a reload does not retry a dead one).
 */
export function clearStoredToken(): void {
  try {
    storage("session")?.removeItem(TOKEN_KEY);
  } catch {
    // storage may be unavailable
  }
}

/**
 * Whether this browser has used the hosted dashboard before (a port is remembered).
 *
 * The docs site only probes the debug server (without a token) when this is
 * true, so plain visitors never trigger a local-network request from a public page.
 *
 * @returns `true` when a port is stored
 */
export function hasUsedDashboard(): boolean {
  if (typeof window === "undefined") return false;
  return storage("local")?.getItem(PORT_KEY) !== null && storage("local")?.getItem(PORT_KEY) !== undefined;
}
