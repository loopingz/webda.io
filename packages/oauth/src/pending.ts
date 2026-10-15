import { CookieOptions, SecureCookie, useCrypto, type WebContext } from "@webda/core";

/** Lifetime of a pending request (s) */
export const PENDING_TTL = 600;

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
    (value.flow !== "code" || (typeof value.redirectUri === "string" && typeof value.codeChallenge === "string")) &&
    (value.flow !== "device" || typeof value.userCode === "string")
  );
}

/**
 * Set, or clear without a pending request, the encrypted pending request cookie
 * @param ctx - web context
 * @param cookieName - cookie name
 * @param path - cookie path
 * @param pending - pending request, undefined to clear the cookie
 */
export async function writePending(
  ctx: WebContext,
  cookieName: string,
  path: string,
  pending: PendingRequest | undefined
): Promise<void> {
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
  if (pending) {
    SecureCookie.sendCookie(ctx, cookieName, await useCrypto().encrypt(pending), options);
  } else {
    ctx.cookie(cookieName, "", options);
  }
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
