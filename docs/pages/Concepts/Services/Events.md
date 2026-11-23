# Events

Webda uses EventEmitter to connect services through named events and payloads.

`Service.emit()` returns a Promise resolved once all the promises returned by listeners are resolved: await it to wait for the listeners, or ignore it. (`emitCoreEvent()` is fire-and-forget and returns `void`.)

## When to use events

Use direct listeners for work in the current process. Use the `AsyncEvents` service from `@webda/async` to send work through a queue and process it with a worker.

## Before you begin

For queued delivery, configure a queue in `AsyncEvents`, register your callbacks with `bindAsyncListener()`, and run a worker that registers the matching callbacks.

## Queued delivery

import ServiceEvents from "@site/src/components/ServiceEvents";

<ServiceEvents />

:::info Completion boundary
For an asynchronous listener, `await service.emit(...)` waits for the queue-send promise, not for the original callback to finish. The worker consumes the event, restores its payload, and awaits the registered callbacks.
:::

## Core event reference

### `Webda.Init.Services`

Emitted by `Core.init()` with `this.services` once all services have been initialized. (Note: `Webda.Init` and `Webda.Create.Services` exist in `CoreEvents` types for legacy reasons but are not emitted by `Core`.)

### `Webda.NewContext`

Emitted when `HttpServer` creates a new request context (`{ context }`).

### `Webda.Request`

Emitted before a request handler runs (`{ context }`).

### `Webda.Result`

Emitted after a request handler finishes (`{ context }`).

### `Webda.404`

Emitted by `Router` when no route matches (`{ context }`).

### Models events

Model persistence events are the typed Repository events (`Created`, `Updated`, `Patched`, `Deleted`, `PartialUpdated`...), see [Repositories](../Stores/Repositories.md#events). The aggregate `Store.*` events are internal.

## Next steps

- [Create your first service](../../QuickStart/FirstService.md).
- [Review the service lifecycle](./Services.md#lifecycle).
- [Listen to repository events](../Stores/Repositories.md#events).
