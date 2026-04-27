# @webda/cloudevents module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/cloudevents

> CloudEvents v1.0 producer and consumer utilities for Webda — validate, emit, and subscribe to CloudEvents over HTTP or AMQP transports, with a store-backed subscription model.

## When to use it

- You need to publish events from a Webda store save/update as CloudEvents to an external sink (webhook, AMQP broker, MQTT).
- You want to receive and validate incoming CloudEvents from third-party producers.
- You are building an event-driven integration that must conform to the CNCF CloudEvents v1.0 specification.

## Install

```bash
pnpm add @webda/cloudevents
```

## Configuration

`@webda/cloudevents` exports model and utility classes — it does not register a service bean with the Webda DI container. Wire it up by using the exported `CloudEvent`, `Subscription`, and `isCloudEvent` helpers directly in a custom service.

## Usage

```typescript
import { isCloudEvent } from "@webda/cloudevents";
import { CloudEvent, emitterFor, httpTransport } from "cloudevents";
import { Subscription } from "@webda/cloudevents";

// Validate an incoming payload
const body = await ctx.getRequestBody();
if (!isCloudEvent(body, true /* strict */)) {
  throw new Error("Invalid CloudEvent");
}

// Publish a CloudEvent via HTTP to an external sink
const event = new CloudEvent({
  type: "com.myapp.order.created",
  source: "/orders",
  data: { orderId: "abc-123" }
});
const emit = emitterFor(httpTransport("https://sink.example.com/events"));
await emit(event);

// Use a Subscription model to persist a subscriber's endpoint
const sub = new Subscription();
sub.sink = "https://receiver.example.com/hook";
sub.types = ["com.myapp.order.created"];
await sub.save();
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/cloudevents/`.
- Source: [`packages/cloudevents`](https://github.com/loopingz/webda.io/tree/main/packages/cloudevents)
- Related: [`@webda/amqp`](../amqp) for AMQP-based event delivery; [`@webda/core`](../core) for the base `CoreModel` and store integration; [cloudevents SDK](https://github.com/cloudevents/sdk-javascript) which this package builds on.

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
