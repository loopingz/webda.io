---
sidebar_position: 8
sidebar_label: Events
---

# Events

Webda has a two-tier event system: **Core lifecycle events** emitted by `Core` itself (startup, request, error, etc.), and **Repository events** emitted on model mutations.

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
| `Webda.OperationSuccess` | `{ context }` | Operation completed successfully, after its transaction committed ([lifecycle](../../Concepts/Operations.md#operation-lifecycle-and-transactions)) |
| `Webda.Configuration.Applied` | `{ configuration, delta }` | Configuration hot-reload applied |

## Repository events

Every model Repository emits typed events around CRUD operations. App code listens through `useRepository(Model)` (stores are internal):

```typescript
import { useRepository } from "@webda/core";

const posts = useRepository(Post);

posts.on("Created", ({ object }) => {
  console.log("Post created:", object.slug);
});

posts.on("Updated", ({ object, previous }) => {
  console.log("Post updated:", previous.title, "→", object.title);
});

posts.on("Deleted", ({ object_id }) => {
  console.log("Post deleted:", object_id);
});

posts.on("Queried", ({ query, results }) => {
  console.log(`Query "${query}" returned ${results.length} results`);
});
```

Event names (`ModelEvents` in `@webda/models`):
- After the change: `Created`, `Updated`, `Patched`, `PartialUpdated`, `Deleted`, `Queried`, `Aggregated`
- Before the change: `Create`, `Update`, `Patch`, `PartialUpdate`, `Delete`, `Query`, `Aggregate`

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
- [Stores](./Stores.md) — repository events
- [Models Lifecycle](../models/Lifecycle.md) — model-level events
- [GraphQL Subscriptions](../graphql/Subscriptions.md) — real-time event streaming
