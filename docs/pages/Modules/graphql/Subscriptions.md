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
| `globalSubscription` | `true` | Expose `AggregateSubscriptions` — a single subscription combining all model events |

## Auto-generated subscriptions

For each model (e.g. `Post`), the service generates:

| Subscription | Description |
|-------------|-------------|
| `PostEvents` | All events for all Post instances |
| `PostEvent(slug: String)` | Events for a specific Post by primary key |

And with `globalSubscription: true`:

| Subscription | Description |
|-------------|-------------|
| `AggregateSubscriptions` | Combined stream of all model events across all models |

## Event types

Each model subscription emits a union of model lifecycle events:

```graphql
type PostSubscriptionPayload {
  Create      { object_id: String, object: Post }
  Created     { object_id: String, object: Post }
  Update      { object_id: String, object: Post, previous: Post }
  Updated     { object_id: String, object: Post, previous: Post }
  Delete      { object_id: String }
  Deleted     { object_id: String }
  Patch       { object_id: String, object: Post, previous: Post }
  Patched     { object_id: String, object: Post, previous: Post }
  Query       { query: String }
  Queried     { query: String, results: [Post] }
}
```

Select the events you want in your subscription query:

```graphql
subscription {
  PostEvents {
    Created { object { slug title } }
    Updated { object { slug title } }
    Deleted { object_id }
  }
}
```

## Subscribing to a specific object

```graphql
subscription {
  PostEvent(slug: "hello-world") {
    Updated { object { slug title status viewCount } }
  }
}
```

## Aggregate subscription

With `globalSubscription: true`, a single subscription delivers events from all models:

```graphql
subscription {
  AggregateSubscriptions {
    Post {
      Created { object { slug title } }
    }
    User {
      Created { object { uuid username } }
    }
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
        PostEvents {
          Created { object { slug title } }
          Updated { object { slug title } }
          Deleted { object_id }
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
# {"id":"1","type":"subscribe","payload":{"query":"subscription { PostEvents { Created { object { slug } } } }"}}
```

> **Note**: The verify command requires the blog-system server to be running. The `--no-check` flag bypasses self-signed TLS certificate validation in development. The server responds with `{"type":"connection_ack"}` on successful connection.

## See also

- [Schema Generation](./Schema-Generation.md) — how models become GraphQL types
- [Queries and Mutations](./Queries-And-Mutations.md) — CRUD operations
- [@webda/models Lifecycle](../models/Lifecycle.md) — model events that drive subscriptions
- [@webda/runtime](../runtime/README.md) — `EventIterator` and `MergedIterator` internals
