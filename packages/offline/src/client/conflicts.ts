import {
  merge3,
  resolve,
  type Conflict,
  type MergeResult,
  type Resolution,
  type VersioningConfig
} from "@webda/versioning";
import type { ConflictInfo, ConflictStrategy } from "./client.js";
import { clone, deepEqual, type LocalRecord } from "./record.js";

/**
 * @param record - the record
 * @param result - the merge result
 * @param ancestor - common ancestor
 * @param theirs - server value
 * @param theirsRev - server revision
 * @returns the record in conflict state
 */
function conflicted(
  record: LocalRecord,
  result: MergeResult<any>,
  ancestor: any,
  theirs: any,
  theirsRev: number
): LocalRecord {
  return {
    ...record,
    base: clone(theirs),
    baseRev: theirsRev,
    state: "conflict",
    conflict: { result, ancestor: clone(ancestor) },
    pendingMutationId: undefined,
    sent: undefined
  };
}

/**
 * Rebase local changes on a new server value
 * @param record - the local record (dirty, created, deleted, error or conflict)
 * @param theirs - the server value, null when deleted on the server
 * @param theirsRev - the server revision
 * @param cfg - versioning config
 * @returns the rebased record, null when it must be removed locally
 */
export function rebase(
  record: LocalRecord,
  theirs: any | null,
  theirsRev: number,
  cfg: VersioningConfig
): LocalRecord | null {
  const ancestor = record.state === "conflict" ? record.conflict!.ancestor : record.base;
  const ours = record.current;
  if (theirs === null) {
    if (ours === null) return null;
    const root: Conflict = { path: "", kind: "delete-modify", base: ancestor, ours, theirs: undefined };
    return conflicted(record, { merged: clone(ours), conflicts: [root], clean: false }, ancestor, null, 0);
  }
  if (ours === null) {
    const root: Conflict = { path: "", kind: "delete-modify", base: ancestor, ours: undefined, theirs };
    return conflicted(record, { merged: clone(theirs), conflicts: [root], clean: false }, ancestor, theirs, theirsRev);
  }
  const result = merge3(ancestor ?? {}, ours, theirs, cfg);
  if (!result.clean) return conflicted(record, result, ancestor, theirs, theirsRev);
  return {
    ...record,
    base: clone(theirs),
    baseRev: theirsRev,
    current: result.merged,
    state: deepEqual(result.merged, theirs) ? "synced" : "dirty",
    conflict: undefined,
    error: undefined,
    pendingMutationId: undefined,
    sent: undefined
  };
}

/**
 * @param strategy - the configured strategy
 * @param info - the conflict
 * @returns resolutions for every conflict, or "defer"
 */
export async function strategyResolutions(
  strategy: ConflictStrategy,
  info: ConflictInfo
): Promise<Map<string, Resolution> | "defer"> {
  if (typeof strategy === "function") return strategy(info);
  if (strategy === "manual") return "defer";
  const choose = strategy === "server-wins" ? "theirs" : "ours";
  return new Map(info.result.conflicts.map(c => [c.path, { choose } as Resolution]));
}

/**
 * @param resolution - a resolution
 * @param conflict - the conflict it answers
 * @returns the chosen value
 */
function chosen(resolution: Resolution, conflict: Conflict): unknown {
  if ("choose" in resolution) return conflict[resolution.choose];
  if ("value" in resolution) return resolution.value;
  return resolution.text;
}

/**
 * Apply resolutions to a record in conflict
 * @param record - the record in conflict state
 * @param resolutions - path → resolution, every conflict must be answered
 * @returns the record to push, or null when it must be removed locally
 */
export function settleConflict(record: LocalRecord, resolutions: Map<string, Resolution>): LocalRecord | null {
  const { result } = record.conflict!;
  const settled = { ...record, conflict: undefined, error: undefined, pendingMutationId: undefined, sent: undefined };
  const root = result.conflicts.find(c => c.path === "");
  if (root) {
    const resolution = resolutions.get("");
    if (!resolution) throw new Error("Unresolved conflict at the object root");
    const value = chosen(resolution, root) ?? null;
    if (record.base === null) {
      // Deleted on the server: recreate, or accept the delete
      return value === null ? null : { ...settled, current: clone(value), baseRev: 0, state: "created" };
    }
    return value === null
      ? { ...settled, current: null, state: "deleted" }
      : { ...settled, current: clone(value), state: deepEqual(value, record.base) ? "synced" : "dirty" };
  }
  const resolved = resolve(result, resolutions);
  if (!resolved.clean) {
    throw new Error(`Unresolved conflicts: ${resolved.conflicts.map(c => c.path).join(", ")}`);
  }
  return {
    ...settled,
    current: resolved.merged,
    state: deepEqual(resolved.merged, record.base) ? "synced" : "dirty"
  };
}
