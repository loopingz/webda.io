import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { platform } from "node:os";

/**
 * Version of the debug HTTP/WebSocket API served by this package.
 *
 * The hosted dashboard (https://webda.io/debug/) is always the latest build and
 * compares this integer with the version it supports to decide which panels to
 * show and whether to ask for an `@webda/debug` update. Bump it whenever the
 * wire contract changes in a way the UI must know about.
 */
export const DEBUG_API_VERSION = 1;

/** Sub-protocol the dashboard offers on the websocket; the server selects it. */
export const WS_PROTOCOL = "webda-debug.v1";

/** Prefix of the sub-protocol entry carrying the session token. */
export const WS_TOKEN_PREFIX = "webda-token.";

/** Default location of the hosted dashboard. */
export const HOSTED_DASHBOARD_URL = "https://webda.io/debug/";

/** Lifetime of a one-time bootstrap code, in milliseconds. */
export const BOOTSTRAP_CODE_TTL = 10 * 60 * 1000;

/**
 * Content-Security-Policy of the pages the debug server serves.
 *
 * Only same-origin scripts and styles, connections to itself (API + websocket),
 * never framed.
 */
export const LOCAL_PAGE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** The only origin allowed to call the debug API from a browser in production: the docs site. */
export const HOSTED_ORIGIN = "https://webda.io";

/**
 * Origins allowed to call the debug API from a browser.
 *
 * `https://webda.io` always; the origin of `WEBDA_DEBUG_UI_URL` (the docs dev
 * server, e.g. `http://localhost:3000/debug/`) only when that variable is set,
 * so a random local server on port 3000 gets nothing in a normal run.
 *
 * @param env - environment variables
 * @returns the allowed origins
 */
export function allowedOrigins(env: Record<string, string | undefined>): string[] {
  const origins = [HOSTED_ORIGIN];
  if (env.WEBDA_DEBUG_UI_URL) {
    try {
      const origin = new URL(env.WEBDA_DEBUG_UI_URL).origin;
      if (origin && origin !== "null" && !origins.includes(origin)) origins.push(origin);
    } catch {
      // not a URL: ignored
    }
  }
  return origins;
}

/**
 * Generate a per-session token: 32 random bytes (256 bits) as hex.
 *
 * @returns the token
 */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Constant-time string comparison.
 *
 * Both inputs are hashed before `timingSafeEqual` so the comparison neither
 * leaks the length nor the position of the first mismatching byte.
 *
 * @param a - first value
 * @param b - second value
 * @returns `true` when both are defined and equal
 */
export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/**
 * Read the token from an `Authorization: Bearer <token>` header.
 *
 * @param header - the Authorization header value
 * @returns the token, or `undefined` when the header is absent or not a bearer
 */
export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : undefined;
}

/**
 * Read the token offered as a websocket sub-protocol (`webda-token.<token>`).
 *
 * Browsers cannot set headers on a WebSocket, so the dashboard offers the token
 * as a sub-protocol value, which never lands in a URL or an access log.
 *
 * @param header - the `Sec-WebSocket-Protocol` header value
 * @returns the token, or `undefined`
 */
export function extractWsToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const entry of header.split(",")) {
    const value = entry.trim();
    if (value.startsWith(WS_TOKEN_PREFIX)) {
      return value.substring(WS_TOKEN_PREFIX.length) || undefined;
    }
  }
  return undefined;
}

/**
 * DNS-rebinding guard: only loopback hosts on the debug port are accepted.
 *
 * @param host - the `Host` header value
 * @param port - the port the debug server listens on
 * @returns `true` when the host is `localhost`, `127.0.0.1` or `[::1]` on that port
 */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return host === `localhost:${port}` || host === `127.0.0.1:${port}` || host === `[::1]:${port}`;
}

/**
 * Determine whether the given Origin header value is allowed to access the debug API.
 *
 * Exact comparison against {@link allowedOrigins}: `https://webda.io`, plus the
 * dev origin when `WEBDA_DEBUG_UI_URL` is set. No wildcard.
 *
 * @param origin - The value of the HTTP `Origin` request header.
 * @param origins - The allowlist (defaults to the production one).
 * @returns `true` if the origin is allowed, `false` otherwise.
 */
