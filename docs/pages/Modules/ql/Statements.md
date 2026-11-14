---
sidebar_position: 5
sidebar_label: Statements
---

# WQL Statements: SELECT, DELETE, UPDATE

Besides a plain filter query, WebdaQL parses three statements:

```
SELECT f1, f2.g [WHERE <filter>] [ORDER BY ...] [LIMIT n] [OFFSET "token"]
SELECT g1, COUNT(*) AS n, SUM(f) AS s [WHERE <filter>] [GROUP BY g1] [ORDER BY ...] [LIMIT n]
DELETE [WHERE <filter>] [LIMIT n]
UPDATE SET a = <value>, b.c = <value> [WHERE <filter>] [LIMIT n]
```

- **Keywords are uppercase only**, like every WQL keyword. `select`, `delete`, `update`, `set`, `where` or `desc` written in lowercase are field names: `select = 1 AND where = 2` is a filter.
- **A plain filter is an implicit `SELECT` of every field**: `parse("status = 'open'").type` is `"SELECT"`. A bare field list without the keyword (`name, age WHERE ...`) is a syntax error.
- Fields can be dotted paths (`profile.email`). SET values are literals (string, number, `TRUE`/`FALSE`), `NOW(...)` function calls, or parameters; `NULL` cannot be assigned.
- Parameters (`?`, `:name`) work in WHERE, LIMIT, OFFSET and SET values: `bind("UPDATE SET status = ? WHERE owner = ?", ["archived", user])`.

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

`parse(query, allowedFields)` checks the SELECT fields and the SET targets against a list of fields (a dotted path is allowed when it or one of its parents is listed) and throws a `SyntaxError` otherwise; `validateQueryFields(query, allowedFields)` does the same on a parsed query. `assertFilterQuery(query)` refuses anything but a plain filter. `projectFields(object, paths)` keeps the fields of a field list on an object (see [Field selection](#field-selection)).

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

| Entry point                                                         | Plain filter | `SELECT` field list       | `DELETE` / `UPDATE`      |
| ------------------------------------------------------------------- | ------------ | ------------------------- | ------------------------ |
| Query operations (REST, gRPC, MCP)                                  | yes          | **yes** (partial results) | **400**                  |
| `Audit.Query`, offline sync filters                                 | yes          | **400**                   | **400**                  |
| GraphQL query and `filter` arguments, subscriptions, links and maps | yes          | **BAD_USER_INPUT**        | **BAD_USER_INPUT**       |
| `Repository.query()` / `iterate()`, `Model.query()`                 | yes          | refused (`WebdaQLError`)  | refused (`WebdaQLError`) |
| `Repository.deleteMany()`                                           | no           | no                        | `DELETE` only            |
| `Repository.updateMany()`                                           | no           | no                        | `UPDATE` only            |

**Field lists project the results of the Query operations** (see [Field selection](#field-selection)); aggregations (`SELECT … GROUP BY`) are refused there with a 400 and run through `Model.aggregate()`. **DELETE and UPDATE are repository-level operations**: they never run through the Query operations exposed to clients. A `__` field in a field list or a SET target is refused like a `__` filter.

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
| Relations               | returned as they are in the object (ids or link objects), not loaded       |
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
sub-path that does not exist is absent from the results. A model without Output schema metadata is not checked at all.
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
