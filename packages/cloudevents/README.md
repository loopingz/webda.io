# @webda/cloudevents module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

> CloudEvents v1.0 producer and consumer utilities for Webda — receive CloudEvents over HTTP (`CloudEventsReceiver`), publish and consume through a Knative Eventing Broker (`KnativeBrokerPubSub`), validate, emit and subscribe with a store-backed subscription model.

## When to use it

- You need to publish events from a Webda store save/update as CloudEvents to an external sink (webhook, AMQP broker, MQTT).
- You want to receive and validate incoming CloudEvents from third-party producers, or from a Knative `Trigger`.
- You deploy on Knative and want a `PubSubService` backed by its Broker.
- You are building an event-driven integration that must conform to the CNCF CloudEvents v1.0 specification.

## Install

```bash
pnpm add @webda/cloudevents
```

## Configuration

The module registers two services; the `CloudEvent`, `Subscription`, filters and `isCloudEvent` helpers are also exported for custom services.

```jsonc title="webda.config.jsonc"
{
  "services": {
    "CloudEventsReceiver": {
      "type": "Webda/CloudEventsReceiver",
      "url": "/cloudevents",
      "strict": false,
      "filters": [{ "prefix": { "type": "com.acme." } }],
      "dedupe": true
    },
    "Events": {
      "type": "Webda/KnativeBrokerPubSub",
      "namespace": "apps",
      "broker": "default",
      "receiver": "CloudEventsReceiver"
    }
  }
}
```

### `Webda/CloudEventsReceiver`

A `POST` route receiving CloudEvents in the binary (`ce-*` headers), structured (`application/cloudevents+json`) and batch (`application/cloudevents-batch+json`) HTTP content modes, dispatched to handlers registered by exact `type` or predicate.

| Parameter    | Default        | Description                                                                                                                          |
| ------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `url`        | `/cloudevents` | Path of the route                                                                                                                    |
| `strict`     | `false`        | `specversion` must be `1.0`, required attributes non-empty, `time` RFC3339, plus the SDK schema (`dataschema` URI, ...)              |
| `filters`    | —              | CloudEvents Subscriptions filters (`exact`, `prefix`, `suffix`, `all`, `any`, `sql`), non-matching events are acknowledged unhandled |
| `dedupe`     | `false`        | Acknowledge an event already handled with the same `source` and `id` (in-memory, per replica)                                        |
| `dedupeTtl`  | `3600000`      | Milliseconds an entry is remembered                                                                                                  |
| `dedupeSize` | `10000`        | Entries kept, the oldest are evicted                                                                                                 |

Response contract: `202` acknowledges (`200` with the reply CloudEvent when a handler returns one), `400` refuses a malformed or invalid event (no retry), `500` when a handler throws (the sender retries; a thrown `WebdaError.HttpError` keeps its status). Delivery is at-least-once: keep the handlers idempotent. The `CloudEvents.Received`, `CloudEvents.Handled` and `CloudEvents.Failed` events are emitted around the dispatch.

### `Webda/KnativeBrokerPubSub`

A `PubSubService<CloudEvent>` on a Knative Eventing Broker: `sendMessage` posts the event to `brokerUrl` (`http://broker-ingress.knative-eventing.svc.cluster.local/<namespace>/<broker>`, with `headers` and `timeout`) and fails on a non-2xx answer; `consume` registers on the `receiver` (`CloudEventsReceiver`) since Knative pushes through a `Trigger` (see `Webda/KnativeDeployer` `triggers`); `size()` is unsupported and returns 0.

## Usage

```typescript
import {
  CloudEventHandler,
  CloudEventsReceiver,
  isCloudEvent,
  KnativeBrokerPubSub,
  Subscription
} from "@webda/cloudevents";
import { CloudEvent, emitterFor, httpTransport } from "cloudevents";

// Handle a type on any service: discovered by the receiver when it initializes
class Orders extends Service {
  @CloudEventHandler("com.acme.order.created")
  async onCreated(event: CloudEvent<Order>) {
    // A returned CloudEvent is the reply, a thrown error answers 500 (retried)
  }
}

// Or register at runtime, by type or predicate; the returned function unsubscribes
useService<CloudEventsReceiver>("CloudEventsReceiver").subscribe(
  event => event.type.startsWith("com.acme."),
  async event => {}
);

// Publish to the Knative Broker
await useService<KnativeBrokerPubSub>("Events").sendMessage(
  new CloudEvent({ type: "com.acme.order.created", source: "/orders", data: { id } })
);

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

[<img src="https://webda.io/img/sponsors/arize.svg" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://webda.io/img/sponsors/loopingz.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://webda.io/img/sponsors/tellae.svg" width="200">](https://tellae.fr)
