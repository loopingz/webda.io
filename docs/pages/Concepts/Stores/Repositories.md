---
sidebar_position: 1
---

# Repositories

A **Repository** is the typed CRUD/query surface for a single model. It is the
canonical persistence API in Webda: application code interacts with persistence
through Repositories — never directly with [Stores](./Stores.md), which are
internal infrastructure that own a backend connection and produce Repositories.

Each model class has exactly one Repository, created and registered by the Store
that owns the model's backend.

## Reaching a Repository

Three equivalent paths — prefer the static model methods:

```typescript
// 1. Static methods on the model (preferred)
const user = await User.create({ name: "Alice" });
const result = await User.query("name = 'Alice'");
const same = await User.ref(user.getUuid()).get();

// 2. The hook — when you need the Repository object itself
import { useRepository } from "@webda/core";
const repo = useRepository(User);
await repo.create({ name: "Bob" });

// 3. Inside a Service — Repositories are NOT @Inject-able; use one of the above.
```

> Configuring which backend stores a model is a [Store](./Stores.md) concern,
> declared in `webda.config`. App code does not name the store.

## CRUD operations

```typescript
// Create
const post = await Post.create({ title: "Hello", status: "draft" });

// Read
const fetched = await Post.ref(post.getUuid()).get();

// Query (WebdaQL)
const drafts = await Post.query("status = 'draft' ORDER BY title ASC LIMIT 20");

// Update / patch
await Post.ref(post.getUuid()).patch({ status: "published" });

// Delete
await Post.ref(post.getUuid()).delete();

// Iterate large result sets without paginating by hand
for await (const p of Post.iterate("status = 'published'")) {
  // ...
}
```

## Events

Repositories emit typed events around every operation. Register listeners on the
Repository — the events fire whether the write came from `Model.create()`,
`useRepository(Model).create()`, or any other path.

| Pre-event   | Post-event       | Payload                                  |
| ----------- | ---------------- | ---------------------------------------- |
| `Create`    | `Created`        | `{ object_id, object }`                  |
| `Update`    | `Updated`        | `{ object_id, object, previous }`        |
| `Patch`     | `Patched`        | `{ object_id, object, previous }`        |
| `Delete`    | `Deleted`        | `{ object_id }`                          |
| `PartialUpdate` | `PartialUpdated` | `{ object_id, partial_update }`      |
| `Query`     | `Queried`        | `{ query, results, continuationToken? }` |

```typescript
import { useRepository } from "@webda/core";

useRepository(User).on("Created", evt => {
  console.log("created", evt.object_id);
});
```

> The legacy aggregate `Store.*` events and the `Store`/`StoreParameters` types
> are `@internal`. New code listens on the Repository's typed events instead.

## Interface

The `Repository<T>` interface (and its segregated sub-interfaces
`CoreRepository`, `Updatable`, `AtomicOperations`, `CollectionOperations`) live
in `@webda/models`. The interface is frozen — concrete implementations
(`MemoryRepository`, `PostgresRepository`, …) live in their Store packages.
