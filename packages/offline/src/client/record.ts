import type { MergeResult } from "@webda/versioning";
import type { SyncRef } from "../protocol/index.js";

export type RecordState = "synced" | "dirty" | "created" | "deleted" | "conflict" | "error";

/**
 * Local copy of one object
 */
export interface LocalRecord {
  /** `refId(ref)` */
  id: string;
  ref: SyncRef;
  /** Last server-confirmed snapshot, null for a local create */
  base: any | null;
  /** Revision of `base`, 0 for a local create */
  baseRev: number;
  /** Local value, null for a local delete */
  current: any | null;
  state: RecordState;
  /** Mutation id of the change in flight, kept until settled so retries are idempotent */
  pendingMutationId?: string;
  /** `current` as it was when the in-flight mutation was built */
  sent?: any;
  /** Open conflict: the merge result and the common ancestor it was computed from */
  conflict?: { result: MergeResult<any>; ancestor: any | null };
  /** Server refusal of the last push */
  error?: { code: string; message: string };
}

/**
 * Structural equality of JSON values
 * @param a - first value
 * @param b - second value
 * @returns true when equal
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual((a as any)[k], (b as any)[k]));
}

/**
 * @param value - a JSON value
 * @returns a deep copy
 */
export function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}
