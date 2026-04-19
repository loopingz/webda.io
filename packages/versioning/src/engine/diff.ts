import { create as createJdp } from "jsondiffpatch";
import type { Delta as JsonDiffPatchDelta } from "jsondiffpatch";

import type { VersioningConfig } from "../config.js";
import { chooseStrategy } from "../strings/strategy.js";
import { lineDiff } from "../strings/line-diff.js";
import type { Delta, Path, UnifiedDiff } from "../types.js";

// Known limitation: jsondiffpatch's objectHash receives no path context, so this
// single hash fn is applied to EVERY array. When two arrays are configured with
// different id keys and an object happens to contain both, the Set-iteration
// order decides which wins. Document-space objects in this package's domain are
// expected to have a single stable identity field per array; cross-array id
// collisions are out of scope.
/**
 * Create a jsondiffpatch instance configured to use `cfg.arrayId` keys for
 * identity-based array diffing.
 * @param cfg - versioning config supplying optional `arrayId` key mappings
 * @returns a configured jsondiffpatch instance
 */
function makeJdp(cfg: VersioningConfig) {
  const arrayIds = cfg.arrayId ?? {};
  return createJdp({
    objectHash: (obj: object, _index?: number): string | undefined => {
      if (obj && typeof obj === "object") {
        for (const idKey of new Set(Object.values(arrayIds))) {
          const o = obj as Record<string, unknown>;
          if (idKey in o && (typeof o[idKey] === "string" || typeof o[idKey] === "number")) {
            return String(o[idKey]);
          }
        }
      }
      // Fallback is insertion-order sensitive; may cause churn (remove+add instead of
      // move) for objects without a configured id key. Acceptable for our domain
      // where arrays of interest have arrayId configured.
      return JSON.stringify(obj);
    }
    // textDiff intentionally omitted: without diffMatchPatch, jsondiffpatch
    // falls back to plain replace for strings, which is what we want.
    // We handle multiline string diffing ourselves via extractLineHunks.
  });
}

/**
 * Escape a JSON Pointer path segment per RFC 6901 (`~` → `~0`, `/` → `~1`).
 * @param key - the raw object key to escape
 * @returns the escaped key safe for use in a JSON Pointer segment
 */
function escapePointer(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Walks `a` and `b` in parallel. For every string leaf that should use the
 * "line" strategy, records `{ path → hunks }` and replaces the `b` value
 * with the `a` value so the structural delta produced by jsondiffpatch
 * skips that path.
 * @param a - the "before" value
 * @param b - the "after" value
 * @param cfg - versioning config used to determine per-path string strategy
 * @param path - current JSON Pointer path (empty string at root)
 * @returns `bStripped` (b with line-strategy strings replaced by a) and `hunks` map
 */
function extractLineHunks(
  a: unknown,
  b: unknown,
  cfg: VersioningConfig,
  path: Path = ""
): { bStripped: unknown; hunks: Record<Path, UnifiedDiff> } {
  if (typeof a === "string" && typeof b === "string" && a !== b) {
    const strategy = chooseStrategy(path, b, cfg);
    if (strategy === "line") {
      return { bStripped: a, hunks: { [path]: lineDiff(a, b) } };
    }
    return { bStripped: b, hunks: {} };
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    // Output array must match b.length exactly. Only recurse for overlapping
    // indices; excess a-elements become deletions (jsondiffpatch handles them),
    // excess b-elements are insertions (pass through unchanged).
    const out: unknown[] = new Array(b.length);
    const hunks: Record<Path, UnifiedDiff> = {};
    const minLen = Math.min(a.length, b.length);
    for (let i = 0; i < minLen; i++) {
      const res = extractLineHunks(a[i], b[i], cfg, `${path}/${i}`);
      out[i] = res.bStripped;
      Object.assign(hunks, res.hunks);
    }
    for (let i = minLen; i < b.length; i++) out[i] = b[i];
    return { bStripped: out, hunks };
  }

  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const out: Record<string, unknown> = { ...(b as Record<string, unknown>) };
    const hunks: Record<Path, UnifiedDiff> = {};
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    for (const k of Object.keys(bObj)) {
      if (k in aObj) {
        const res = extractLineHunks(aObj[k], bObj[k], cfg, `${path}/${escapePointer(k)}`);
        out[k] = res.bStripped;
        Object.assign(hunks, res.hunks);
      }
    }
    return { bStripped: out, hunks };
  }

  return { bStripped: b, hunks: {} };
}

/**
 * Compute a structured delta between two values.
 * @param a - the "before" value
 * @param b - the "after" value
 * @param cfg - optional versioning config (string strategies, arrayId, etc.)
 * @returns a serializable `Delta` describing the changes from `a` to `b`
 */
export function diff(a: unknown, b: unknown, cfg: VersioningConfig = {}): Delta {
  const { bStripped, hunks } = extractLineHunks(a, b, cfg);
  const jdp = makeJdp(cfg);
  const ops = jdp.diff(a, bStripped) as JsonDiffPatchDelta | undefined;
  const hasHunks = Object.keys(hunks).length > 0;
  return {
    __versioning: 1,
    ...(ops !== undefined ? { ops } : {}),
    ...(hasHunks ? { stringHunks: hunks } : {})
  };
}
