---
sidebar_position: 8
sidebar_label: Events
---

# Events

Webda has a two-tier event system: **Core lifecycle events** emitted by `Core` itself (startup, request, error, etc.), and **Store events** emitted by every Store on model mutations.

## Core lifecycle events

```typescript
import { useCoreEvents } from "@webda/core";

useCoreEvents("Webda.Init", () => {
  console.log("Framework fully initialized");
});

useCoreEvents("Webda.Request", ({ context }) => {
  console.log("Incoming request:", context.getHttpContext()?.getUrl());
});

useCoreEvents("Webda.Result", ({ context }) => {
  console.log("Response sent for:", context.getHttpContext()?.getUrl());
});
```

Available Core events:

| Event name | Payload | When |
|-----------|---------|------|
| `Webda.Init` | — | All services initialized |
| `Webda.Request` | `{ context }` | Before each request handler |
| `Webda.Result` | `{ context }` | After each request handler |
| `Webda.404` | `{ context }` | No route matched |
| `Webda.OperationSuccess` | `{ context }` | Operation completed successfully |
| `Webda.Configuration.Applied` | — | Configuration hot-reload applied |

## Store events

Every `Store` emits events around CRUD operations:

```typescript
import { useModelStore } from "@webda/core";

const postStore = useModelStore("WebdaSample/Post");

postStore.on("Store.Created", ({ object }) => {
  console.log("Post created:", object.slug);
});

postStore.on("Store.Updated", ({ object, previous }) => {
  console.log("Post updated:", previous.title, "→", object.title);
});

postStore.on("Store.Deleted", ({ object_id }) => {
  console.log("Post deleted:", object_id);
});

postStore.on("Store.Queried", ({ query, results }) => {
  console.log(`Query "${query}" returned ${results.length} results`);
});
```

Store event naming conventions:
- `Store.Created`, `Store.Updated`, `Store.Deleted`, `Store.Patched`, `Store.Queried`
- Pre-operation: `Store.Create`, `Store.Update`, `Store.Delete`, `Store.Patch`, `Store.Query`

## The `@On` decorator

In service classes, use `@On` to subscribe declaratively:

```typescript
import { Bean, Service } from "@webda/core";
// @On is available from @webda/core in v4
import { On } from "@webda/core";

@Bean
export class SearchIndexService extends Service {
  @On("Store.Created:WebdaSample/Post")
  async onPostCreated(event: any): Promise<void> {
    const post = event.object;
    await this.indexPost(post);
  }

  @On("Store.Deleted:WebdaSample/Post")
  async onPostDeleted(event: any): Promise<void> {
    await this.removeFromIndex(event.object_id);
  }
}
```

## Model custom events

Models can define and emit custom events alongside the standard lifecycle events:

```typescript
import { Model, WEBDA_PRIMARY_KEY, WEBDA_EVENTS, ModelEvents } from "@webda/models";

export class PostEvents<T extends Post> {
  Publish: { post: T };
}

export class Post extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;
  [WEBDA_EVENTS]: ModelEvents<this> & PostEvents<this>;

  async publish(): Promise<void> {
    this.status = "published";
    await this.save();
    this.emit("Publish", { post: this });
  }
}
```

Listen on the repository:

```typescript
Post.getRepository().on("Publish", ({ post }) => {
  console.log("Published:", post.slug);
});
```

## Service-level events

Services can emit their own events using `this.emit()`:

```typescript
@Bean
export class NotificationService extends Service {
  async send(to: string, message: string): Promise<void> {
    // ... send
    this.emit("Notification.Sent", { to, message, timestamp: Date.now() });
  }
}

// In another service:
const notifier = useService("NotificationService");
notifier.on("Notification.Sent", ({ to, message }) => {
  console.log(`Notification sent to ${to}: ${message}`);
});
```

## GraphQL subscriptions

Model events automatically flow to GraphQL subscriptions (when `@webda/graphql` is configured). The `GraphQLService` subscribes to all model stores and forwards events to connected WebSocket clients. See [GraphQL Subscriptions](../graphql/Subscriptions.md).

## Verify

```bash
# Run core event tests
cd packages/core
pnpm test
```

```
✓ packages/core — event tests pass
```

## See also

- [Architecture](./Architecture.md) — Core lifecycle state machine
- [Lifecycle](./Lifecycle.md) — service lifecycle phases
- [Stores](./Stores.md) — `Store.Created`, `Store.Updated`, etc.
- [Models Lifecycle](../models/Lifecycle.md) — model-level events
- [GraphQL Subscriptions](../graphql/Subscriptions.md) — real-time event streaming
