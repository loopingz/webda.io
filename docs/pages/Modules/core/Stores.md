---
sidebar_position: 5
sidebar_label: Stores
---

# Stores

`Store<T>` is the abstract data access layer in `@webda/core`. It provides a unified CRUD + query interface backed by any storage technology (in-memory, MongoDB, PostgreSQL, DynamoDB, etc.). Stores emit typed events on every mutation.

## Store contract

```typescript
abstract class Store<T extends CoreModel> extends Service {
  // CRUD
  abstract get(uid: string): Promise<T | undefined>;
  abstract save(object: T): Promise<T>;
  abstract update(partial: Partial<T>, uid?: string): Promise<T>;
  abstract delete(uid: string): Promise<void>;
  abstract exists(uid: string): Promise<boolean>;

  // Query
  abstract find(query: WebdaQL.Query): Promise<StoreFindResult<T>>;
  query(wql: string, options?: QueryOptions): Promise<StoreFindResult<T>>;

  // Events
  on(event: "Store.Created" | "Store.Updated" | "Store.Deleted" | ..., handler): this;
  emit(event: string, payload: any): void;
}
```

## `StoreFindResult`

```typescript
interface StoreFindResult<T> {
  results: T[];
  continuationToken?: string;  // for pagination
  filter?: Expression;          // remaining in-memory filter (for backends that partially support WQL)
}
```

## WQL queries

All stores accept [WebdaQL](../ql/Syntax.md) strings:

```typescript
// Get the store for the Post model
const store = useModelStore("WebdaSample/Post");

// Simple filter
const { results } = await store.query(`status = 'published' LIMIT 10`);

// Filter + order + pagination
const page1 = await store.query(
  `status = 'published' ORDER BY createdAt DESC LIMIT 20`
);
const page2 = await store.query(
  `status = 'published' ORDER BY createdAt DESC LIMIT 20 OFFSET "${page1.continuationToken}"`
);
```

## Store events

Stores emit events before and after each mutation:

| Event | When |
|-------|------|
| `Store.Created` | After a new record is saved |
| `Store.Updated` | After a full replace |
| `Store.Deleted` | After a record is deleted |
| `Store.Patched` | After a partial update |
| `Store.Queried` | After a query completes |

Subscribe to events:

```typescript
const postStore = useModelStore("WebdaSample/Post");

postStore.on("Store.Created", ({ object }) => {
  console.log("New post:", object.slug);
});

postStore.on("Store.Deleted", ({ object_id }) => {
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
      "model": "WebdaSample/Post"
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
      "model": "WebdaSample/Post",
      "folder": "./.webda/data"
    }
  }
}
```

## Using a store in a service

```typescript
import { Service, Inject, Store } from "@webda/core";
import { Bean } from "@webda/core";
import { Post } from "../models/Post";

@Bean
export class PostService extends Service {
  @Inject("postStore")
  store: Store<Post>;

  async getPublished(): Promise<Post[]> {
    const { results } = await this.store.query(`status = 'published' ORDER BY createdAt DESC LIMIT 20`);
    return results;
  }

  async createPost(data: Partial<Post>): Promise<Post> {
    const post = new Post();
    post.load(data);
    return this.store.save(post);
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
| `@webda/postgres` | `PostgresStore` | PostgreSQL |
| `@webda/aws` | `DynamoStore` | Amazon DynamoDB |
| `@webda/elasticsearch` | `ElasticSearchStore` | Elasticsearch |
| `@webda/fs` | `FileStore` | Local filesystem |

## Verify

```bash
# Start the blog-system server and query the user store
cd sample-apps/blog-system
# (server running)

curl -sk https://localhost:18080/users | jq '.results | length'
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

- [WQL Syntax](../ql/Syntax.md) — the query language used with `store.query()`
- [WQL Translators](../ql/Translators.md) — how each backend translates WQL
- [Events](./Events.md) — subscribing to `Store.Created`, `Store.Updated`, etc.
- [Models Lifecycle](../models/Lifecycle.md) — events emitted by the model layer
