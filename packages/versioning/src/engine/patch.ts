import { create as createJdp } from "jsondiffpatch";

import type { Delta, Path } from "../types.js";
import { lineApply } from "../strings/line-diff.js";
import { VersioningError } from "../errors.js";

function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function setAtPointerMut(root: unknown, path: Path, value: unknown): unknown {
  if (path === "") return value;
  const parts = path.slice(1).split("/").map(unescapePointer);
  let cursor: any = root;
  for (let i = 0; i < parts.length - 1; i++) cursor = cursor[parts[i]];
  cursor[parts[parts.length - 1]] = value;
  return root;
}

export function setAtPointer(root: unknown, path: Path, value: unknown): unknown {
  if (path === "") return value;
  return setAtPointerMut(structuredClone(root), path, value);
}

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
