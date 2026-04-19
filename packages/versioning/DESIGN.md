# `@webda/versioning` — Design Spec

**Date:** 2026-04-16
**Status:** Approved (brainstorm phase)
**Package:** `packages/versioning/`

## 1. Purpose

A TypeScript library for diffing, patching, and **three-way merging** JSON-serializable objects, with git-like conflict surfacing that callers can resolve programmatically or through a text-editor workflow. Strings adapt their diff strategy by content (single-value replace vs. line-based unified diff), keeping deltas compact and conflicts legible.

### Target use cases (general-purpose by design)

- **Concurrent editing** — offline/parallel edits of the same object, three-way merge against a base revision, conflicts surfaced for human resolution
- **Audit / history** — record patches over time, replay or revert, detect base drift on replay
- **Replication / sync** — propagate deltas between stores (local ↔ remote), detect divergence

## 2. Scope

**In scope (v1):**

- 2-way diff and patch (plus patch reversal)
- String strategy selection: `replace` (default) vs. `line` (multiline or per-path override)
- 3-way merge with structured conflict output
- Conflict resolution API (programmatic + git-markers interop helper)
- Pluggable adapters: JSON (default), schema-aware, `CoreModel`

**Out of scope (v1), designed-for-future:**

- Persistent version history (this package provides primitives; a storage layer can be built on top)
- CRDT-style automatic convergence
- Character/word-level string diffs (the `char` strategy slot is reserved in the type system)
- CLI binary

## 3. Package layout

```
packages/versioning/
├── src/
│   ├── index.ts              # Public API barrel
│   ├── engine/
│   │   ├── diff.ts           # diff(a, b) → Delta   (wraps jsondiffpatch)
│   │   ├── patch.ts          # patch(a, delta) → b  (wraps jsondiffpatch)
│   │   └── merge.ts          # merge3(base, ours, theirs) → MergeResult
│   ├── strings/
│   │   ├── strategy.ts       # chooseStrategy(path, value, config)
│   │   └── line-diff.ts      # jsdiff-based unified-diff hunks + diff3
│   ├── conflicts/
│   │   ├── types.ts          # Conflict, MergeResult
│   │   ├── resolve.ts        # resolve(conflict, choice) helpers
│   │   └── markers.ts        # toGitMarkers / fromGitMarkers
│   ├── adapters/
│   │   ├── json.ts           # default, identity
│   │   ├── schema.ts         # array-id config, type-aware
│   │   └── coremodel.ts      # CoreModel integration (webda)
│   └── config.ts             # VersioningConfig
├── test/                     # Vitest specs mirroring src/
├── package.json
├── tsconfig.json
└── README.md
```

**Framework coupling:** the engine and adapters (except `coremodel.ts`) are framework-agnostic. Only `adapters/coremodel.ts` imports `@webda/core`. The package is publishable and usable outside webda.

### Dependencies

- `jsondiffpatch` — underlying 2-way diff/patch engine (JSON structural delta with array-id support via `objectHash`)
- `diff` (jsdiff) — line-based unified-diff output for the `line` string strategy
- `node-diff3` (or ~200 LOC in-tree) — line-level 3-way merge for string conflicts
- `fast-check` (devDependency) — property-based testing

`diff-match-patch` is **not** a v1 dependency. It is the intended backend when a `char` string strategy is added (its fuzzy `patch_apply` is the right primitive).

## 4. Data model

```typescript
// Branded so future format changes are detectable at load time.
export type Delta = {
  readonly __versioning: 1;
  readonly ops: JsonDiffPatchDelta;        // structural delta
  readonly stringHunks?: Record<Path, UnifiedDiff>;
  //   ↑ "line"-strategy string hunks live here (not in ops),
  //     so merge can apply them line-by-line.
  //   UnifiedDiff is jsdiff's structuredPatch return type,
  //   re-exported for consumers that want to walk hunks directly.
};

export type Path = string;                  // RFC 6901 JSON Pointer, e.g. "/items/3/title"

export type Strategy = "replace" | "line";  // "char" reserved for future

export type VersioningConfig = {
  // Per-path strategy override. Keys are exact JSON Pointers in v1
  // (wildcard/glob matching is deferred to a future version).
  stringStrategy?: Record<Path, Strategy>;
  // Per-path array identity key (like jsondiffpatch objectHash, but declarative).
  arrayId?: Record<Path, string>;
  // Optional: override the default "\n triggers line" behavior.
  multilineThreshold?: number;
};

export type MergeResult<T> = {
  merged: T;                                // best-effort merged object
  conflicts: Conflict[];                    // empty = clean merge
  clean: boolean;                           // conflicts.length === 0
};

export type Conflict = {
  path: Path;
  kind: "value" | "line" | "array-item" | "delete-modify";
  base: unknown;
  ours: unknown;
  theirs: unknown;
  hunks?: { ours: UnifiedDiff; theirs: UnifiedDiff };  // only for kind="line"
};

export type Resolution =
  | { choose: "ours" | "theirs" | "base" }
  | { value: unknown }                      // arbitrary user value
  | { text: string };                       // edited text for "line" conflicts
```

