# @webda/utils module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@webda/utils)](https://www.npmjs.com/package/@webda/utils)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

> Common utility library for Node.js — `Throttler` for concurrent promise queues, `Duration` for human-readable time parsing, `FileUtils`/`JSONUtils`/`YAMLUtils` for filesystem and config helpers, `Debounce`, `WaitFor`, and more.

## When to use it

- You need to limit concurrency when processing a large batch of async operations without complex queue setup.
- You need to parse human-readable durations (`"5m"`, `"2h30m"`) into milliseconds in configuration or CLI flags.
- You need reliable file I/O with support for JSON, JSONC, and YAML in one consistent API.

## Install

```bash
pnpm add @webda/utils
```

## Configuration

`@webda/utils` is a pure library — no `webda.config.json` entry required.

## Usage

```typescript
import { Throttler, Duration } from "@webda/utils";
import { FileUtils, JSONUtils } from "@webda/utils";

// Throttler — run at most N promises concurrently
const throttler = new Throttler(5 /* concurrency */);

const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
await Promise.all(ids.map(id => throttler.queue(async () => processItem(id), id)));
await throttler.wait();
// At most 5 processItem() calls were running at any point in time

// Duration — parse human-readable time strings (a plain number is seconds)
const ms = new Duration("2m30s").toMs();     // → 150000
const secs = new Duration("1h").toSeconds(); // → 3600

// FileUtils — load JSON, JSONC, or YAML transparently
const config = FileUtils.load("./webda.config.jsonc");  // plain data, comments ignored
const data = JSONUtils.loadFile("./data.json");

// Opt into edit mode when saving JSONC back with its comments and formatting
const editable = FileUtils.load("./webda.config.jsonc", undefined, { edit: true });
editable.parameters.port = 8080;
FileUtils.save(editable, "./webda.config.jsonc");
// Also available as JSONUtils.loadFile(filename, { edit: true })
// and JSONUtils.parse(source, { edit: true }).

// JSONUtils.sortObject — copy with sorted keys
const sorted = JSONUtils.sortObject({ b: 2, a: 1 });
// { a: 1, b: 2 }

// WaitFor — poll until a condition is met with backoff
import { WaitFor, WaitLinearDelay } from "@webda/utils";
await WaitFor(async () => {
  const status = await checkDeploymentStatus();
  return status === "COMPLETE";
}, 150 /* retries */, "deployment", undefined, WaitLinearDelay(200));
```

JSONC loading and parsing now return plain objects and arrays by default. Code that
edits a JSONC file and saves it back must pass `{ edit: true }` to retain comments
and formatting. YAML loading is unchanged.

### TypeScript utility types

`@webda/utils` also holds the shared types and helpers that used to live in `@webda/tsc-esm`:

```typescript
import type { Attributes, DeepPartial, FilterAttributes, Merge } from "@webda/utils";
import { NotEnumerable, isMainModule } from "@webda/utils";

class Session {
  // Kept out of enumeration, so it is skipped by JSON serialisation and Object.keys
  @NotEnumerable
  dirty: boolean;
}

type SessionAttributes = Attributes<Session>; // every non-method key
```

- **Types** — `Attributes`, `Methods`, `FilterAttributes`, `FilterOutAttributes`, `PickByType`,
  `OmitByType`, `OmitByTypeRecursive`, `DeepPartial`, `Merge`, `SetOptional`, `ReadonlyKeys`,
  `IsUnion`, `ArrayElement` and the `Constructor` family.
- **Helpers** — `NotEnumerable`, `StaticInterface`, `assertUnreachable`, and the Node-only
  `isMainModule` and `getFileName`.

The decorator factories `createClassDecorator`, `createPropertyDecorator` and
`createMethodDecorator` come from `@webda/decorators`.

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/utils/`.
- Source: [`packages/utils`](https://github.com/loopingz/webda.io/tree/main/packages/utils)
- Related: [`@webda/core`](../core) which re-exports many of these utilities; [`@webda/workout`](../workout) for logging utilities used alongside these helpers.

<!-- README_FOOTER -->

## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://webda.io/img/sponsors/arize.svg" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://webda.io/img/sponsors/loopingz.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://webda.io/img/sponsors/tellae.svg" width="200">](https://tellae.fr)
