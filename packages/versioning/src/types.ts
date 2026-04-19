import type { Delta as JsonDiffPatchDelta } from "jsondiffpatch";
import type { StructuredPatch } from "diff";

/** RFC 6901 JSON Pointer, e.g. "/items/3/title". Empty string "" = root. */
export type Path = string;

/** Strategy for diffing a single string field. "char" reserved for future. */
export type Strategy = "replace" | "line";

/** jsdiff `structuredPatch` output — unified-diff hunks. */
export type UnifiedDiff = StructuredPatch;

/**
 * JSON-serializable delta produced by `diff(a, b)`.
 * The `__versioning` brand lets future format changes be detected at load time.
 */
export type Delta = {
  readonly __versioning: 1;
  /** Undefined when the inputs to `diff()` are equal. */
  readonly ops?: JsonDiffPatchDelta;
  readonly stringHunks?: Readonly<Record<Path, UnifiedDiff>>;
};

export type ConflictKind = "value" | "line" | "array-item" | "delete-modify";

/** Structured 3-way merge conflict. Use `kind` to discriminate; `hunks` is present only on line conflicts. */
export type Conflict =
  | {
      path: Path;
      kind: "value" | "array-item" | "delete-modify";
      base: unknown;
      ours: unknown;
      theirs: unknown;
    }
  | {
      path: Path;
      kind: "line";
      base: unknown;
      ours: unknown;
      theirs: unknown;
      hunks: { ours: UnifiedDiff; theirs: UnifiedDiff };
    };

export type MergeResult<T> = {
  merged: T;
  conflicts: Conflict[];
  clean: boolean;
};

export type Resolution =
  | { choose: "ours" | "theirs" | "base" }
  | { value: unknown }
  /** Resolved replacement text — used for `kind: "line"` conflicts where the user
   *  has edited the conflicting string (e.g., via the git-markers workflow). */
  | { text: string };
