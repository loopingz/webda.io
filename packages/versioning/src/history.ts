import type { Delta } from "./types.js";

/**
 * A `Delta` with commit-like bookkeeping attached. Use when you need to record
 * when a change was made, by whom, and optionally correlate it with an external
 * id. The engine operates on bare `Delta`; this type is for history/replication
 * layers that sit on top.
 */
export type VersionedPatch = {
  readonly delta: Delta;
  /** Milliseconds since epoch. Numeric for easy sort + monotonic math. */
  readonly timestamp: number;
  /** Free-form identifier for the actor that authored the change (email, user id, service name). */
  readonly author?: string;
  /** Short human-readable note, analogous to a git commit message. */
  readonly message?: string;
  /** Caller-supplied stable identifier (useful for dedup, replay, correlation). */
  readonly id?: string;
};

export type VersionedPatchMeta = {
  timestamp?: number;
  author?: string;
  message?: string;
  id?: string;
};

/**
 * Wrap a `Delta` with commit metadata. `timestamp` defaults to `Date.now()`
 * when omitted; all other fields are optional.
 */
export function wrap(delta: Delta, meta: VersionedPatchMeta = {}): VersionedPatch {
  return {
    delta,
    timestamp: meta.timestamp ?? Date.now(),
    ...(meta.author !== undefined ? { author: meta.author } : {}),
    ...(meta.message !== undefined ? { message: meta.message } : {}),
    ...(meta.id !== undefined ? { id: meta.id } : {})
  };
}

/** Return the bare `Delta` from a `VersionedPatch`. Symmetric with `wrap()`. */
export function unwrap(patch: VersionedPatch): Delta {
  return patch.delta;
}
