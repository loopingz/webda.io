# @webda/workout module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/workout

> Structured logging and terminal interaction framework for Webda — `useLog()` for structured log emission, progress indicators, grouped output, `MemoryLogger` for test capture, and scoped log-level overrides via `AsyncLocalStorage`.

## When to use it

- You need a structured logging abstraction that works identically in console, file, test (memory), and terminal modes without changing call sites.
- You want async-context-scoped log level overrides (`useLogLevel("DEBUG", async () => {...})`) that propagate through timers and callbacks.
- You need progress indicators or user prompts in CLI tools built on Webda.

## Install

```bash
pnpm add @webda/workout
```

## Configuration

`@webda/workout` is a pure library — no `webda.config.json` entry required. Initialize a logger backend once at startup; use `useLog()` everywhere else.

Set the default log level via environment:

```bash
LOG_LEVEL=DEBUG node your-app.js
```

| Log level | Priority |
|---|---|
| `ERROR` | Highest |
| `WARN` | |
| `INFO` | Default |
| `DEBUG` | |
| `TRACE` | Lowest |

## Usage

```typescript
import { useLog, useLogLevel, useWorkerOutput, ConsoleLogger, MemoryLogger } from "@webda/workout";

// Initialize a logger backend once (e.g. in your app entry point)
const output = useWorkerOutput();
new ConsoleLogger(output, "INFO"); // logs go to stdout with colors

// Log from anywhere — no reference to output needed
useLog("INFO", "Server started", { port: 18080 });
// → [INFO] Server started { port: 18080 }

useLog("ERROR", "Store connection failed", new Error("ECONNREFUSED"));
// → [ERROR] Store connection failed Error: ECONNREFUSED

// Scoped log level override (uses AsyncLocalStorage — propagates through async code)
await useLogLevel("DEBUG", async () => {
  useLog("DEBUG", "Detailed trace", { query: "SELECT *" }); // visible
  await runQuery();
});
// Back to INFO level here — DEBUG no longer visible

// Progress indicators
output.startActivity("Deploying");
await deploy();
output.stopActivity("success", "Deployed");

output.startProgress("upload", 100, "Uploading files");
for (let i = 1; i <= 100; i++) {
  output.updateProgress(i, "upload", `File ${i}/100`);
}

// Memory logger for tests — captures all log lines
const mem = new MemoryLogger(output);
useLog("WARN", "test warning");
const lines = mem.getLogs(); // [{ level: "WARN", args: ["test warning"] }]
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/workout/`.
- Source: [`packages/workout`](https://github.com/loopingz/webda.io/tree/main/packages/workout)
- Related: [`@webda/otel`](../otel) which exports workout logs to an OTLP collector; [`@webda/debug`](../debug) which buffers workout logs for the debug dashboard; [`@webda/test`](../test) which uses `MemoryLogger` to capture logs on test failure.

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
