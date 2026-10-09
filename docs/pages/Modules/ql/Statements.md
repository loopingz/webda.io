---
sidebar_position: 5
sidebar_label: Statements
---

# WQL Statements: SELECT, DELETE, UPDATE

Besides a plain filter query, WebdaQL parses three statements:

```
SELECT f1, f2.g [WHERE <filter>] [ORDER BY ...] [LIMIT n] [OFFSET "token"]
DELETE [WHERE <filter>] [LIMIT n]
UPDATE SET a = <value>, b.c = <value> [WHERE <filter>] [LIMIT n]
```

- **Keywords are uppercase only**, like every WQL keyword. `select`, `delete`, `update`, `set`, `where` or `desc` written in lowercase are field names: `select = 1 AND where = 2` is a filter.
- **A plain filter is an implicit `SELECT` of every field**: `parse("status = 'open'").type` is `"SELECT"`. A bare field list without the keyword (`name, age WHERE ...`) is a syntax error.
- Fields can be dotted paths (`profile.email`). SET values are literals (string, number, `TRUE`/`FALSE`) or parameters; `NULL` cannot be assigned.
- Parameters (`?`, `:name`) work in WHERE, LIMIT, OFFSET and SET values: `bind("UPDATE SET status = ? WHERE owner = ?", ["archived", user])`.

The parsed `Query` carries the statement:

```typescript
import { parse } from "@webda/ql";

const q = parse("UPDATE SET status = 'active', age = 30 WHERE name = 'John' LIMIT 10");
q.type;        // "UPDATE"  ("SELECT" for a plain filter or a SELECT, "DELETE")
q.assignments; // [{ field: "status", value: "active" }, { field: "age", value: 30 }]
q.filter.eval({ name: "John" }); // true
q.toString();  // 'UPDATE SET status = "active", age = 30 WHERE name = "John" LIMIT 10'

parse("SELECT name, profile.email WHERE age > 18").fields; // ["name", "profile.email"]
```

`toString()` prints the canonical form of every statement and parses back to the same query. `PrependCondition(query, condition)` keeps the statement head and its ORDER BY / LIMIT / OFFSET and ANDs the condition into the WHERE, both sides keeping their grouping (`( a OR b ) AND ( c OR d )`); the condition itself must be a filter.

`parse(query, allowedFields)` checks the SELECT fields and the SET targets against a list of fields (a dotted path is allowed when it or one of its parents is listed) and throws a `SyntaxError` otherwise; `validateQueryFields(query, allowedFields)` does the same on a parsed query. `assertFilterQuery(query)` refuses anything but a plain filter.

## Where statements are accepted

| Entry point | Plain filter | `SELECT` field list | `DELETE` / `UPDATE` |
|-------------|--------------|---------------------|---------------------|
| Query operations (REST, gRPC, MCP), `Audit.Query` | yes | **400** | **400** |
| GraphQL query and `filter` arguments, subscriptions, links and maps | yes | **BAD_USER_INPUT** | **BAD_USER_INPUT** |
| `Repository.query()` / `iterate()`, `Model.query()` | yes | refused (`WebdaQLError`) | refused (`WebdaQLError`) |
| `Repository.deleteMany()` | no | no | `DELETE` only |
| `Repository.updateMany()` | no | no | `UPDATE` only |

**Field lists are a parse-level feature**: nothing projects results on them yet (GraphQL selection sets already choose the fields). **DELETE and UPDATE are repository-level operations**: they never run through the Query operations exposed to clients. A `__` field in a field list or a SET target is refused like a `__` filter.

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
`deleteMany` and `updateMany` write directly to the store: **no per-object repository event** (`Deleted`, `Patched`, `Updated`, `PartialUpdated`), no model hook, no behaviour and no validation run, and **no permission (`canAct`) is checked**. Repositories are trusted internal APIs: application code that lets a client trigger a bulk statement must check permissions itself.
:::

Rules:

- SET may not target a primary key field nor a private (`__`) field; when the model metadata lists its fields, every SET target must be one of them.
- `LIMIT` is honoured. Without `WHERE`, every object of the model (and its subclasses) is affected.
- Each matching object is updated once, even when the SET changes a field of the WHERE.

How each store runs them:

| Store | DELETE | UPDATE |
|-------|--------|--------|
| Memory, File | directly on the storage map, in one synchronous pass | same |
| MongoDB | `deleteMany` with the translated filter | `updateMany` with `$set` (dotted targets create their parents) |
| PostgreSQL | one `DELETE ... WHERE` | one `UPDATE ... SET data = jsonb_set(...) WHERE`, paths and values bound |
| DynamoDB, Firestore | generic fallback: keys collected first (up to LIMIT), then deleted one by one | generic fallback: keys collected first, then patched one by one |

With a `LIMIT`, MongoDB and PostgreSQL first select the matching keys (backends have no LIMIT on bulk writes). The generic fallback (`AbstractRepository.deleteManyByKey` / `updateManyByKey`) uses the repository's own `delete` / `patch` primitives, which emit no event on a store repository; native DynamoDB and Firestore batch writes are a follow-up.
