import { diff as coreDiff } from "../engine/diff.js";
import { patch as corePatch } from "../engine/patch.js";
import { reverse as coreReverse } from "../engine/reverse.js";
import { merge3 as coreMerge3 } from "../engine/merge.js";
import type { VersioningConfig } from "../config.js";
import type { Delta, MergeResult } from "../types.js";

/**
 * Default adapter — pass-through over the engine for plain JSON values.
 * Exists so callers importing from `@webda/versioning` have a single object
 * namespace that parallels `SchemaAdapter` and (via a sub-path import) the
 * `CoreModelAdapter`. The underlying `diff`/`patch`/`reverse`/`merge3`
 * functions are also exported directly for callers who prefer them.
 */
export const JsonAdapter = {
  diff: (a: unknown, b: unknown, cfg?: VersioningConfig): Delta => coreDiff(a, b, cfg),
  patch: <T>(a: T, d: Delta): T => corePatch(a, d),
  reverse: (d: Delta): Delta => coreReverse(d),
  merge3: <T>(base: T, ours: T, theirs: T, cfg?: VersioningConfig): MergeResult<T> =>
    coreMerge3(base, ours, theirs, cfg)
};
