---
sidebar_label: "@webda/debug"
---
# debug

# @webda/debug

> Development debug server for Webda — live request log, real-time WebSocket event feed, log buffer, and an introspection API to inspect models, routes, services, and operations while `webda debug` is running.

## When to use it

- You are running `webda debug` locally and want a dashboard that shows incoming HTTP requests, live logs, and application structure in real time.
- You need programmatic access to the Webda application's routes, models, services, and operations via an HTTP introspection API during development.
- You want structured request tracing (method, URL, status, duration) without adding production observability overhead.

## Install

```bash
pnpm add @webda/debug
```

## Configuration

```json
{
  "services": {
    "debugService": {
      "type": "DebugService"
    }
  }
}
```

`DebugService` listens on port **18181** by default. No additional parameters are required for basic use — the service auto-wires to core events on `resolve()`.

## Usage

```typescript
// Typically you don't instantiate DebugService directly.
// It is auto-registered when you run:
//   webda debug
//
// The service exposes:
//   GET  http://localhost:18181/         → Serves the built-in debug web UI
//   GET  http://localhost:18181/api/...  → Introspection endpoints:
//     /api/routes     — registered routes
//     /api/models     — model definitions
//     /api/services   — active services
//     /api/operations — registered operations
//     /api/config     — resolved configuration
//   WS   ws://localhost:18181/ws         → Live event push (requests + logs)

// To manually start the debug server in tests:
import { DebugService } from "@webda/debug";
import { Core } from "@webda/core";

const debug = await new DebugService(Core.get(), "debugService").resolve().init();
// Connects to port 18181 — open http://localhost:18181 in a browser
await debug.stop();
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/debug/`.
- Source: [`packages/debug`](https://github.com/loopingz/webda.io/tree/main/packages/debug)
- Related: [`@webda/otel`](_media/otel) for production-grade OpenTelemetry tracing; [`@webda/workout`](_media/workout) for the logging system whose output this service buffers.