**Design notes:**

- `Delta.__versioning: 1` is a format tag. Future breaking changes to the delta shape bump the tag and callers can migrate or reject old deltas explicitly.
- Separating `stringHunks` from `ops` lets the line-diff engine evolve (e.g., swap jsdiff for diff-match-patch) without touching the structural merger.
- `Resolution` is a discriminated union — the API cannot be misused (cannot simultaneously `choose` and pass a `value`).
- `Conflict.kind = "delete-modify"` is called out explicitly because git treats it as its own case, and silently picking a side here is the kind of bug that corrupts data.

## 5. Public API

```typescript
// ─── Core engine ──────────────────────────────────────────────────────────
export function diff(a: unknown, b: unknown, cfg?: VersioningConfig): Delta;
export function patch<T>(a: T, delta: Delta): T;
export function reverse(delta: Delta): Delta;

// ─── 3-way merge ──────────────────────────────────────────────────────────
export function merge3<T>(
  base: T,
  ours: T,
  theirs: T,
  cfg?: VersioningConfig
): MergeResult<T>;

// ─── Conflict resolution ──────────────────────────────────────────────────
export function resolve<T>(
  result: MergeResult<T>,
  resolutions: Map<Path, Resolution>
): MergeResult<T>;

// ─── Git-marker interop (helper layer, not primary API) ───────────────────
// For "line"/string conflicts, unresolved text is returned inline with
// <<<<<<< / ======= / >>>>>>> markers at the conflict site.
// For non-string conflicts (value, array-item, delete-modify), the value at
// the conflicting path is replaced with a sentinel:
//     { __conflict: true, base, ours, theirs }
// The user resolves by replacing the sentinel with a real value before
// passing the edited object to fromGitMarkers.
export function toGitMarkers<T>(result: MergeResult<T>): T;
export function fromGitMarkers<T>(edited: T, result: MergeResult<T>): MergeResult<T>;

// ─── Adapters ─────────────────────────────────────────────────────────────
export { JsonAdapter, SchemaAdapter } from "./adapters";
export { CoreModelAdapter } from "./adapters/coremodel";   // optional import
```

### Typical flow

```typescript
const mine = await store.get(id);
const base = mine.__baseRevision;
const current = await store.getFresh(id);

const result = merge3(base, current, mine, cfg);

if (result.clean) {
  await store.save(result.merged);
} else {
  // Option A: programmatic resolution
  const resolutions = await promptUser(result.conflicts);
  const final = resolve(result, resolutions);

  // Option B: git-markers + text editor
  const withMarkers = toGitMarkers(result);
  const edited = await openInEditor(withMarkers);
  const final = fromGitMarkers(edited, result);
}
```

### Shape principles

- **Pure functions only** — no classes, no singletons. Easy to test, easy to compose.
- **Config is a plain object** passed at each call site — callers can memoize or vary it per-call without instance lifecycle.
- **Adapters wrap calls**, not the engine. E.g. `CoreModelAdapter.diff(modelA, modelB)` converts to JSON via `toStoredJSON()`, calls `diff`, and attaches model metadata on the way out.

## 6. Algorithms

### 6.1 String strategy selection

```
if cfg.stringStrategy[path]                         → use it
else if value contains "\n" (or length > threshold) → "line"
else                                                → "replace"
```

- `line` strategy uses jsdiff's `structuredPatch` to produce unified-diff hunks, stored at `Delta.stringHunks[path]`.
- `replace` strategy stores `[oldValue, newValue]` in the structural delta.

