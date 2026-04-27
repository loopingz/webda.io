# @webda/amqp module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/amqp

> RabbitMQ-backed Queue and Pub/Sub services for Webda — drop-in replacements for in-memory transports when you need durable, cross-process messaging.

## When to use it

- You need a durable task queue backed by RabbitMQ (or any AMQP 0-9-1 broker).
- You need fan-out pub/sub across multiple Webda instances via AMQP exchanges.
- You are replacing `MemoryQueue` / `MemoryPubSub` in a production deployment.

## Install

```bash
pnpm add @webda/amqp
```

## Configuration

### AMQPQueue

```json
{
  "services": {
    "taskQueue": {
      "type": "AMQPQueue",
      "url": "amqp://localhost:5672",
      "queue": "my-tasks"
    }
  }
}
```

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `url` | string | — | Yes | AMQP broker connection URL (e.g. `amqp://user:pass@host:5672`) |
| `queue` | string | — | Yes | Name of the AMQP queue to assert and consume |
| `queueOptions` | object | — | No | Options forwarded to `channel.assertQueue()` (e.g. `{ durable: true }`) |

### AMQPPubSubService

```json
{
  "services": {
    "eventBus": {
      "type": "AMQPPubSub",
      "url": "amqp://localhost:5672",
      "channel": "my-events",
      "exchange": { "type": "fanout", "durable": true }
    }
  }
}
```

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `url` | string | — | Yes | AMQP broker connection URL |
| `channel` | string | — | Yes | Exchange name to publish/subscribe to |
| `subscription` | string | `""` | No | Subscription queue name (auto-generated exclusive queue if empty) |
| `exchange.type` | string | `"fanout"` | No | Exchange type (`fanout`, `direct`, `topic`, `headers`) |
| `exchange.durable` | boolean | `true` | No | Survive broker restarts |
| `exchange.autoDelete` | boolean | `false` | No | Delete when last binding is removed |

## Usage

```typescript
import { Queue } from "@webda/core";
import { Service } from "@webda/core";
import { Bean, Inject } from "@webda/core";

@Bean
export class OrderService extends Service {
  @Inject("taskQueue")
  queue: Queue<{ orderId: string }>;

  async placeOrder(orderId: string): Promise<void> {
    // Publish a task to RabbitMQ
    await this.queue.sendMessage({ orderId });
  }
}

// Consumer side: start a queue worker via AsyncJobService or
// by calling queue.consume(async (msg) => { ... })
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/amqp/`.
- Source: [`packages/amqp`](https://github.com/loopingz/webda.io/tree/main/packages/amqp)
- Related: [`@webda/core`](../core) for the `Queue` and `PubSubService` base classes, [`@webda/async`](../async) for job orchestration on top of a queue.

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
