---
sidebar_label: "@webda/utils"
---
# utils

# @webda/utils

> Common utility library for Node.js — `Throttler` for concurrent promise queues, `Duration` for human-readable time parsing, `FileUtils`/`JSONUtils`/`YAMLUtils` for filesystem and config helpers, `Debounce`, `Waiter`, and more.

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
await throttler.waitForCompletion();
// At most 5 processItem() calls were running at any point in time

// Duration — parse human-readable time strings
const ms = Duration.parse("2m30s");  // → 150000
const ms2 = Duration.parse("1h");    // → 3600000
const label = Duration.format(90000); // → "1m30s"

// FileUtils — load JSON, JSONC, or YAML transparently
const config = FileUtils.load("./webda.config.jsonc");  // parses comments
const data = JSONUtils.load("./data.json");

// JSONUtils.stringify — pretty-print with sorted keys
const pretty = JSONUtils.stringify({ b: 2, a: 1 }, undefined, 2);
// { "a": 1, "b": 2 } — keys sorted

// Waiter — poll until a condition is met with backoff
import { Waiter } from "@webda/utils";
await new Waiter(async () => {
  const status = await checkDeploymentStatus();
  return status === "COMPLETE";
}, 200 /* pollMs */, 30000 /* timeoutMs */).wait();
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/utils/`.
- Source: [`packages/utils`](https://github.com/loopingz/webda.io/tree/main/packages/utils)
- Related: [`@webda/core`](_media/core) which re-exports many of these utilities; [`@webda/workout`](_media/workout) for logging utilities used alongside these helpers.