export function isAllowedOrigin(origin: string | undefined, origins: readonly string[] = [HOSTED_ORIGIN]): boolean {
  return !!origin && origins.includes(origin);
}

/**
 * Origins of the debug server itself, for same-origin requests from the `--local` page.
 *
 * @param port - the debug port
 * @returns `http://127.0.0.1:<port>`, `http://[::1]:<port>` and `http://localhost:<port>`
 */
export function debugOrigins(port: number): string[] {
  return [`http://127.0.0.1:${port}`, `http://[::1]:${port}`, `http://localhost:${port}`];
}

/** Inputs of {@link buildDebugUrl}. */
export interface DebugUrlOptions {
  /** Port of the debug server */
  port: number;
  /** Session token */
  token: string;
  /** Serve the bundled dashboard from the debug server instead of the hosted one */
  local?: boolean;
  /** Whether usage analytics are allowed on the hosted dashboard */
  telemetry?: boolean;
  /** Hosted dashboard base URL (defaults to {@link HOSTED_DASHBOARD_URL}) */
  hostedBase?: string;
  /** One-time bootstrap code of the local page (`--local`) */
  code?: string;
}

/**
 * Build the URL `webda debug --web` opens.
 *
 * - hosted: `https://webda.io/debug/?port=<port>#token=<token>[&telemetry=0]` —
 *   the token travels in the fragment, which browsers never send to the server
 *   and which the docs page strips before analytics can see it;
 * - local: `http://127.0.0.1:<port>/#code=<one-time code>` — the page exchanges
 *   the code for the token on `/api/session`; the URL never carries the token.
 *
 * `127.0.0.1` rather than `localhost`: browsers resolve `localhost` to `::1`
 * first, and a squatter on `[::1]:<port>` would otherwise receive the requests.
 *
 * @param options - port, token and mode
 * @returns the URL to open
 */
export function buildDebugUrl(options: DebugUrlOptions): string {
  if (options.local) {
    return `http://127.0.0.1:${options.port}/${options.code ? `#code=${encodeURIComponent(options.code)}` : ""}`;
  }
  let base = options.hostedBase || HOSTED_DASHBOARD_URL;
  if (!base.endsWith("/")) base += "/";
  const fragment = `token=${encodeURIComponent(options.token)}${options.telemetry === false ? "&telemetry=0" : ""}`;
  return `${base}?port=${options.port}#${fragment}`;
}

/**
 * Resolve the telemetry opt-out from the `--no-telemetry` flag and `WEBDA_TELEMETRY`.
 *
 * @param flag - value of the `telemetry` command flag (`false` for `--no-telemetry`)
 * @param env - environment variables
 * @returns `true` when usage analytics may be sent
 */
export function resolveTelemetry(flag: boolean | undefined, env: Record<string, string | undefined>): boolean {
  if (flag === false) return false;
  const value = (env.WEBDA_TELEMETRY || "").trim().toLowerCase();
  return !(value === "0" || value === "false" || value === "off" || value === "no");
}

/**
 * Command used to open a URL in the default browser, as an argument array (no shell).
 *
 * @param url - the URL to open
 * @param os - the platform (`process.platform` by default)
 * @returns the executable and its arguments
 */
export function browserOpenCommand(url: string, os: string = platform()): { command: string; args: string[] } {
  if (os === "darwin") return { command: "open", args: [url] };
  if (os === "win32") {
    // `start` is a cmd.exe builtin; the empty string is the window title and
    // `&` must be escaped or cmd.exe would split the command.
    return { command: "cmd", args: ["/c", "start", "", url.replace(/&/g, "^&")] };
  }
  return { command: "xdg-open", args: [url] };
}

/**
 * Open a URL in the default browser without going through a shell.
 *
 * Failures are ignored: the URL is printed anyway and the user can open it by hand.
 *
 * @param url - the URL to open
 */
export function openInBrowser(url: string): void {
  const { command, args } = browserOpenCommand(url);
  try {
    execFile(command, args, { windowsHide: true }, () => {});
  } catch {
    // Best effort
  }
}
