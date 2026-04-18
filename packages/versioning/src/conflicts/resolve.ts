import { setAtPointer } from "../engine/patch.js";
import { VersioningError } from "../errors.js";
import type { Conflict, MergeResult, Path, Resolution } from "../types.js";

function resolutionToValue(c: Conflict, res: Resolution): unknown {
  if ("choose" in res) {
    switch (res.choose) {
      case "ours":
        return c.ours;
      case "theirs":
        return c.theirs;
      case "base":
        return c.base;
    }
  }
  if ("value" in res) return res.value;
  if ("text" in res) {
    // 'text' resolution is meant for `kind: "line"` conflicts. We also allow it
    // when both ours and theirs are strings (e.g., "replace"-strategy string
    // conflict), but not when only one side happens to be a string.
    const isStringConflict =
      c.kind === "line" || (typeof c.ours === "string" && typeof c.theirs === "string");
    if (!isStringConflict) {
      throw new VersioningError(
        "RESOLUTION_TYPE_MISMATCH",
        `resolve: 'text' resolution only applies to string conflicts at ${c.path}`,
        c.path
      );
    }
    return res.text;
  }
  throw new VersioningError(
    "INVALID_RESOLUTION",
    `resolve: invalid Resolution at ${c.path}`,
    c.path
  );
}

export function resolve<T>(
  result: MergeResult<T>,
  resolutions: Map<Path, Resolution>
): MergeResult<T> {
  // setAtPointer performs its own clone per call, so no upfront clone is needed.
  let merged: unknown = result.merged;
  const remaining: Conflict[] = [];

  for (const c of result.conflicts) {
    const res = resolutions.get(c.path);
    if (!res) {
      remaining.push(c);
      continue;
    }
    const value = resolutionToValue(c, res);
    merged = setAtPointer(merged, c.path, value);
  }

  return {
    merged: merged as T,
    conflicts: remaining,
    clean: remaining.length === 0
  };
}
