import { applyPatch, reversePatch, structuredPatch } from "diff";
import type { StructuredPatch } from "diff";

import { VersioningError } from "../errors.js";
import type { UnifiedDiff } from "../types.js";

export function lineDiff(a: string, b: string): UnifiedDiff {
  return structuredPatch("a", "b", a, b, "", "", { context: 3 });
}

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

export function lineReverse(hunks: UnifiedDiff): UnifiedDiff {
  return reversePatch(hunks) as StructuredPatch;
}
