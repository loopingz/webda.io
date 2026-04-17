import type { VersioningConfig } from "../config.js";
import type { Conflict, MergeResult, Path } from "../types.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function escapeSeg(k: string): string {
  return k.replace(/~/g, "~0").replace(/\//g, "~1");
}

function deepEqual(a: unknown, b: unknown): boolean {
  // Object.is handles NaN (so NaN ≡ NaN) and distinguishes -0 from 0.
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    if (ka.length !== Object.keys(b as object).length) return false;
    for (const k of ka) {
      if (!(k in (b as object))) return false;
      if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function arrayIdFor(path: Path, cfg: VersioningConfig): string | undefined {
  return cfg.arrayId?.[path];
}

function mergeAt(
  base: unknown,
  ours: unknown,
  theirs: unknown,
  path: Path,
  conflicts: Conflict[],
  cfg: VersioningConfig
): unknown {
  const oursChanged = !deepEqual(base, ours);
  const theirsChanged = !deepEqual(base, theirs);

  if (!oursChanged && !theirsChanged) return base;
  if (oursChanged && !theirsChanged) return ours;
  if (!oursChanged && theirsChanged) return theirs;
  // Both changed.
  if (deepEqual(ours, theirs)) return ours;

  if (Array.isArray(base) && Array.isArray(ours) && Array.isArray(theirs)) {
    const idKey = arrayIdFor(path, cfg);
    if (idKey) {
      return mergeArraysById(base, ours, theirs, path, idKey, conflicts, cfg);
    }
    // No arrayId → fall through to whole-value conflict (existing behavior).
    conflicts.push({ path, kind: "value", base, ours, theirs });
    return ours;
  }

  // Both are objects — recurse key-wise.
  if (isPlainObject(base) && isPlainObject(ours) && isPlainObject(theirs)) {
    const out: Record<string, unknown> = {};
    const allKeys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
    for (const k of allKeys) {
      const childPath = `${path}/${escapeSeg(k)}`;
      const inBase = k in base;
      const inOurs = k in ours;
      const inTheirs = k in theirs;

      if (inBase && !inOurs && inTheirs && !deepEqual(base[k], theirs[k])) {
        conflicts.push({
          path: childPath,
          kind: "delete-modify",
          base: base[k],
          ours: undefined,
          theirs: theirs[k]
        });
        out[k] = theirs[k]; // default: keep theirs' modification
        continue;
      }
      if (inBase && inOurs && !inTheirs && !deepEqual(base[k], ours[k])) {
        conflicts.push({
          path: childPath,
          kind: "delete-modify",
          base: base[k],
          ours: ours[k],
          theirs: undefined
        });
        out[k] = ours[k];
        continue;
      }

      const merged = mergeAt(
        inBase ? base[k] : undefined,
        inOurs ? ours[k] : undefined,
        inTheirs ? theirs[k] : undefined,
        childPath,
        conflicts,
        cfg
      );
      if (!inOurs && !inTheirs && merged === undefined) continue;
      out[k] = merged;
    }
    return out;
  }

  // Scalar, array, or type-mismatch conflict. Arrays will be replaced by id-keyed
  // merge in Task 10; for now they produce a whole-value conflict.
  conflicts.push({ path, kind: "value", base, ours, theirs });
  return ours;
}

function mergeArraysById(
  base: unknown[],
  ours: unknown[],
  theirs: unknown[],
  path: Path,
  idKey: string,
  conflicts: Conflict[],
  cfg: VersioningConfig
): unknown[] {
  const byId = (arr: unknown[]): Map<string, unknown> => {
    const m = new Map<string, unknown>();
    for (const item of arr) {
      if (item != null && typeof item === "object" && idKey in (item as Record<string, unknown>)) {
        const idVal = (item as Record<string, unknown>)[idKey];
        m.set(String(idVal), item);
      }
    }
    return m;
  };

  const mB = byId(base);
  const mO = byId(ours);
  const mT = byId(theirs);

  // Callers guarantee one item per id within an array; within this function
  // that means `byId` may silently overwrite duplicates. Items lacking the
  // idKey or non-object primitives are skipped by byId — same caller contract.

  // Preserve ours' order, then theirs' new ids, then base-only ids.
  // Base-only ids surface "deleted by both" cases so the corresponding
  // branch below is reachable and documentable.
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  };
  for (const id of mO.keys()) push(id);
  for (const id of mT.keys()) push(id);
  for (const id of mB.keys()) push(id);

  const out: unknown[] = [];
  for (const id of orderedIds) {
    const childPath = `${path}/${escapeSeg(id)}`;
    const inB = mB.has(id);
    const inO = mO.has(id);
    const inT = mT.has(id);

    if (inB && !inO && inT && !deepEqual(mB.get(id), mT.get(id))) {
      conflicts.push({
        path: childPath,
        kind: "delete-modify",
        base: mB.get(id),
        ours: undefined,
        theirs: mT.get(id)
      });
      out.push(mT.get(id));
      continue;
    }
    if (inB && inO && !inT && !deepEqual(mB.get(id), mO.get(id))) {
      conflicts.push({
        path: childPath,
        kind: "delete-modify",
        base: mB.get(id),
        ours: mO.get(id),
        theirs: undefined
      });
      out.push(mO.get(id));
      continue;
    }
    if (inB && !inO && !inT) continue; // deleted by both
    if (inB && !inO && inT && deepEqual(mB.get(id), mT.get(id))) continue; // theirs kept unchanged, ours deleted → apply ours' deletion
    if (inB && inO && !inT && deepEqual(mB.get(id), mO.get(id))) continue; // ours kept unchanged, theirs deleted → apply theirs' deletion
    if (!inO && inT) {
      out.push(mT.get(id));
      continue;
    }
    if (inO && !inT) {
      out.push(mO.get(id));
      continue;
    }
    if (inO && inT) {
      const merged = mergeAt(inB ? mB.get(id) : undefined, mO.get(id), mT.get(id), childPath, conflicts, cfg);
      out.push(merged);
    }
  }
  return out;
}

export function merge3<T>(base: T, ours: T, theirs: T, cfg: VersioningConfig = {}): MergeResult<T> {
  const conflicts: Conflict[] = [];
  const merged = mergeAt(base, ours, theirs, "", conflicts, cfg) as T;
  return {
    merged,
    conflicts,
    clean: conflicts.length === 0
  };
}
