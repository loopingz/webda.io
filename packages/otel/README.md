# @webda/otel module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/otel

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

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
