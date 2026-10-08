/**
 * Hosted-mode session: where the dashboard finds the port and the token.
 *
 * `webda debug --web` opens `https://webda.io/debug/?port=<port>#token=<token>[&telemetry=0]`.
 * The port is remembered in localStorage (it is not secret and survives
 * reloads); the token and the telemetry opt-out live in sessionStorage (per
 * tab, gone when the tab closes) and the fragment is removed from the URL as
 * soon as it has been read, so it never reaches history or analytics.
 */

/** localStorage key of the debug port. */
export const PORT_KEY = "webda.debug.port";
/** sessionStorage key of the session token. */
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
  if (fragment.get("telemetry") === "0") result.telemetry = false;
  return result;
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
 * Read the dashboard URL, persist what it carries and strip the fragment.
 *
 * Safe to call several times: the head script of the docs site runs the same
 * logic before analytics load, this call then finds the values in storage.
 *
 * @returns the resolved port, token and telemetry choice
 */
export function readSession(): Required<Pick<DashboardLocation, "port" | "telemetry">> & { token?: string } {
  if (typeof window === "undefined") {
    return { port: DEFAULT_PORT, telemetry: true };
  }
  const found = parseDashboardLocation(window.location.search, window.location.hash);
  const session = storage("session");
  try {
    if (found.port) setStoredPort(found.port);
    if (found.token) session?.setItem(TOKEN_KEY, found.token);
    if (found.telemetry === false) session?.setItem(TELEMETRY_KEY, "0");
    if (window.location.hash && (found.token || found.telemetry === false)) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  } catch {
    // storage may be unavailable: the in-memory values are still returned
  }
  return {
    port: found.port ?? getStoredPort(),
    token: found.token ?? getStoredToken(),
    telemetry: found.telemetry ?? isTelemetryEnabled()
  };
}

/**
 * Whether this tab was opened by `webda debug --web` (a token is known).
 *
 * The docs site only probes localhost when this is true, so plain visitors
 * never trigger a local-network request from a public page.
 *
 * @returns `true` when a token is stored or present in the URL
 */
export function hasDebugSession(): boolean {
  if (typeof window === "undefined") return false;
  return !!(getStoredToken() || parseDashboardLocation("", window.location.hash).token);
}
