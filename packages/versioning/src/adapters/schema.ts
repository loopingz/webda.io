import { diff as coreDiff } from "../engine/diff.js";
import { patch as corePatch } from "../engine/patch.js";
import { reverse as coreReverse } from "../engine/reverse.js";
import { merge3 as coreMerge3 } from "../engine/merge.js";
import type { VersioningConfig } from "../config.js";
import type { Delta, MergeResult } from "../types.js";

export const SchemaAdapter = {
  /**
   * Build a closed-over adapter where the config is fixed once and reused
   * across every call. Use when the same object shape is diffed/merged repeatedly.
   * @param cfg - versioning config (string strategies, arrayId, etc.) to bind for all calls
   * @returns an object exposing `diff`, `patch`, `reverse`, and `merge3` pre-configured with `cfg`
   */
  forSchema(cfg: VersioningConfig) {
    // patch and reverse are config-independent: they operate on the delta,
    // which is self-describing. Only diff and merge3 need the schema config.
    return {
      diff: (a: unknown, b: unknown): Delta => coreDiff(a, b, cfg),
      patch: <T>(a: T, d: Delta): T => corePatch(a, d),
      reverse: (d: Delta): Delta => coreReverse(d),
      merge3: <T>(base: T, ours: T, theirs: T): MergeResult<T> =>
        coreMerge3(base, ours, theirs, cfg)
    };
  }
};
