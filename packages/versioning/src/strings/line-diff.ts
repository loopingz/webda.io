import { applyPatch, reversePatch, structuredPatch } from "diff";
import type { StructuredPatch } from "diff";

import { VersioningError } from "../errors.js";
import type { UnifiedDiff } from "../types.js";

/**
 * Compute a structured unified diff between two strings at line granularity.
 * @param a - the "before" string
 * @param b - the "after" string
 * @returns a `UnifiedDiff` (structured patch) describing the line-level changes
 */
export function lineDiff(a: string, b: string): UnifiedDiff {
  return structuredPatch("a", "b", a, b, "", "", { context: 3 });
}

/**
 * Apply a `UnifiedDiff` to a string, returning the patched result.
 * @param source - the base string to patch
 * @param hunks - the unified diff produced by `lineDiff`
 * @returns the patched string
 */
export function lineApply(source: string, hunks: UnifiedDiff): string {
  // Identity patch: applyPatch also returns source unchanged, but this skips the parse round-trip.
  if (hunks.hunks.length === 0) return source;
  // Strict context match — no fuzzFactor. Drift produces an error rather than silently misapplying.
  const result = applyPatch(source, hunks);
  if (result === false) {
    throw new VersioningError(
      "STRATEGY_MISMATCH",
      "line hunks do not apply — base string has drifted (context mismatch)"
    );
  }
  return result;
}

/**
 * Reverse a `UnifiedDiff` so it can be applied to the "after" string to recover the "before".
 * @param hunks - the unified diff to reverse
 * @returns a new `UnifiedDiff` that undoes the original diff
 */
export function lineReverse(hunks: UnifiedDiff): UnifiedDiff {
  return reversePatch(hunks) as StructuredPatch;
}
