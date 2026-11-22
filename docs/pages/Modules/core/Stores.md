---
sidebar_position: 5
sidebar_label: Stores
---

# Stores

A `Store` is the service that owns a storage backend (in-memory, MongoDB, PostgreSQL, DynamoDB, etc.) and produces the `Repository` of each model it is configured with. Stores are internal (`@internal`): app code never references a Store, it goes through the model (`Model.ref/create/query`) or `useRepository(Model)`.

## Query result

`Repository.query()` (and `Model.query()`) resolve to:

```typescript
{
  results: T[];
  continuationToken?: string; // for pagination
}
```

## WQL queries

All repositories accept [WebdaQL](../ql/Syntax.md) strings:

```typescript
import { useRepository } from "@webda/core";

const posts = useRepository(Post);

// Simple filter
const { results } = await posts.query(`status = 'published' LIMIT 10`);

// Filter + order + pagination
const page1 = await posts.query(
  `status = 'published' ORDER BY createdAt DESC LIMIT 20`
);
const page2 = await posts.query(
  `status = 'published' ORDER BY createdAt DESC LIMIT 20 OFFSET "${page1.continuationToken}"`
);
```

## Repository events

Repositories emit events before and after each mutation (`ModelEvents` in `@webda/models`):

| Event | When |
|-------|------|
| `Created` | After a new record is saved |
| `Updated` | After a full replace |
| `Deleted` | After a record is deleted |
| `Patched` | After a partial update |
| `Queried` | After a query completes |

Subscribe to events:

```typescript
useRepository(Post).on("Created", ({ object }) => {
  console.log("New post:", object.slug);
});

useRepository(Post).on("Deleted", ({ object_id }) => {
  console.log("Deleted:", object_id);
});
```

## MemoryStore — in-process store

`MemoryStore` is the default store for development and testing. It stores records in a JavaScript `Map` and evaluates WQL queries in-memory.

Configuration:

```json
{
  "services": {
    "postStore": {
      "type": "Webda/MemoryStore",
      "models": ["WebdaSample/Post"]
    }
  }
}
```

Optional file persistence:

```json
{
  "services": {
    "postStore": {
      "type": "Webda/MemoryStore",
      "models": ["WebdaSample/Post"],
      "persistence": {
        "path": "./.webda/data/posts.json"
      }
    }
  }
}
```

## Using a model in a service

```typescript
import { Service, Bean } from "@webda/core";
import { Post } from "../models/Post";

@Bean
export class PostService extends Service {
  async getPublished(): Promise<Post[]> {
    const { results } = await Post.query(`status = 'published' ORDER BY createdAt DESC LIMIT 20`);
    return results;
  }

  async createPost(data: Partial<Post>): Promise<Post> {
    return Post.create(data);
  }
}
```

## Direct repository access from models

Models expose a static `getRepository()` that returns a typed repository backed by the mapped store:

```typescript
import { Post } from "./models/Post";

// Query via model repository
const { results } = await Post.getRepository().query(
  `status = 'published' AND viewCount >= 100 ORDER BY createdAt DESC`
);

// Get one by primary key
const post = await Post.ref("hello-world").get();

// Save
post.title = "Updated Title";
await post.save();
```

## Available store backends

| Package | Store class | Backend |
|---------|-------------|---------|
| `@webda/core` | `MemoryStore` | In-memory (dev/test) |
| `@webda/mongodb` | `MongoStore` | MongoDB |
| `@webda/postgres` | `PostgresStore` | PostgreSQL (JSONB, on `@webda/sql`) |
| `@webda/sqlite` | `SQLiteStore` | SQLite on `node:sqlite`, in memory or a file (on `@webda/sql`) |
| `@webda/aws` | `DynamoStore` | Amazon DynamoDB |
| `@webda/fs` | `FileStore` | Local filesystem |

## Verify

```bash
# Start the blog-system server and query the user store
cd sample-apps/blog-system
# (server running)

curl -sk -X PUT https://localhost:18080/users | jq '.results | length'
```

Or run the in-memory store tests:

```bash
cd packages/core
npx vitest run src/stores/memory.spec.ts
```

```
✓ packages/core/src/stores/memory.spec.ts — all tests pass
```

## See also

- [WQL Syntax](../ql/Syntax.md) — the query language used with `query()`
- [WQL Translators](../ql/Translators.md) — how each backend translates WQL
- [Events](./Events.md) — subscribing to `Created`, `Updated`, etc.
- [Models Lifecycle](../models/Lifecycle.md) — events emitted by the model layer
