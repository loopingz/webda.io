---
sidebar_label: "@webda/workout"
---
# workout

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
- Related: [`@webda/otel`](_media/otel) which exports workout logs to an OTLP collector; [`@webda/debug`](_media/debug) which buffers workout logs for the debug dashboard; [`@webda/test`](_media/test) which uses `MemoryLogger` to capture logs on test failure.
