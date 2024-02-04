---
sidebar_label: "@webda/amqp"
---
# amqp

Pub/Sub and Queue implementation using amqp protocol.
You can use it with RabbitMQ or any other AMQP compatible server.

## Usage

```json
{
  "services": {
    "queue": {
      "type": "AMQPQueue",
      "endpoint": "amqp://localhost:5672",
      "queue": "webda-test",
      "maxConsumers": 1
    },
    "pubsub": {
      "type": "AMQPPubSub",
      "endpoint": "amqp://localhost:5672",
      "channel": "webda-test-pub",
      "maxConsumers": 1
    }
  }
}
```
