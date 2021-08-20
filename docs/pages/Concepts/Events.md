# Events

The framework use the EventEmitter for events.

`emit()` this will not wait for any promise returned by listeners

`emitSync()` this will wait for resolution on all promises returned by listeners

We also have a mechanism to listen asynchronously to events. They will then be posted to a Queue for them
to be consumed through a `AsyncEvent.worker()`

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

### Store.Save

### Store.Saved

### Store.Update

### Store.Updated

### Store.PartialUpdate

### Store.PArtialUpdated

### Store.Delete

### Store.Deleted

### Store.Get

### Store.Find

### Store.Found

### Store.WebCreate

### Store.WebUpdate

### Store.WebGet

### Store.WebDelete

### Store.Action

### Store.Actionned

