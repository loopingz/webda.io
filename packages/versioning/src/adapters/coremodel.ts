/**
 * CoreModel adapter for @webda/versioning.
 *
 * ## CoreModel / UuidModel API (as of @webda/models v4.0.0-beta.1)
 *
 * This adapter works with any subclass of `UuidModel` (from `@webda/models`),
 * which is the concrete base that @webda/core's `CoreModel` extends.
 *
 * ### Serialization
 * `Model.toJSON()` returns `this` (a self-reference), NOT a plain object.
 * There is no `toStoredJSON()`. The reliable way to get a plain-JSON snapshot is:
 *   `JSON.parse(JSON.stringify(model))`
 *
 * ### Rehydration
 * `model.load(plainData)` calls `this.constructor.deserialize(data, this)`,
 * which runs `Object.assign(instance, data)` with optional per-field
 * deserializers defined in `static getDeserializers()`. Returns `this`.
 *
 * ### Construction
 * `new SubClass(data?)` — data is optional. `UuidModel`'s constructor generates
 * a random uuid via `randomUUID()` when `data?.uuid` is absent.
 *
 * ### No toStoredJSON
 * Unlike some other frameworks, @webda/models has no `toStoredJSON()`.
 * We use `JSON.parse(JSON.stringify(model))` for a plain-object snapshot.
 *
 * @module
 */
import type { UuidModel } from "@webda/models";

import { diff as coreDiff } from "../engine/diff.js";
import { patch as corePatch } from "../engine/patch.js";
import { reverse as coreReverse } from "../engine/reverse.js";
import { merge3 as coreMerge3 } from "../engine/merge.js";
import type { VersioningConfig } from "../config.js";
import type { Delta, MergeResult } from "../types.js";

/**
 * Convert a UuidModel instance to a plain JSON object.
 *
 * `model.toJSON()` returns `this` (self-reference), so we use a
 * JSON round-trip to obtain a true plain object with only serializable fields.
 */
function toPlain<T extends UuidModel>(model: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(model));
}

/**
 * Rehydrate a plain JSON object back into an instance of the same UuidModel
 * subclass as `source`.
 *
 * We construct a fresh instance via the same constructor (which may generate a
 * new random uuid), then call `fresh.load(plain)` to overlay all fields from
 * the plain snapshot — including the correct uuid and any custom-deserialised
 * fields defined in `static getDeserializers()`.
 */
function fromPlain<T extends UuidModel>(source: T, plain: Record<string, unknown>): T {
  const Ctor = source.constructor as new (data?: Partial<T>) => T;
  // Pass plain to the constructor so uuid (and other constructor-initialised
  // fields) are picked up immediately.
  const fresh = new Ctor(plain as Partial<T>);
  // Then call load() so any custom per-field deserializers run.
  fresh.load(plain as any);
  return fresh;
}

/**
 * Adapter that bridges `@webda/models` `UuidModel` instances (and subclasses
 * such as `@webda/core`'s `CoreModel`) into the `@webda/versioning`
 * diff/patch/merge3 engine.
 *
 * Instances are serialized to plain JSON before being passed to the engine and
 * rehydrated (via the constructor + `load()`) back into the correct subclass
 * on the way out.
 *
 * Both `@webda/core` and `@webda/models` are **optional** peer dependencies:
 * they do not need to be installed unless you import this adapter.
 *
 * @example
 * ```ts
 * import { CoreModelAdapter } from "@webda/versioning/coremodel";
 *
 * const delta = CoreModelAdapter.diff(taskV1, taskV2);
 * const patched = CoreModelAdapter.patch(taskV1, delta);
 * const { merged, clean } = CoreModelAdapter.merge3(base, ours, theirs);
 * ```
 *
 * Note: `Date` fields serialize to ISO strings and will round-trip as strings
 * unless the subclass declares them in `static getDeserializers()`.
 */
export const CoreModelAdapter = {
  /**
   * Compute a structured delta between two UuidModel instances.
   * @param a - the "before" instance
   * @param b - the "after" instance
   * @param cfg - optional versioning config (string strategies, arrayId, etc.)
   * @returns a serializable Delta
   */
  diff<T extends UuidModel>(a: T, b: T, cfg?: VersioningConfig): Delta {
    return coreDiff(toPlain(a), toPlain(b), cfg);
  },

  /**
   * Apply a delta to a UuidModel instance, returning a new instance of the
   * same subclass with the patched field values.
   * @param a - the base instance
   * @param d - the delta produced by `diff()`
   * @returns a new instance of the same UuidModel subclass
   */
  patch<T extends UuidModel>(a: T, d: Delta): T {
    const patched = corePatch(toPlain(a), d) as Record<string, unknown>;
    return fromPlain(a, patched);
  },

  /**
   * Reverse a delta so it can be used to undo a patch.
   * @param d - the original delta
   * @returns the reversed delta
   */
  reverse(d: Delta): Delta {
    return coreReverse(d);
  },

  /**
   * 3-way merge three UuidModel instances, returning a new instance of the
   * same subclass as `ours`.
   * @param base - the common ancestor
   * @param ours - our local version
   * @param theirs - the remote version
   * @param cfg - optional versioning config
   * @returns a MergeResult whose `merged` field is a UuidModel subclass instance
   */
  merge3<T extends UuidModel>(base: T, ours: T, theirs: T, cfg?: VersioningConfig): MergeResult<T> {
    const r = coreMerge3(toPlain(base), toPlain(ours), toPlain(theirs), cfg);
    return {
      merged: fromPlain(ours, r.merged as Record<string, unknown>),
      conflicts: r.conflicts,
      clean: r.clean
    };
  }
};
