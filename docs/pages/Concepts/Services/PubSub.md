# PubSub

Webda offer an abstraction to publish/subscribe system: `PubSubService`.

A message sent is delivered to every subscriber. Queues are built on top of it, a queue message is consumed by one worker only, see [Queues](./Queues.md).

## Current implementation

- GCP PubSub
- RabbitMQ
- Azure Service Bus
- PostgreSQL
- Knative Broker (CloudEvents)
- Socket (`@webda/fs`)
