import type { Ident, IdentThrottle } from "@webda/core";

/** Login failure state of an ident: its top-level `_loginAttempts` / `_lastLoginAttemptAt` attributes */
export type LoginAttempts = Pick<Ident, "_loginAttempts" | "_lastLoginAttemptAt">;

/**
 * Check if an ident is locked due to too many failed logins
 * @param s - login failure state (an ident)
 * @param failedBefore - failures before locking
 * @param lockoutMs - lock duration after the last attempt
 * @param now - clock
 * @returns true while locked
 */
export function isLocked(s: LoginAttempts, failedBefore: number, lockoutMs: number, now: number = Date.now()): boolean {
  return !!s && (s._loginAttempts ?? 0) >= failedBefore && (s._lastLoginAttemptAt ?? 0) + lockoutMs > now;
}

/**
 * Record a failure in the login failure state
 * @param s - login failure state
 * @param now - clock
 * @returns state with one more failure
 */
export function recordFailure(s: LoginAttempts, now: number = Date.now()): LoginAttempts {
  return { _loginAttempts: (s?._loginAttempts ?? 0) + 1, _lastLoginAttemptAt: now };
}

/**
 * Clear all login failures
 * @returns state with failures cleared
 */
export function resetFailures(): LoginAttempts {
  return { _loginAttempts: 0, _lastLoginAttemptAt: undefined };
}

/**
 * Check if a message can be sent based on throttle delay
 * @param t - throttle state
 * @param delayMs - minimal delay between two emails
 * @param now - clock
 * @returns true when an email may be sent
 */
export function canSend(t: IdentThrottle, delayMs: number, now: number = Date.now()): boolean {
  return !t?.lastSentAt || t.lastSentAt + delayMs < now;
}

/**
 * Mark that a message was sent
 * @param t - throttle state
 * @param now - clock
 * @returns state with the send timestamp set
 */
export function markSent(t: IdentThrottle, now: number = Date.now()): IdentThrottle {
  return { ...(t ?? {}), lastSentAt: now };
}
