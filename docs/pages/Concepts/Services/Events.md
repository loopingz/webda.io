# Events

The framework does not use the EventEmitter for events since v4.

We aligned on CloudEvents and its subscription system to allow easier integration with other systems.

To emit an event, just define the event as a class and use its `emit` method.
If you await the method then you will wait for its delivery and local listeners to be processed.

To listen to an event you can use the `on`.

Subscription must be named from your service, this allows it to be overriden by configuration to execute asynchronously.

```
emit -> @Emits()
on(name: string, event: string | Subscription , callback: async () => {})
```

Local -> execute within current node process
PubSub -> execute on all nodes within the cluster
Queue -> execute once by some workers

EventService->worker(...subscription: string) -> if Queue subscription
EventService->init() -> will sub to all PubSub/Local on startup
