import { runAsSystem } from "../contexts/execution.js";

/** Throttle configuration options */
export interface ThrottleParameters {
  /** Failures allowed before lockout engages */
  failedBeforeDelay?: number;
  /** Lockout duration in milliseconds */
  lockout?: number;
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
