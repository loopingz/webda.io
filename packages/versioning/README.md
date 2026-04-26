# @webda/versioning module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

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

See [DESIGN.md](./DESIGN.md) for the full design spec.

## License

LGPL-3.0-only

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
