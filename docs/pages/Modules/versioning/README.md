---
sidebar_label: "@webda/versioning"
---
# versioning

# @webda/versioning

> Diff, patch, and 3-way merge for JSON-serializable objects — adaptive string strategies, array identity tracking, and git-style conflict markers for collaborative model editing.

## When to use it

- You need to compute a diff between two versions of a Webda model and apply it as an incremental patch.
- You need 3-way merge for collaborative editing where two users modified the same object concurrently.
- You want to show git-style `<<<<<<<` / `=======` / `>>>>>>>` conflict markers to users for manual resolution.

## Install

```bash
pnpm add @webda/versioning
```

## Configuration

`@webda/versioning` is a pure library — no `webda.config.json` entry required. Configure per-call via `VersioningConfig`.

| Config option | Type | Description |
|---|---|---|
| `stringStrategy` | `Record<path, "line" \| "replace">` | Override the string diff strategy per JSON pointer path |
| `arrayId` | `Record<path, string>` | Field name used to identify array items by identity (enables move/insert/delete detection) |

## Usage

```typescript
import { diff, patch, merge3, resolve } from "@webda/versioning";
import type { VersioningConfig } from "@webda/versioning";

// 2-way diff and patch
const base = { title: "Hello", body: "First draft\nSecond line\n" };
const updated = { title: "Hello World", body: "First draft\nEdited line\n" };

const delta = diff(base, updated);
// delta describes what changed: title replacement, body line edit

const result = patch(base, delta);
// result === updated

// 3-way merge (base + two concurrent edits)
const ours = { title: "Hello World", body: "First draft\nOUR edit\n" };
const theirs = { title: "Hello", body: "First draft\nTHEIR edit\n" };

const mergeResult = merge3(base, ours, theirs);
// mergeResult.clean === false (conflict in body)
// mergeResult.conflicts[0].kind === "line"

// Programmatic resolution
const final = resolve(mergeResult, new Map([["/body", { choose: "ours" }]]));
// final.clean === true

// Git-marker workflow for editor-driven resolution
import { toGitMarkers, fromGitMarkers } from "@webda/versioning";

const withMarkers = toGitMarkers(mergeResult);
// Conflicts shown as: <<<<<<< / ======= / >>>>>>>
const edited = await openInEditor(withMarkers);
const resolved = fromGitMarkers(edited, mergeResult);

// CoreModel adapter (optional)
import { CoreModelAdapter } from "@webda/versioning/adapters/coremodel";

const r = CoreModelAdapter.merge3(baseModel, oursModel, theirsModel);
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/versioning/`.
- Source: [`packages/versioning`](https://github.com/loopingz/webda.io/tree/main/packages/versioning)
- Related: [`@webda/core`](_media/core) for the `CoreModel` that this package can diff/merge; [`@webda/serialize`](_media/serialize) for round-tripping complex model instances through JSON.
