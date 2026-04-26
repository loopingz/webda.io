# @webda/versioning module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

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
- Related: [`@webda/core`](../core) for the `CoreModel` that this package can diff/merge; [`@webda/serialize`](../serialize) for round-tripping complex model instances through JSON.

<!-- README_FOOTER -->
## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
