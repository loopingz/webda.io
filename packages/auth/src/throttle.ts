import type { Ident, IdentThrottle } from "@webda/core";
import { runAsSystem } from "@webda/core";

/** Login failure state of an ident: its top-level `_loginAttempts` / `_lastLoginAttemptAt` attributes */
export type LoginAttempts = Pick<Ident, "_loginAttempts" | "_lastLoginAttemptAt">;

/** Throttle configuration options */
export interface ThrottleParameters {
  /** Failures allowed before lockout engages */
  failedBeforeDelay?: number;
  /** Lockout duration in milliseconds */
  lockout?: number;
}

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
export function canSend(t: IdentThrottle | undefined, delayMs: number, now: number = Date.now()): boolean {
  return !t?.lastSentAt || t.lastSentAt + delayMs < now;
}

/**
 * Mark that a message was sent
 * @param t - throttle state
 * @param now - clock
 * @returns state with the send timestamp set
 */
export function markSent(t: IdentThrottle | undefined, now: number = Date.now()): IdentThrottle {
  return { ...(t ?? {}), lastSentAt: now };
}

/**
 * Atomic attempt counting and lockout check generalised across stores and models
 * @param ref - model reference (e.g. ident.ref(), user.ref())
 * @param attrCount - attribute name tracking attempts (e.g. "_loginAttempts", "_mfaAttempts")
 * @param attrTs - attribute name tracking last attempt timestamp (e.g. "_lastLoginAttemptAt", "_lastMfaAttemptAt")
 * @param params - throttle parameters
 * @param currentSnapshot - optional current in-memory record
 * @returns true if this attempt is locked out
 */
export async function countAttempt(
  ref: any,
  attrCount: string,
  attrTs: string,
  params: ThrottleParameters = {},
  currentSnapshot?: any
): Promise<boolean> {
  const failedBeforeDelay = params.failedBeforeDelay ?? 5;
  const lockout = params.lockout ?? 900000;
  const now = Date.now();
  const snapshot = currentSnapshot ?? (await runAsSystem(() => ref.get()));
  const currentCount = snapshot?.[attrCount] ?? 0;
  const currentTs = snapshot?.[attrTs];
  const expired = currentCount >= failedBeforeDelay && (!currentTs || currentTs + lockout <= now);
  const updated = await runAsSystem(() => ref.incrementAttribute(attrCount));
  const attempts = (updated as any)?.[attrCount] ?? (await runAsSystem(() => ref.get()))?.[attrCount];
  const locked = !expired && attempts - 1 >= failedBeforeDelay;
  if (!locked) {
    await runAsSystem(() => ref.setAttribute(attrTs, now));
  }
  return locked;
}
