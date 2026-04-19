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
 * @param delta - the delta to wrap
 * @param meta - optional metadata (timestamp, author, message, id)
 * @returns a `VersionedPatch` combining the delta with the supplied metadata
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

/**
 * Return the bare `Delta` from a `VersionedPatch`. Symmetric with `wrap()`.
 * @param patch - the versioned patch to unwrap
 * @returns the `Delta` embedded in the patch
 */
export function unwrap(patch: VersionedPatch): Delta {
  return patch.delta;
}

/**
 * Canonical JSON serialization: keys sorted at every level so structurally-equal
 * values hash identically regardless of insertion order. `undefined` fields and
 * functions are skipped (JSON semantics).
 * @param value - the value to serialize canonically
 * @returns a deterministic JSON string representation of `value`
 */
function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = (value as Record<string, unknown>)[k];
    if (v === undefined || typeof v === "function") continue;
    parts.push(JSON.stringify(k) + ":" + canonicalJSON(v));
  }
  return "{" + parts.join(",") + "}";
}

/**
 * Convert an `ArrayBuffer` of raw bytes to a lowercase hex string.
 * @param buffer - the raw byte buffer to encode
 * @returns a lowercase hexadecimal string representation of the buffer
 */
function bytesToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Compute a SHA-256 content hash of a `VersionedPatch` as a 64-char hex string.
 * The hash covers `delta`, `timestamp`, `author`, and `message` — the `id`
 * field is deliberately excluded (self-reference).
 *
 * Uses the Web Crypto API (`crypto.subtle.digest`) — portable across Node ≥19
 * and all modern browsers.
 * @param vp - the versioned patch to hash
 * @returns a 64-character lowercase hex SHA-256 digest
 */
export async function hash(vp: VersionedPatch): Promise<string> {
  const canonical = canonicalJSON({
    delta: vp.delta,
    timestamp: vp.timestamp,
    author: vp.author,
    message: vp.message
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(digest);
}

/**
 * Wrap a `Delta` with commit metadata AND compute a content-addressed `id`
 * via `hash()`. The resulting `id` is a 64-char hex SHA-256 fingerprint of
 * the patch's content — stable across runtimes, deterministic, and unique
 * per (delta, timestamp, author, message) tuple.
 *
 * For the common case where you want a git-like commit record, prefer
 * `commit()` over manually wiring `wrap()` + `hash()`.
 * @param delta - the delta to commit
 * @param meta - optional metadata (timestamp, author, message); `id` is computed automatically
 * @returns a `VersionedPatch` with a content-addressed `id` field set
 */
export async function commit(
  delta: Delta,
  meta: Omit<VersionedPatchMeta, "id"> = {}
): Promise<VersionedPatch> {
  const stub = wrap(delta, meta);
  const id = await hash(stub);
  return { ...stub, id };
}
