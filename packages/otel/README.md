# @webda/otel module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

> OpenTelemetry integration for Webda — exports traces, metrics, and logs to any OTLP-compatible backend (Jaeger, Prometheus, Grafana, Datadog, etc.) with zero instrumentation code.

## When to use it

- You want distributed tracing across Webda HTTP requests, store operations, and queue workers without manual span management.
- You need to export metrics (request counts, durations) and structured logs to an OpenTelemetry collector.
- You are deploying on a platform with OpenTelemetry support (GCP, AWS ADOT, Grafana Cloud, Datadog).

## Install

```bash
pnpm add @webda/otel
```

## Configuration

```json
{
  "services": {
    "otel": {
      "type": "OtelService",
      "name": "my-webda-app",
      "traceExporter": {
        "type": "otlp",
        "enable": true,
        "sampling": 0.1
      },
      "metricExporter": {
        "type": "otlp",
        "enable": true
      },
      "loggerExporter": {
        "enable": true,
        "type": "otlp",
        "url": "http://otel-collector:4317"
      }
    }
  }
}
```

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `name` | string | app name | No | Service name reported to OTLP as `service.name` |
| `traceExporter.type` | `"otlp"` \| `"console"` | `"otlp"` | No | Trace export destination |
| `traceExporter.enable` | boolean | `true` | No | Enable/disable trace exporting |
| `traceExporter.sampling` | number | `0.01` | No | Trace sampling rate (0.0–1.0) |
| `metricExporter.type` | `"otlp"` \| `"console"` | `"otlp"` | No | Metric export destination |
| `metricExporter.enable` | boolean | `true` | No | Enable/disable metric exporting |
| `loggerExporter.enable` | boolean | `true` | No | Enable/disable log exporting |
| `loggerExporter.url` | string | `"http://localhost:4317"` | No | OTLP gRPC endpoint for log export |
| `diagnostic` | string | `"NONE"` | No | OTel SDK diagnostic level: `NONE`, `ERROR`, `WARN`, `INFO`, `DEBUG`, `ALL` |
| `webTracing.allowedEmails` | string[] | `[]` | No | Emails allowed to enable web tracing, regular expressions matching the whole email (`"*"`: any authenticated user). Empty: nobody |
| `webTracing.duration` | number | `900` | No | Trace token lifetime in seconds |
| `trustedTraceSources` | string[] | `[]` | No | IPs or CIDRs whose `traceparent` and `baggage` are always honored |

## Request tracing

Webda starts the server span of every request itself (HTTP/1.1, HTTP/2, h2c and gRPC; the incoming spans of the
HTTP instrumentation are disabled) and records `http.server.request.duration` (seconds) or `rpc.server.duration`
(milliseconds) for every request, traced or not.

An outside caller cannot force sampling or inject baggage. The incoming W3C `traceparent` and `baggage` are honored
only in these cases:

| Request | `traceparent` | `baggage` | Span `session.id` |
|---|---|---|---|
| From a `trustedTraceSources` address | honored (sampled flag too) | honored, propagated | from baggage if present |
| Valid, unexpired `X-Webda-Trace` token | trace and parent ids honored, always recorded (an unsampled parent is treated as sampled); none or invalid: a new root, always recorded | honored, propagated, `session.id` rewritten to the token session | token session |
| Anything else (including an invalid or expired token) | ignored: new root, `sampling` ratio | dropped | none |

The client address is the one `HttpServer` resolves through its `trustedProxies`. `X-Webda-Trace` is never sent on
outgoing calls; `traceparent`, `tracestate` and `baggage` are, and are allowed on cross-origin requests.

### On-demand web tracing

An allowed user (`webTracing.allowedEmails`, or override `canEnableWebTracing`) calls the `Otel.EnableWebTracing`
operation:

```http
POST /otel/tracing
{ "sessionId": "optional-session-to-join" }
```

It answers `{ token, sessionId, expiresAt }`. The browser then sends `X-Webda-Trace: <token>`, a sampled
`traceparent` and `baggage: session.id=<sessionId>` on its requests: every span of those requests carries
`session.id`, so one session can be searched in the tracing backend. The token is signed with the application keys
for the `webda-trace` audience: it is not a session token.

### Profiling

Continuous profiling is not done in process: run the OpenTelemetry collector eBPF profiler next to the application
to export OTLP profiles, and correlate them with these traces.

## Usage

```typescript
// No code changes needed — add the service to webda.config.json and it
// auto-instruments HTTP requests, MongoDB, and other supported libraries
// via @opentelemetry/auto-instrumentations-node.

// To instrument custom code, use the OpenTelemetry API directly:
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("my-service");

async function expensiveOperation(): Promise<void> {
  const span = tracer.startSpan("expensiveOperation");
  try {
    // ... work
  } finally {
    span.end();
  }
}

// Logs from @webda/workout are automatically forwarded to the OTLP log exporter
// when loggerExporter is enabled — no extra code needed.
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/otel/`.
- Source: [`packages/otel`](https://github.com/loopingz/webda.io/tree/main/packages/otel)
- Related: [`@webda/workout`](../workout) for the Webda logging system whose output this module exports; [`@webda/debug`](../debug) for local development tracing without an OTLP backend.

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
