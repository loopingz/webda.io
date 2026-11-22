---
sidebar_position: 4
sidebar_label: Subscriptions
---

# GraphQL Subscriptions

`@webda/graphql` supports **real-time subscriptions** over WebSocket using the `graphql-ws` protocol. Subscriptions are generated automatically for each model and deliver store lifecycle events (Create, Update, Delete, Patch) to connected clients.

## Transport: graphql-ws

The subscription server uses [`graphql-ws`](https://github.com/enisdenjo/graphql-ws) — the modern, actively maintained WebSocket subprotocol for GraphQL subscriptions. It runs on the same port as the HTTP/HTTPS server.

WebSocket connection URL:
- TLS: `wss://localhost:18080/graphql`
- Plain: `ws://localhost:18080/graphql`

## Configuration

Subscriptions are enabled by default. Control them via:

```json
{
  "services": {
    "GraphQLService": {
      "type": "Webda/GraphQLService",
      "globalSubscription": true
    }
  }
}
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `globalSubscription` | `true` | Expose `Aggregate` (type `AggregateSubscriptions`) — a single subscription combining all the others |

## Auto-generated subscriptions

For each model (e.g. `Post`), the service generates:

| Subscription | Description |
|-------------|-------------|
| `Post(slug: String)` | The Post, sent again when it changes |
| `Posts(query: String)` | The results of a WQL query, refreshed when Posts change |
| `PostsEvents` | Events for all Post instances |
| `PostEvents(slug: String)` | Events for a specific Post by primary key |

And with `globalSubscription: true`:

| Subscription | Description |
|-------------|-------------|
| `Aggregate` | Combined stream of the other subscriptions, selected as its fields |

## Event types

An events subscription has one field per event of the model (its `WEBDA_EVENTS`: `Created`, `Updated`, `Patched`, `Deleted`, …), plus `latestEventTime: Long`. Each event field is the `Object` JSON scalar carrying the event payload (`{ object_id, object }` for `Created`, `{ object_id }` for `Deleted`, …), so it has no sub-selection.

Select the events you want in your subscription query:

```graphql
subscription {
  PostsEvents {
    Created
    Updated
    Deleted
  }
}
```

## Subscribing to a specific object

```graphql
subscription {
  Post(slug: "hello-world") {
    slug title status viewCount
  }
}
```

## Aggregate subscription

With `globalSubscription: true`, a single subscription delivers events from all models:

```graphql
subscription {
  Aggregate {
    PostsEvents { Created }
    Users(query: "") { results { uuid username } }
  }
}
```

## Custom model events

Models can define custom events (beyond the standard lifecycle events) using `WEBDA_EVENTS`. Custom events also flow through subscriptions:

```typescript
// From Post model
export class PostEvents<T extends Post> {
  Publish: { post: T };
}

export class Post extends Model {
  [WEBDA_EVENTS]: ModelEvents<this> & PostEvents<this>;

  @Operation()
  async publish(destination: "linkedin" | "twitter"): Promise<string> {
    // ...
    return `${destination}_${this.slug}`;
  }
}
```

Custom events appear as additional fields in the subscription payload when the model emits them.

## Client example

Using `graphql-ws` in a browser or Node.js client:

```typescript
import { createClient } from "graphql-ws";
import WebSocket from "ws";

const client = createClient({
  url: "wss://localhost:18080/graphql",
  webSocketImpl: WebSocket, // only needed in Node.js
});

// Subscribe to all Post events
const unsubscribe = client.subscribe(
  {
    query: `
      subscription {
        PostsEvents {
          Created
          Updated
          Deleted
        }
      }
    `
  },
  {
    next: (data) => console.log("Event:", JSON.stringify(data, null, 2)),
    error: (err) => console.error("Error:", err),
    complete: () => console.log("Subscription closed")
  }
);

// Later: unsubscribe()
```

## Implementation notes

- The WebSocket server is created by `GraphQLService` using the `ws` package and attached to the same Node.js HTTP server as the REST handler.
- Each subscription uses an `EventIterator` or `MergedIterator` (from `@webda/runtime`) to bridge Webda's EventEmitter-based store events to the async iterator protocol required by `graphql-ws`.
- Per-object subscriptions filter events by primary key server-side, so clients only receive events for the requested object.

## Verify

```bash
# Start the blog-system dev server (requires TLS on port 18080)
cd sample-apps/blog-system
pnpm run debug
```

Then in a separate terminal, use a WebSocket client (e.g. `wscat` or a browser GraphiQL subscription tab):

```bash
# Using wscat (npm install -g wscat)
wscat --connect wss://localhost:18080/graphql --no-check \
      --subprotocol graphql-transport-ws

# Send connection init:
# {"type":"connection_init","payload":{}}

# Subscribe:
# {"id":"1","type":"subscribe","payload":{"query":"subscription { PostsEvents { Created } }"}}
```

> **Note**: The verify command requires the blog-system server to be running. The `--no-check` flag bypasses self-signed TLS certificate validation in development. The server responds with `{"type":"connection_ack"}` on successful connection.

## See also

- [Schema Generation](./Schema-Generation.md) — how models become GraphQL types
- [Queries and Mutations](./Queries-And-Mutations.md) — CRUD operations
- [@webda/models Lifecycle](../models/Lifecycle.md) — model events that drive subscriptions
- [@webda/runtime](../runtime/README.md) — `EventIterator` and `MergedIterator` internals
