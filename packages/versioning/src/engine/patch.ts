import { create as createJdp } from "jsondiffpatch";

import type { Delta, Path } from "../types.js";
import { lineApply } from "../strings/line-diff.js";
import { VersioningError } from "../errors.js";

/**
 * Unescape a JSON Pointer path segment per RFC 6901 (`~1` → `/`, `~0` → `~`).
 * @param segment - the escaped path segment to unescape
 * @returns the raw key string
 */
function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Set a value at a JSON Pointer `path` inside `root`, mutating `root` in place.
 * @param root - the root object to mutate
 * @param path - JSON Pointer path (e.g. `/foo/bar`)
 * @param value - the value to write at the path
 * @returns `root` after mutation
 */
function setAtPointerMut(root: unknown, path: Path, value: unknown): unknown {
  if (path === "") return value;
  const parts = path.slice(1).split("/").map(unescapePointer);
  let cursor: any = root;
  for (let i = 0; i < parts.length - 1; i++) cursor = cursor[parts[i]];
  cursor[parts[parts.length - 1]] = value;
  return root;
}

/**
 * Return a deep clone of `root` with `value` written at the JSON Pointer `path`.
 * @param root - the root object to clone and write into
 * @param path - JSON Pointer path (e.g. `/foo/bar`); empty string replaces root
 * @param value - the value to write at the path
 * @returns a new deep clone of `root` with the value set
 */
export function setAtPointer(root: unknown, path: Path, value: unknown): unknown {
  if (path === "") return value;
  return setAtPointerMut(structuredClone(root), path, value);
}

/**
 * Read the value at the JSON Pointer `path` inside `root`.
 * @param root - the root object to traverse
 * @param path - JSON Pointer path (e.g. `/foo/bar`); empty string returns `root`
 * @returns the value at the path, or `undefined` if any segment is missing
 */
export function getAtPointer(root: unknown, path: Path): unknown {
  if (path === "") return root;
  const parts = path.slice(1).split("/").map(unescapePointer);
  let cursor: any = root;
  for (const p of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[p];
  }
  return cursor;
}

/**
 * Apply a `Delta` to a value, producing the patched result.
 * @param a - the base value to patch
 * @param delta - the delta produced by `diff(a, b)`
 * @returns the patched value equivalent to the original `b`
 */
export function patch<T>(a: T, delta: Delta): T {
  if (delta.__versioning !== 1) {
    throw new VersioningError("BAD_FORMAT", `unsupported delta format version`);
  }
  const jdp = createJdp({});
  let result: unknown = a;
  if (delta.ops) {
    result = jdp.patch(structuredClone(a), delta.ops);
  }
  if (delta.stringHunks) {
    // Clone once before the loop; subsequent per-hunk writes mutate in place.
    result = structuredClone(result);
    for (const [path, hunks] of Object.entries(delta.stringHunks)) {
      const base = getAtPointer(result, path);
      if (typeof base !== "string") {
        throw new VersioningError(
          "STRATEGY_MISMATCH",
          `patch: expected string at ${path}, got ${typeof base}`,
          path
        );
      }
      result = setAtPointerMut(result, path, lineApply(base, hunks));
    }
  }
  return result as T;
}
