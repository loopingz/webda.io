import { CookieOptions, SecureCookie, useCrypto, type WebContext } from "@webda/core";

/** Lifetime of a pending request (s) */
export const PENDING_TTL = 600;
/** Maximum size of a cookie, Set-Cookie attributes included (SecureCookie splits beyond it) */
const MAX_COOKIE = 4096;
/** Room kept for the Set-Cookie attributes besides the name and the path (Max-Age, HttpOnly, Secure, SameSite) */
const COOKIE_ATTRIBUTES = 128;

/** Validated authorization request waiting for login and consent, kept in an encrypted cookie */
export interface PendingRequest {
  /** Authorization code or device flow */
  flow: "code" | "device";
  /** client_id */
  clientId: string;
  /** Validated redirect_uri (code flow) */
  redirectUri?: string;
  /** Client state, echoed on the redirect */
  state?: string;
  /** PKCE S256 challenge (code flow) */
  codeChallenge?: string;
  /** Requested scope, normalized */
  scope: string;
  /** Hostname of the device requesting access, shown on the consent page */
  hostname?: string;
  /** Device user code (device flow) */
  userCode?: string;
  /** User the request is bound to: the signed-in user when consent is first shown */
  userId?: string;
  /** CSRF token bound to this request */
  csrf: string;
  /** Expiry (ms since epoch) */
  expires: number;
}

/**
 * @param value - decrypted cookie
 * @returns true when it has the shape of a pending request
 */
function isPendingRequest(value: any): value is PendingRequest {
  const optional = (v: unknown) => v === undefined || typeof v === "string";
  return (
    typeof value === "object" &&
    value !== null &&
    (value.flow === "code" || value.flow === "device") &&
    typeof value.clientId === "string" &&
    value.clientId !== "" &&
    typeof value.scope === "string" &&
    typeof value.csrf === "string" &&
    value.csrf !== "" &&
    typeof value.expires === "number" &&
    optional(value.redirectUri) &&
    optional(value.state) &&
    optional(value.codeChallenge) &&
    optional(value.hostname) &&
    optional(value.userCode) &&
    optional(value.userId) &&
    (value.flow !== "code" || (typeof value.redirectUri === "string" && typeof value.codeChallenge === "string")) &&
    (value.flow !== "device" || typeof value.userCode === "string")
  );
}

/**
 * Set, or clear without a pending request, the encrypted pending request cookie. The request must fit in a single
 * cookie: {@link readPending} does not reassemble split cookies
 * @param ctx - web context
 * @param cookieName - cookie name
 * @param path - cookie path
 * @param pending - pending request, undefined to clear the cookie
 * @returns false when the encrypted request is too large for a single cookie (nothing is sent)
 */
export async function writePending(
  ctx: WebContext,
  cookieName: string,
  path: string,
  pending: PendingRequest | undefined
): Promise<boolean> {
  const options = new CookieOptions(
    {
      name: cookieName,
      path: path || "/",
      maxAge: pending ? PENDING_TTL : 0,
      sameSite: "lax",
      httpOnly: true
    },
    ctx.getHttpContext()
  );
  if (!pending) {
    ctx.cookie(cookieName, "", options);
    return true;
  }
  const value = await useCrypto().encrypt(pending);
  if (value.length + cookieName.length + options.path!.length + COOKIE_ATTRIBUTES > MAX_COOKIE) return false;
  SecureCookie.sendCookie(ctx, cookieName, value, options);
  return true;
}

/**
 * Read the pending request cookie; it is not cleared (the consent page reads it more than once)
 * @param ctx - web context
 * @param cookieName - cookie name
 * @returns the pending request, undefined when absent, invalid or expired
 */
export async function readPending(ctx: WebContext, cookieName: string): Promise<PendingRequest | undefined> {
  const raw = ctx.getHttpContext()?.getCookies?.()?.[cookieName];
  if (typeof raw !== "string" || !raw) return undefined;
  let pending: unknown;
  try {
    pending = await useCrypto().decrypt(raw);
  } catch {
    return undefined;
  }
  if (!isPendingRequest(pending) || !(Date.now() <= pending.expires)) return undefined;
  return pending;
}
