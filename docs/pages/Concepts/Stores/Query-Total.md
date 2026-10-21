---
sidebar_position: 3
---

# Query totals

Queries page forward: a query returns `{ results, continuationToken }`. To show _"1–50 of 1,234"_ or a page count, a
client can also ask for the **total** of its query. The total is **opt-in** (a count is never run unless asked) and
**capped**: past `MAX_QUERY_COUNT` (10,000) rows it is returned as "10,000+".

## Asking for the total

REST, `PUT` (the default `queryMethod`):

```http
PUT /tasks
{ "q": "status = 'open' LIMIT 50", "count": true }
```

REST, `GET` (`queryMethod: "GET"`): `GET /tasks?q=status%20%3D%20'open'&count=true` (`true` or `1`).

```json
{
  "results": [ ... 50 tasks ... ],
  "continuationToken": "…",
  "total": { "value": 1234, "relation": "eq" }
}
```

`count` must be a boolean: any other value is a `400`. The OpenAPI document and the `<Model>.queryResult` schema
describe both the parameter and `total`. The CLI takes `--count` on query operations.

GraphQL: select the nullable `total { value relation }` field of a query result. The count only runs when `total`
is in the selection set, for root queries and for relation queries (`queryRelated`, which counts the related rows
only):

```graphql
{
  Tasks(query: "status = 'open' LIMIT 50") {
    results {
      uuid
      title
    }
    continuationToken
    total {
      value
      relation
    }
  }
}
```

**Ask for the total on the first page only**, and keep it while paging on: every count scans the matching rows (or up
to the cap), the next pages do not need it again.

## `relation`: exact or capped

`total` uses the Elasticsearch shape:

| `relation` | Meaning                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `"eq"`     | `value` is the exact total                                                     |
| `"gte"`    | the count stopped at `MAX_QUERY_COUNT`: the real total is **at least** `value` |

Show `"10,000+"` for `{ value: 10000, relation: "gte" }`. The cap bounds the cost of a count on large tables: the
store reads at most `MAX_QUERY_COUNT + 1` rows.

The count runs **concurrently** with the first page, so the latency is the longest of the two, not their sum
(GraphQL resolves `total` once the page is resolved).

## When is a total returned?

Query results are filtered twice: the model's static `getPermissionQuery(context)` is ANDed into the store query,
then every row is checked with `canAct(context, "get", row)` and refused rows are dropped (see
[Permissions](../../Modules/models/Permissions.md#query-filtering)). A store count only sees the first filter: it
would count rows the caller cannot read, which is wrong and leaks their existence.

So a total is returned **only when `getPermissionQuery(context)` returns `{ partial: false }`**: the model states
that its filter alone decides which rows the caller can read. `OwnerModel` and `SimpleUser` do. The count runs on the
merged filter (client filter AND permission query), without `ORDER BY`, `LIMIT` or `OFFSET`.

```typescript
class Task extends UuidModel {
  author: string;

  async canAct(context: IOperationContext, action: string) {
    return this.author === context.getCurrentUserId();
  }

  // The filter decides exactly like canAct("get"): totals can be returned
  static getPermissionQuery(context: IOperationContext) {
    return { query: bind("author = ?", [context.getCurrentUserId()]), partial: false };
  }
}
```

The total is **omitted** (no error: the client falls back to next/previous) when:

- the model has no permission check (every row is refused anyway);
- `getPermissionQuery` is missing, returns `null`, or returns `partial: true` (or no `partial`);
- `canAct` is overridden below the class declaring `getPermissionQuery`, in the model itself or in a subclass whose
  rows the model's queries return: that `canAct` may refuse rows the inherited filter keeps. Re-declare
  `getPermissionQuery` in that class to state that it still matches;
- the store has no native count and its `aggregationFallback` is `deny` (see below).

## Store support

`Repository.count(filter?, params?, { max? })` and `Model.count(…)` count without permission checks (a trusted,
internal API), and return `{ value, relation, native }`:

```typescript
await Task.count("status = ?", ["open"]); // { value: 1234, relation: "eq", native: true }
await Task.count("", undefined, { max: 100 }); // { value: 100, relation: "gte", native: true }
```

| Store                  | Count                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Memory, File           | native, over the local data                                                       |
| PostgreSQL, SQLite     | native: `SELECT COUNT(*) …`, capped with `COUNT(*) FROM (SELECT 1 … LIMIT max+1)` |
| MongoDB                | native: `countDocuments(filter, { limit: max + 1 })`                              |
| DynamoDB, Firestore, … | in-memory fallback: scans the matching objects, stopping at `max + 1`             |

The fallback (`native: false`) follows the store's `aggregationFallback` parameter, like
[aggregations](./Repositories.md#aggregation): `allow` scans, `warn` scans and logs once, `deny` throws an
`AggregationError` with code `AGGREGATION_NOT_NATIVE`, which client queries turn into an omitted total. DynamoDB
keeps the fallback on purpose: a `Select: "COUNT"` scan consumes the same read capacity as the scan itself.
