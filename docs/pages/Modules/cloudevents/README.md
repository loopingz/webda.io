---
sidebar_label: "@webda/cloudevents"
---
# cloudevents

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
- Related: [`@webda/amqp`](_media/amqp) for AMQP-based event delivery; [`@webda/core`](_media/core) for the base `CoreModel` and store integration; [cloudevents SDK](https://github.com/cloudevents/sdk-javascript) which this package builds on.
