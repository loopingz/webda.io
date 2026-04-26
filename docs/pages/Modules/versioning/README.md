---
sidebar_label: "@webda/versioning"
---
# versioning
**@webda/versioning**

***

# @webda/versioning

Diff, patch, and 3-way merge for JSON-serializable objects — with adaptive
string strategies (single-value replace vs. line-based unified diff) and
git-style conflict resolution.

## Install

```bash
pnpm add @webda/versioning
```

## Quick start

```ts
import { diff, patch, merge3, resolve } from "@webda/versioning";

// 2-way diff / patch
const d = diff({ title: "old" }, { title: "new" });
patch({ title: "old" }, d); // → { title: "new" }

// 3-way merge
const r = merge3(
  { body: "a\nb\nc\n" },
  { body: "a\nOURS\nc\n" },
  { body: "a\nTHEIRS\nc\n" }
);
// r.clean === false
// r.conflicts[0].kind === "line"

// Programmatic resolution
const final = resolve(r, new Map([["/body", { choose: "ours" }]]));
// final.clean === true
```

## Configuration

```ts
import { merge3, type VersioningConfig } from "@webda/versioning";

const cfg: VersioningConfig = {
  // Force line-strategy for specific paths
  stringStrategy: { "/description": "line", "/title": "replace" },
  // Identify array items by a key for move/insert/delete detection
  arrayId: { "/items": "uuid", "/tags": "name" }
};

const r = merge3(base, ours, theirs, cfg);
```

## Git-marker workflow

For text-editor-driven conflict resolution:

```ts
import { merge3, toGitMarkers, fromGitMarkers } from "@webda/versioning";

const r = merge3(base, ours, theirs);
const withMarkers = toGitMarkers(r);
//   string conflicts: inline <<<<<<< / ======= / >>>>>>>
//   non-string conflicts: { __conflict: true, base, ours, theirs } sentinels

const edited = await openInEditor(withMarkers);
const final = fromGitMarkers(edited, r);
//   final.clean === true if all markers/sentinels were resolved
```

## CoreModel adapter (optional)

For webda `CoreModel` / `UuidModel` subclasses:

```ts
import { CoreModelAdapter } from "@webda/versioning/coremodel";

const r = CoreModelAdapter.merge3(baseModel, oursModel, theirsModel);
```

Requires `@webda/core` or `@webda/models` as a peer dep (optional).

## Design

See [DESIGN.md](_media/DESIGN.md) for the full design spec.

## License

LGPL-3.0-only
