# @webda/debug module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

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
- Related: [`@webda/otel`](../otel) for production-grade OpenTelemetry tracing; [`@webda/workout`](../workout) for the logging system whose output this service buffers.

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
