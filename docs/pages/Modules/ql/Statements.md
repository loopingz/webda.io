---
sidebar_position: 5
sidebar_label: Statements
---

# WQL Statements: SELECT, DELETE, UPDATE

Besides a plain filter query, WebdaQL parses three statements:

```
SELECT f1, f2.g [WHERE <filter>] [HYDRATE ...] [ORDER BY ...] [LIMIT n] [OFFSET "token"]
SELECT g1, COUNT(*) AS n, SUM(f) AS s [WHERE <filter>] [GROUP BY g1] [ORDER BY ...] [LIMIT n]
DELETE [WHERE <filter>] [LIMIT n]
UPDATE SET a = <value>, b.c = <value> [WHERE <filter>] [LIMIT n]
```

- **Keywords are uppercase only**, like every WQL keyword. `select`, `delete`, `update`, `set`, `where` or `desc` written in lowercase are field names: `select = 1 AND where = 2` is a filter.
- **A plain filter is an implicit `SELECT` of every field**: `parse("status = 'open'").type` is `"SELECT"`. A bare field list without the keyword (`name, age WHERE ...`) is a syntax error.
- Fields can be dotted paths (`profile.email`). SET values are literals (string, number, `TRUE`/`FALSE`), `NOW(...)` function calls, or parameters; `NULL` cannot be assigned.
- Parameters (`?`, `:name`) work in WHERE, LIMIT, OFFSET and SET values: `bind("UPDATE SET status = ? WHERE owner = ?", ["archived", user])`.
- A filter query and a `SELECT` field list take a `HYDRATE rel, rel.sub INNER` clause before `ORDER BY`: see [Hydration](#hydration).

The parsed `Query` carries the statement:

```typescript
import { parse } from "@webda/ql";

const q = parse("UPDATE SET status = 'active', age = 30 WHERE name = 'John' LIMIT 10");
q.type; // "UPDATE"  ("SELECT" for a plain filter or a SELECT, "DELETE")
q.assignments; // [{ field: "status", value: "active" }, { field: "age", value: 30 }]
q.filter.eval({ name: "John" }); // true
q.toString(); // 'UPDATE SET status = "active", age = 30 WHERE name = "John" LIMIT 10'

parse("SELECT name, profile.email WHERE age > 18").fields; // ["name", "profile.email"]
```

`toString()` prints the canonical form of every statement (including `LIMIT 0`) and parses back to the same query. A `Query` object built or changed by code can be checked with `normalizeQuery(query)`: field paths (letters, digits, `_`), operators, values (strings, finite numbers, booleans), LIMIT and OFFSET are validated and the query is parsed again from its text. Repositories do this for every object they receive. `PrependCondition(query, condition)` keeps the statement head and its ORDER BY / LIMIT / OFFSET and ANDs the condition into the WHERE, both sides keeping their grouping (`( a OR b ) AND ( c OR d )`); the condition itself must be a filter.

`parse(query, allowedFields)` checks the SELECT fields and the SET targets against a list of fields (a dotted path is allowed when it or one of its parents is listed) and throws a `SyntaxError` otherwise; `validateQueryFields(query, allowedFields)` does the same on a parsed query. `assertFilterQuery(query)` refuses anything but a plain filter (a `HYDRATE` clause included). `projectFields(object, paths)` keeps the fields of a field list on an object (see [Field selection](#field-selection)).

## Aggregation: SELECT … GROUP BY

A `SELECT` with aggregate functions or a `GROUP BY` is an aggregation, parsed into the same AST as the object form
of [`Model.aggregate()`](../../Concepts/Stores/Repositories.md#aggregation):

```typescript
const q = parse(
  "SELECT status, owner.uuid, COUNT(*) AS n, COUNT(DISTINCT tag) AS tags, SUM(points) AS total, " +
    "AVG(points) AS mean, MIN(createdAt) AS first, MAX(points) AS top " +
    "WHERE completed = FALSE GROUP BY status, owner.uuid ORDER BY total DESC, status LIMIT 10"
);
q.fields; // ["status", "owner.uuid"]
q.aggregation; // { filter, groupBy: ["status", "owner.uuid"], metrics: { n: { fn: "COUNT" }, ... }, orderBy, limit }

parse("SELECT COUNT(*) AS n WHERE status = 'open'").aggregation; // one global row, no GROUP BY
```

Functions are `COUNT(*)`, `COUNT(f)`, `COUNT(DISTINCT f)`, `SUM(f)`, `AVG(f)`, `MIN(f)` and `MAX(f)`. Rules:

- The selected fields must be exactly the `GROUP BY` paths: `SELECT status, COUNT(*) AS n` without `GROUP BY status`
  is refused, and so is a `GROUP BY` without any metric.
- Every metric needs a unique alias (`AS n`), which cannot clash with a group path or be `__proto__`, `constructor`
  or `prototype`. Path segments cannot be all digits (`tags.0`).
- `ORDER BY` takes a group path or an alias; `OFFSET` is refused (aggregations have no pagination).
- `parse(query, allowedFields)` also checks every metric field (`SUM(secret)`); `COUNT(*)` has none.
- `assertFilterQuery` refuses an aggregation, so `query()` / `iterate()` never run one.

### Reserved keywords

The uppercase words `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `AS`, `DISTINCT` and `GROUP BY` are keywords (`GROUP` or `BY` alone stay names). **Breaking
change:** a filter on an attribute named in uppercase like one of them (`COUNT = 1`) no longer parses. Lowercase
names stay attributes: `count = 1 AND min = 2` is still a filter.

## Where statements are accepted

| Entry point                                                         | Plain filter | `SELECT` field list       | `HYDRATE`                | `DELETE` / `UPDATE`      |
| ------------------------------------------------------------------- | ------------ | ------------------------- | ------------------------ | ------------------------ |
| Query operations (REST, MCP)                                        | yes          | **yes** (partial results) | **yes**                  | **400**                  |
| Query operations (gRPC)                                             | yes          | **yes** (partial results) | **INVALID_ARGUMENT**     | **INVALID_ARGUMENT**     |
| `Audit.Query`, offline sync filters                                 | yes          | **400**                   | **400**                  | **400**                  |
| GraphQL query and `filter` arguments, subscriptions, links and maps | yes          | **BAD_USER_INPUT**        | **BAD_USER_INPUT**       | **BAD_USER_INPUT**       |
| `Repository.query()` / `iterate()`, `Model.query()`                 | yes          | refused (`WebdaQLError`)  | refused (`WebdaQLError`) | refused (`WebdaQLError`) |
| `Repository.deleteMany()`                                           | no           | no                        | no                       | `DELETE` only            |
| `Repository.updateMany()`                                           | no           | no                        | no                       | `UPDATE` only            |

**Field lists project the results of the Query operations** (see [Field selection](#field-selection)), and **`HYDRATE` loads their relations** (see [Hydration](#hydration)); aggregations (`SELECT … GROUP BY`) are refused there with a 400 and run through `Model.aggregate()`. **DELETE and UPDATE are repository-level operations**: they never run through the Query operations exposed to clients. A `__` field in a field list or a SET target is refused like a `__` filter.

## Field selection

The Query operations (REST, gRPC, MCP) accept a field list. Each result then holds only the selected fields plus the
primary key:

```
SELECT title, owner.name WHERE status = 'open' ORDER BY due ASC LIMIT 20
```

```json
{
  "results": [{ "uuid": "t1", "title": "Write the docs", "owner": { "name": "Ada" } }],
  "continuationToken": "eyJhbGciOi…"
}
```

A query without a field list returns whole objects, as before.

**What a field list changes, and what it does not**

- Only the response changes. The store still reads whole rows, and the model's permission query, `canAct(ctx, "get")`
  and `toDTO()` run on them. A field list removes fields from an object the caller already receives: it cannot show
  more, and it does not make the store query cheaper.
- The page, the `continuationToken` and the `total` are those of the same query without the field list. A token can
  be sent back with another field list.
- `WHERE` and `ORDER BY` can use fields that are not selected.

**Projection rules** (`projectFields(object, paths)` of `@webda/ql`, applied to the `toDTO()` form of each row)

| Rule                    | Example                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| Primary key always kept | `SELECT title` returns `{ uuid, title }` (every field of a composite key)  |
| Dotted path             | `SELECT b.c` returns `{ b: { c } }`                                        |
| Sibling paths merge     | `SELECT b.c, b.d` returns `{ b: { c, d } }`                                |
| Path and parent         | `SELECT b, b.c` returns the whole `b`                                      |
| Through an array        | `SELECT tags.name` on `tags: [{ name, color }]` returns `tags: [{ name }]` |
| Through a scalar/`null` | `SELECT b.c` when `b` is `5` or `null`: `b` is omitted                     |
| Missing value           | omitted, no `null` is added; an existing `null` is kept                    |
| Relations               | returned as they are in the object (ids or link objects), unless hydrated  |
| Key order               | the order of the object, not of the field list                             |

**Errors** (`400 Bad Request`, before the store is asked)

| Query                                                  | Message                                    |
| ------------------------------------------------------ | ------------------------------------------ |
| A field that is not in the model's Output schema       | `Unknown field "<path>"`                   |
| A `__` segment (`SELECT __secret`, `SELECT a.__hash`)  | `Private fields cannot be queried`         |
| A `constructor` or `prototype` segment                 | `Unknown field "<path>"`                   |
| Aggregate functions or `GROUP BY`                      | `Aggregations are not accepted by queries` |
| More than 64 paths, or a path of more than 16 segments | a message giving the limit                 |

A selected path must start with a field of the Output schema of the model or of one of its subclasses (a query on a
model returns the rows of its subclasses), or with a primary key field. The rest of a dotted path is not checked: a
sub-path that does not exist is absent from the results. The exception is a path through a relation: a relation that
holds a key (parent, link, array of keys) has no sub-field, so `SELECT owner.name` is refused
(`Unknown field "owner.name"`) unless the query [hydrates](#hydration) `owner`. A model without Output schema metadata is not checked at all.
A field that `toDTO()` hides from the caller is absent too, not an error: whether it is visible can depend on the row.

**Per transport**

- **REST**: `PUT /tasks` with `{ "q": "SELECT title WHERE status = 'open'" }`, or `GET /tasks?q=…` with
  `"queryMethod": "GET"`. The OpenAPI result schema still references the model: its `required` fields may be missing
  from a partial result.
- **MCP**: the `Tasks.Query` tool takes the same `query`. A field list keeps tool results small.
- **gRPC**: the message types do not change. A field that is not selected is not sent, so a required (non-`optional`)
  proto3 field decodes as its default value (`""`, `0`, `false`). Read only the fields you selected.
- **GraphQL**: a field list is refused (`BAD_USER_INPUT`), the selection set already chooses the fields.
- **`@webda/sdk`**: `api.Task.query("SELECT title WHERE status = 'open'")` returns partial objects. They refresh the
  entities already cached and are not cached as whole ones.
- **Repositories, offline sync, `Audit.Query`**: a field list is refused. `Repository.query()` and `Model.query()`
  return model instances, and saving a partial instance would erase the fields that were not selected. Sync stores
  whole objects on the client.

## Hydration

Query results hold relations as keys. `HYDRATE` replaces the listed relations by the related objects, in the same
query: one call instead of one per related object.

```
status = 'open' HYDRATE owner, project INNER, project.team ORDER BY due ASC LIMIT 20
SELECT title, owner.name WHERE status = 'open' HYDRATE owner
```

```json
{
  "results": [
    {
      "uuid": "t1",
      "title": "Write the docs",
      "owner": { "uuid": "u1", "name": "Ada" },
      "project": { "uuid": "p1", "name": "Apollo", "team": { "uuid": "g1", "name": "Core" } }
    }
  ]
}
```

The clause comes after the filter (or the `WHERE` of a `SELECT`) and before `ORDER BY`. A dotted path hydrates the
relations of a hydrated object: `project.team` implies `project`. It is refused with `GROUP BY` or aggregate
functions, and in `DELETE` and `UPDATE` (syntax error). The parsed `Query` carries it as
`hydrate: [{ path: "owner", mode: "LEFT" }, …]`.

**Join modes**, per relation

| Mode             | A related object that is missing, or that the caller may not read                       |
| ---------------- | --------------------------------------------------------------------------------------- |
| `LEFT` (default) | The relation is `null`; the result is kept. A relation that is not set is left as it is |
| `INNER`          | The result is dropped. A relation that is not set drops it too                          |

On a collection, `INNER` removes the missing and unreadable entries, and drops the result when no entry is left. On a
nested path each level has its own mode: with `HYDRATE project.team INNER`, a project whose team is missing counts as
missing itself, so `project` is `null` (it is `LEFT`); with `HYDRATE project INNER, project.team INNER` the result is
dropped.

**What can be hydrated**, and the shape of the result

| Relation                                    | Stored as                | Hydrated as                                                   |
| ------------------------------------------- | ------------------------ | ------------------------------------------------------------- |
| `ModelParent`, `ModelLink`                  | a key                    | the object, or `null`                                         |
| `ModelLinksSimpleArray`                     | an array of keys         | an array of objects or `null`: positions are kept             |
| `ModelLinksArray`                           | an array of link objects | each entry is the object merged over its link data, or `null` |
| `ModelLinksMap`                             | link data by key         | the same merge for each entry, or `null`: map keys are kept   |
| `ModelRelated`, maps, polymorphic, binaries | —                        | refused (`Cannot hydrate "<path>"`)                           |

In a merged entry the fields of the object win over the link data of the same name. A reverse relation
(`ModelRelated`) is a query of its own: use the Query operation of the related model with a filter, or GraphQL.

**Permissions**

- Each related object is read as the caller, with the rules of a `GET`: the `Get` operation of its model must be
  exposed and allowed for the caller (operation permission, token scopes, authorizers), then the model's
  `canAct(ctx, "get")` decides. A model without `canAct` is never returned.
- A missing object and an object the caller may not read give the same result (`null`, or a dropped result): the
  response does not tell them apart, exactly like a direct `GET` answers 404 for both.
- A hydrated object is its `toDTO()` form, built as the caller: fields it hides from this caller stay hidden. The
  relation keys are read from the `toDTO()` form of the result too: a relation it hides is not hydrated.
- `__` fields are refused in a path, and never part of a hydrated object.

**Paging and totals**

- A result dropped by `INNER` counts like a result refused by `canAct`: it is replaced from the next store pages, so
  a page holds up to `LIMIT` results. When the scan budget of the page is spent the page can be shorter; its
  `continuationToken` still continues the query.
- The `continuationToken` is bound to the clause: send it back with the same `HYDRATE` clause (`LEFT` written or
  implied is the same clause). The field list can still change between pages.
- `count: true` gives no `total` when a path is `INNER` (the store cannot count the dropped results). With `LEFT`
  only, the total is the one of the same query without the clause.

**With a field list**: the field list is applied after hydration. A path through a hydrated relation selects fields
of the related object, and keeps its primary key: `SELECT title, owner.name … HYDRATE owner` returns
`{ uuid, title, owner: { uuid, name } }`. Such a path is checked against the Output schema of the related model.
Without `HYDRATE owner`, `owner` holds a key and `SELECT owner.name` is a 400. A `null` relation is kept when the
relation is selected whole (`SELECT owner`), and absent when a path goes through it (`SELECT owner.name`); a `null`
entry of a collection has no field to keep and is left out. A path through a hydrated map goes through its keys
(`labels.<key>.name`).

**Limits** (`DomainService` parameters)

| Parameter                | Default | Meaning                                                                        |
| ------------------------ | ------- | ------------------------------------------------------------------------------ |
| `queryHydrateMaxDepth`   | `2`     | Deepest path (`project.team` is 2), between 1 and 5                            |
| `queryHydrateMaxObjects` | `1000`  | Most distinct related objects one query loads; a query loading more is refused |

Each related object is loaded once per query, whatever the number of results naming it.

**Errors** (`400 Bad Request`; all but the last before the store is asked)

| Query                                                   | Message                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A path that is not a chain of parent and link relations | `Cannot hydrate "<path>"`                                                     |
| A `__` segment                                          | `Private fields cannot be queried`                                            |
| A path listed twice                                     | `HYDRATE lists "<path>" more than once`                                       |
| A path deeper than `queryHydrateMaxDepth`               | `HYDRATE "<path>" is deeper than <n>`                                         |
| More than `queryHydrateMaxObjects` related objects      | `HYDRATE loads more than <n> objects: lower LIMIT or HYDRATE fewer relations` |

**Per transport**

- **REST**: `PUT /tasks` with `{ "q": "HYDRATE owner LIMIT 5" }`. The OpenAPI result schema still references the
  model: its relation fields hold objects when they are hydrated.
- **MCP**: the `Tasks.Query` tool takes the same `query`: an agent gets the related objects in one tool call.
- **gRPC**: refused (`INVALID_ARGUMENT`, `HYDRATE is not available over gRPC`). The messages type a relation as its
  key.
- **GraphQL**: refused (`BAD_USER_INPUT`). Select the relation fields: they already load the related objects.
- **`@webda/sdk`**: `api.Task.query("HYDRATE owner")` returns the hydrated objects. They are not cached, and never
  change a cached entity.
- **Repositories, offline sync, `Audit.Query`**: refused. `Repository.query()` and `Model.query()` return model
  instances as they are stored; load a relation with its accessor (`task.owner.get()`).

### Hydration keywords

The uppercase words `HYDRATE`, `INNER` and `LEFT` are keywords. **Breaking change:** a filter on an attribute named
in uppercase like one of them (`LEFT = 1`) no longer parses. Lowercase names stay attributes: `left = 1 AND inner = 2`
is still a filter.

## Bulk operations on repositories

```typescript
import { useRepository } from "@webda/core";

const deleted = await useRepository(Task).deleteMany("DELETE WHERE status = ? LIMIT 100", ["done"]);
const updated = await useRepository(Task).updateMany("UPDATE SET status = :s, meta.archived = TRUE WHERE owner = :o", {
  s: "archived",
  o: user
});
```

Both take the statement string (with parameters) or its parsed `Query`, and return the number of objects affected. A statement of the other type is refused.

:::warning Bulk operations bypass the model layer
`deleteMany` and `updateMany` write directly to the store: **no per-object repository event** (`Deleted`, `Patched`, `Updated`, `PartialUpdated`), no model hook, no behaviour and no validation run, and **no permission (`canAct`) is checked**. Everything that listens to those events misses bulk changes: search indexers (Elasticsearch), `ModelMapper` duplicated attributes, cluster `Store.*` replication, GraphQL subscriptions and any application listener. Repositories are trusted internal APIs: application code that lets a client trigger a bulk statement must check permissions itself.
:::

Rules:

- SET targets are paths of letters, digits and `_` (no empty segment). They may not target a primary key field, a private (`__`) field or an `Object.prototype` member name (`toString`, `constructor`...), nor set a field twice or together with one of its children; when the model metadata lists its fields, every SET target must be one of them. A numeric segment indexes an existing array (`SET tags.0 = 'x'`).
- `LIMIT` is honoured, and `LIMIT 0` affects nothing. Without `WHERE`, every object of the model and its subclasses is affected (on Firestore, which has no class filter, every document of the model's collection).
- Each matching object is updated once, even when the SET changes a field of the WHERE.

How each store runs them:

| Store               | DELETE                                                                        | UPDATE                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Memory, File        | directly on the storage map, in one synchronous pass                          | same                                                                                                                         |
| MongoDB             | `deleteMany` with the translated filter                                       | `updateMany` with `$set` (dotted targets create their parents)                                                               |
| PostgreSQL          | one `DELETE ... WHERE`                                                        | one `UPDATE ... SET data = jsonb_set(...) WHERE`; SET paths and values are bound, the WHERE is written from the parsed query |
| DynamoDB, Firestore | generic fallback: keys collected first (up to LIMIT), then deleted one by one | generic fallback: keys collected first, then patched one by one                                                              |

An object deleted while the fallback runs is skipped and left out of the count. With a `LIMIT`, MongoDB and PostgreSQL first select the matching keys (the WHERE is kept on the write too) (backends have no LIMIT on bulk writes). The generic fallback (`AbstractRepository.deleteManyByKey` / `updateManyByKey`) uses the repository's own `delete` / `patch` primitives, which emit no event on a store repository; native DynamoDB and Firestore batch writes are a follow-up.

## Comparison semantics across stores

Memory, MongoDB and PostgreSQL agree on these rules (a parity test runs the same queries on each):

- A missing field or a `null` never matches `=`, `<`, `<=`, `>`, `>=`, `LIKE` or `CONTAINS`, and always matches `!=`.
- A number or a boolean only matches a value of the same type: `n < 2` ignores `n: "abc"`, `b = TRUE` ignores `b: "true"`. On PostgreSQL a mismatched value never raises a database error.
- `CONTAINS` only matches an array holding the value.

Known differences: Memory compares with JavaScript's loose `==` and `<`, so `n = '1'` matches `n: 1` there and on PostgreSQL (which compares the text), not on MongoDB; a `null` field compares as `0` with `<` / `<=` in Memory; PostgreSQL compares strings as text (`s < 'b'` with `s: 1` compares `'1'`).

`LIMIT 0` on a filter query keeps its historical meaning, the default page size; on DELETE and UPDATE it affects nothing.
