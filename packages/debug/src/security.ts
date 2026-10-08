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

/** Origins allowed to call the debug API from a browser: the docs site and its dev server. */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "https://webda.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

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
 * Exactly `https://webda.io` (the docs site hosting the dashboard) and the docs
 * dev server on `localhost:3000` / `127.0.0.1:3000`. No wildcard.
 *
 * @param origin - The value of the HTTP `Origin` request header.
 * @returns `true` if the origin is allowed, `false` otherwise.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  return !!origin && ALLOWED_ORIGINS.has(origin);
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
}

/**
 * Build the URL `webda debug --web` opens.
 *
 * - hosted: `https://webda.io/debug/?port=<port>#token=<token>[&telemetry=0]` —
 *   the token travels in the fragment, which browsers never send to the server
 *   and which the docs page strips before analytics can see it;
 * - local: `http://localhost:<port>/` — the token is injected into the page by
 *   the debug server itself, so the URL carries none.
 *
 * @param options - port, token and mode
 * @returns the URL to open
 */
export function buildDebugUrl(options: DebugUrlOptions): string {
  if (options.local) {
    return `http://localhost:${options.port}/`;
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
 * Inject the session token into the served `index.html`.
 *
 * The token is exposed as `window.__WEBDA_DEBUG__` for the bundled dashboard.
 * `<`, `>` and `&` are escaped as unicode sequences so the payload can never
 * close the script tag.
 *
 * @param html - the page source
 * @param token - the session token
 * @returns the page with the inline script inserted before `</head>`
 */
export function injectToken(html: string, token: string): string {
  const payload = JSON.stringify({ token, debugApiVersion: DEBUG_API_VERSION })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const script = `<script>window.__WEBDA_DEBUG__=${payload};</script>`;
  const index = html.indexOf("</head>");
  if (index === -1) return script + html;
  return html.substring(0, index) + script + html.substring(index);
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
