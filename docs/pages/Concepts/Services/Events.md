# Events

The framework use the EventEmitter for events.

`emit()` returns a Promise resolved once all the promises returned by listeners are resolved: await it to wait for the listeners, or ignore it

We also have a mechanism to listen asynchronously to events (`AsyncEvents` service of `@webda/async`). They will then be posted to a Queue for them
to be consumed through its `worker()`

```mermaid
sequenceDiagram
	participant S as Service
	participant As as AsyncEventService
	participant Q as Queue
    participant Aw as AsyncEventService Worker
    As->>S: Bind event to a sendQueue listener
	activate As
	S->>As: Emit event
    As->>Q: Push the event to the queue
	deactivate As
	Aw->>Q: Consume queue
	Aw->>Aw: Call the original listener
```

### Webda.Init

### Webda.Init.Services

### Webda.Create.Services

### Webda.NewContext

### Webda.Request

### Models events

Model persistence events are the typed Repository events (`Created`, `Updated`, `Patched`, `Deleted`, `PartialUpdated`...), see [Repositories](../Stores/Repositories.md#events). The aggregate `Store.*` events are internal.