### 6.2 Three-way merge

```
delta_ours   = diff(base, ours)
delta_theirs = diff(base, theirs)

walk both deltas in parallel by path:
  - path only in ours                  → take ours
  - path only in theirs                → take theirs
  - path in both, same result          → take either (clean)
  - path in both, different results    → Conflict
```

### 6.3 Line-level three-way merge

When both sides modified the same string under `line` strategy:

- Run line-level diff3 on `(base, ours, theirs)` texts
- Non-overlapping hunks merge cleanly — both edits applied
- Overlapping hunks → one `Conflict` with `kind: "line"`, `hunks: { ours, theirs }`
- The merged string at `result.merged[path]` contains the **ours** version by default; `toGitMarkers` is what produces the `<<<<<<<` form

### 6.4 Array merge

With `arrayId` configured for a path:

- Match items by id across base/ours/theirs
- Item in ours only / theirs only → insert
- Item deleted in ours, modified in theirs (or vice-versa) → `kind: "delete-modify"` conflict
- Item modified on both sides → recurse into 3-way merge on that item

Without `arrayId`, arrays fall back to **whole-array replace** on any change. This is deliberately conservative — silent index-based merging produces nasty divergences.

### 6.5 Edge cases

| Case | Behavior |
|------|----------|
| Both sides make the same change | Clean merge |
| Type change (string → number) | Conflict, `kind: "value"` |
| Both sides add same key with different values | Conflict, `kind: "value"`, `base: undefined` |
| `null` vs. `undefined` at same path | Treated as equal for merge; diff preserves whichever is present |
| Circular references | Throw `VersioningError` at diff time |
| Non-JSON values (Date, Map, Set, functions) | Engine operates on JSON; adapters handle (de)serialization. `CoreModelAdapter` uses `model.toStoredJSON()`. |

### 6.6 Determinism

Given identical `(base, ours, theirs, cfg)`, `merge3` must produce byte-identical output. Tested explicitly via property test. Required for distributed replication where two nodes must agree when running the same merge independently.

## 7. Testing strategy

**Framework:** Vitest (monorepo standard).

### 7.1 Unit tests

One spec per `src/` module, colocated under `test/` mirroring the source tree:

- `engine/diff.spec.ts`, `engine/patch.spec.ts`, `engine/merge.spec.ts`
- `strings/strategy.spec.ts`, `strings/line-diff.spec.ts`
- `conflicts/resolve.spec.ts`, `conflicts/markers.spec.ts`
- `adapters/*.spec.ts`

### 7.2 Property-based tests (`fast-check`)

- **Round-trip:** `∀ a, b. patch(a, diff(a, b)) ≡ b`
- **Reverse:** `∀ a, b. patch(b, reverse(diff(a, b))) ≡ a`
- **Identity merge:** `∀ x. merge3(x, x, x) ≡ { merged: x, clean: true }`
- **Symmetry:** `merge3(base, ours, theirs).merged ≡ merge3(base, theirs, ours).merged` when clean; symmetric conflict sets otherwise
- **Idempotent resolution:** `resolve(resolve(r, m), m) ≡ resolve(r, m)`
- **Determinism:** identical inputs → byte-identical output

### 7.3 Scenario tests

Hand-picked cases that read like documentation:

- "Two users edit different fields" → clean merge
- "Two users edit the same line of `description`" → line conflict with `hunks`
- "One user deletes, other edits" → `delete-modify` conflict
- "Git-marker round-trip" — `toGitMarkers` → edit → `fromGitMarkers` resolves the conflict set

### 7.4 Adapter tests

`CoreModelAdapter` is tested with an in-memory `CoreModel` + `MemoryStore`, using `WebdaTest` and `@testWrapper` per the monorepo testing guidelines. Adapter tests live behind an optional import so the engine's test run does not require `@webda/core`.

### 7.5 Coverage target

90%+ lines. Property tests compensate for combinatorial cases coverage metrics do not measure.

### 7.6 Explicit non-goals

We do not test `jsondiffpatch`'s internals. We test the contract of our wrappers — that the delta format, string-strategy pathway, and 3-way merge behave as specified.

## 8. Open questions

None as of approval. Extension points (char strategy, persistent history, CRDT convergence) are framed in scope above and do not require design changes to land.
