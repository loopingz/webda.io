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

### Bulk statements

`deleteMany` and `updateMany` run a WebdaQL `DELETE` / `UPDATE` statement and return the number of objects
affected (`query()` and `iterate()` only take a filter):

```typescript
await useRepository(Post).deleteMany("DELETE WHERE status = ? LIMIT 100", ["spam"]);
await useRepository(Post).updateMany("UPDATE SET status = 'archived' WHERE createdAt < ?", [cutoff]);
```

They are bulk store operations: **no per-object event below fires, and no hook, validation or `canAct` runs**.
Code that lets a client trigger them must check permissions itself. See
[Statements](../../Modules/ql/Statements.md).

### Query objects

`query()`, `iterate()`, the bulk methods and the stores' `find()` also take a parsed `Query` object. An object
built or changed by code is checked and parsed again from its text (`normalizeQuery` in `@webda/ql`): it must be
expressible in WebdaQL. Custom `Expression` subclasses, duck-typed filters (`{ eval }`), `Date` or object values,
`$`-prefixed or empty path segments and non-integer LIMITs are refused with a `WebdaQLError`; pass a `Date` as its
ISO string.

## Aggregation

`Model.aggregate()` (or `useRepository(Model).aggregate()`) groups and summarizes objects without loading them in
application code:

```typescript
const { rows, native } = await Task.aggregate(
  {
    filter: "completed = ? AND owner.uuid = ?", // WebdaQL filter, no ORDER BY / LIMIT / OFFSET
    groupBy: ["status", "owner.uuid"], // dotted paths; omit for one global row
    metrics: {
      n: { count: "*" }, // count: "*" or a path (non-null values)
      tags: { countDistinct: "tag" },
      total: { sum: "points" }, // sum / avg: numeric paths only
      mean: { avg: "points" },
      first: { min: "createdAt" },
      top: { max: "points" }
    },
    orderBy: [{ key: "total", direction: "DESC" }], // a groupBy path or a metric alias
    limit: 10
  },
  [false, user] // parameters of the filter, like query()
);
// rows: [{ status: "open", "owner.uuid": "u1", n: 4, tags: 2, total: 13, mean: 3.25, first: "2026-01-05T10:00:00.000Z", top: 5 }, ...]
// native: false when the in-memory fallback ran
```

Rows are flat: group paths are keys as written (`"owner.uuid"`), metrics are keys by alias. Rows are typed from the
model: a group key keeps its attribute type, `count` / `countDistinct` / `sum` are numbers, `avg` is `number | null`.

Semantics, identical on every store:

- `null` and missing values form one group (key `null`); `count(path)`, `countDistinct`, `sum`, `avg`, `min` and
  `max` skip them. `sum` and `avg` also skip non-numeric values.
- Without `groupBy`, exactly one global row is returned, even when nothing matches; with `groupBy`, no match means no
  row. Over no value, `count` and `sum` are `0`, `avg`, `min` and `max` are `null`.
- An array group key groups by the whole value (no unwinding). `min` / `max` compare like `orderBy` below, so `max`
  over `5` and `"b"` is `"b"`.
- `Date` attributes come back as ISO strings, in group keys and `min` / `max` results.
- Ordering: `null` first in `ASC` (last in `DESC`), then numbers, then strings in code unit order (`"B" < "a"`).
  Booleans and objects are ordered in a backend-defined way, and so are ties and the rows kept by a `limit`
  without `orderBy`: order on a unique key when it matters.

Store parameters:

| Parameter             | Default  | Meaning                                                                                                          |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `aggregationFallback` | `"warn"` | When the store cannot aggregate natively: `allow` runs in memory, `warn` also logs once per shape, `deny` throws |
| `maxGroups`           | `10000`  | Most groups an aggregation may produce without `limit`; the in-memory fallback applies it even with a `limit`    |

Memory, File, PostgreSQL and MongoDB aggregate natively (`native: true`). Other stores (DynamoDB, Firestore, …)
stream every matching object through the in-memory engine (`native: false`), under `aggregationFallback`.

Errors are `AggregationError`s with a `code`: `AGGREGATION_NOT_NATIVE` (fallback denied) and
`AGGREGATION_TOO_MANY_GROUPS` (more than `maxGroups` groups). An invalid spec throws a `WebdaQLError`.

WebdaQL also parses the same request as a `SELECT … GROUP BY` statement, see
[Statements](../../Modules/ql/Statements.md#aggregation-select--group-by).

## Events

Repositories emit typed events around every operation. Register listeners on the
Repository — the events fire whether the write came from `Model.create()`,
`useRepository(Model).create()`, or any other path.

| Pre-event       | Post-event       | Payload                                  |
| --------------- | ---------------- | ---------------------------------------- |
| `Create`        | `Created`        | `{ object_id, object }`                  |
| `Update`        | `Updated`        | `{ object_id, object, previous }`        |
| `Patch`         | `Patched`        | `{ object_id, object, previous }`        |
| `Delete`        | `Deleted`        | `{ object_id }`                          |
| `PartialUpdate` | `PartialUpdated` | `{ object_id, partial_update }`          |
| `Query`         | `Queried`        | `{ query, results, continuationToken? }` |
| `Aggregate`     | `Aggregated`     | `{ query }` / `{ query, rows, native }`  |

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
