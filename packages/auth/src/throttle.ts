import type { IdentThrottle } from "@webda/core";

/**
 * Check if a throttle state is locked due to too many failures
 * @param t - throttle state
 * @param failedBefore - failures before locking
 * @param lockoutMs - lock duration after the last failure
 * @param now - clock
 * @returns true while locked
 */
export function isLocked(t: IdentThrottle, failedBefore: number, lockoutMs: number, now: number = Date.now()): boolean {
  return !!t && t.attempts >= failedBefore && (t.lastAttemptAt ?? 0) + lockoutMs > now;
}

/**
 * Record a failure in the throttle state
 * @param t - throttle state
 * @param now - clock
 * @returns state with one more failure
 */
export function recordFailure(t: IdentThrottle, now: number = Date.now()): IdentThrottle {
  return { ...(t ?? { attempts: 0 }), attempts: (t?.attempts ?? 0) + 1, lastAttemptAt: now };
}

/**
 * Clear all failures from throttle state
 * @param t - throttle state
 * @returns state with failures cleared (send timestamp kept)
 */
export function resetFailures(t: IdentThrottle): IdentThrottle {
  return { attempts: 0, lastSentAt: t?.lastSentAt };
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
  return { ...(t ?? { attempts: 0 }), lastSentAt: now };
}
