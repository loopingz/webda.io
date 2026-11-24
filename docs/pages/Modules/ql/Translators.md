---
sidebar_position: 5
sidebar_label: Store Translators
---

# Store Translators

Each Webda Store backend provides a repository whose `query()` method translates the parsed WQL AST into its own native query format. This page documents how each backend translates common WQL constructs.

## Translation overview

import ReferenceDiagram from "@site/src/components/ReferenceDiagram";

<ReferenceDiagram id="query-translation" />

## In-memory (MemoryStore)

The in-memory repository (`packages/models/src/repositories/memory.ts`, used by `MemoryStore`) does not translate WQL to a secondary language — it calls `eval(object)` on the parsed filter expression directly to filter JavaScript objects in memory.

**How it works:**

```typescript
// Simplified from MemoryRepository.query()
const results = Object.values(this.storage).filter(obj => query.filter.eval(obj));
```

**Characteristics:**

- No translation overhead — pure JS object inspection
- Supports all WQL operators exactly as specified
- LIMIT and OFFSET are applied post-filter (slice)
- ORDER BY is applied via `Array.sort()` using the `orderBy` fields

**Example:**

| WQL                     | In-memory behavior                                           |
| ----------------------- | ------------------------------------------------------------ |
| `status = 'published'`  | `obj.status === 'published'`                                 |
| `viewCount >= 100`      | `obj.viewCount >= 100`                                       |
| `tags CONTAINS 'ts'`    | `Array.isArray(obj.tags) && obj.tags.includes('ts')`         |
| `title LIKE 'Intro%'`   | `ComparisonExpression.likeToRegex('Intro%').test(obj.title)` |
| `deletedAt IS NULL`     | `obj.deletedAt === undefined \|\| obj.deletedAt === null`    |
| `deletedAt IS NOT NULL` | `obj.deletedAt !== undefined && obj.deletedAt !== null`      |

---

## MongoDB (MongoStore)

The MongoDB store (`packages/mongodb/src/mongodb.service.ts`) translates the WQL AST into a MongoDB filter document using the exported `mapExpression()` function.

**Translation table:**

| WQL operator           | MongoDB equivalent                                                            |
| ---------------------- | ----------------------------------------------------------------------------- |
| `field = value`        | `{ field: value }`                                                            |
| `field != value`       | `{ field: { $ne: value } }`                                                   |
| `field > value`        | `{ field: { $gt: value } }`                                                   |
| `field >= value`       | `{ field: { $gte: value } }`                                                  |
| `field < value`        | `{ field: { $lt: value } }`                                                   |
| `field <= value`       | `{ field: { $lte: value } }`                                                  |
| `field IN [a, b]`      | `{ field: { $in: [a, b] } }`                                                  |
| `field LIKE "pattern"` | `{ field: /regex/ }` (via `ComparisonExpression.likeToRegex`)                 |
| `field CONTAINS value` | `{ field: { $elemMatch: { $eq: value } } }` (only an array holding the value) |
| `field IS NULL`        | `{ field: null }` (matches null and missing fields)                           |
| `field IS NOT NULL`    | `{ field: { $ne: null } }`                                                    |
| `A AND B`              | `{ $and: [A, B] }` (a single non-empty child is returned as is)               |
| `A OR B`               | `{ $or: [A, B] }`                                                             |

**Code reference (simplified):**

```typescript
// From packages/mongodb/src/mongodb.service.ts
export function mapExpression(expression: WebdaQL.Expression): any {
  if (expression instanceof WebdaQL.AndExpression) {
    return { $and: expression.children.map(e => mapExpression(e)) };
  }
  if (expression instanceof WebdaQL.OrExpression) {
    return { $or: expression.children.map(e => mapExpression(e)) };
  }
  if (expression instanceof WebdaQL.ComparisonExpression) {
    // Examples:
    // "="  → { [field]: value }
    // ">"  → { [field]: { $gt: value } }
    // "IN" → { [field]: { $in: value } }
    // "LIKE" → { [field]: /regex/ }
  }
}
```

**Example translations:**

```
WQL:   status = 'published' AND viewCount >= 100
Mongo: { $and: [ { status: "published" }, { viewCount: { $gte: 100 } } ] }

WQL:   status IN ['draft', 'published']
Mongo: { status: { $in: ["draft", "published"] } }

WQL:   status = 'draft' OR status = 'archived'
Mongo: { $or: [ { status: "draft" }, { status: "archived" } ] }

WQL:   title LIKE "Intro%"
Mongo: { title: /^Intro/i }
```

**ORDER BY / LIMIT / OFFSET:**

```
WQL:   ORDER BY createdAt DESC LIMIT 20 OFFSET "100"
Mongo: .sort({ createdAt: -1 }).skip(100).limit(20)
```

MongoDB uses a numeric offset (parsed from the continuation token string).

---

## PostgreSQL / SQL (SQLStore + PostgresStore)

The PostgreSQL store uses the SQL repository shared with SQLite (`packages/sql/src/repository.ts`, `packages/sql/src/comparison.ts`), with a two-step approach:

1. **`duplicateExpression()`** walks the AST and converts it to `SQLComparisonExpression` nodes (which know how to emit SQL-safe strings).
2. **`toString()`** on the resulting AST emits a SQL WHERE clause fragment.

**Translation table:**

| WQL operator           | SQL equivalent                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `field = 'value'`      | `field = 'value'`                                                                                         |
| `field != value`       | `field IS DISTINCT FROM value` (null-safe)                                                                |
| `field > value`        | `field > value`                                                                                           |
| `field >= value`       | `field >= value`                                                                                          |
| `field < value`        | `field < value`                                                                                           |
| `field <= value`       | `field <= value`                                                                                          |
| `field IN [a, b]`      | `field = 'a' OR field = 'b'` (expanded to OR)                                                             |
| `field CONTAINS value` | `(CASE WHEN jsonb_typeof(field) = 'array' THEN field END) @> '["value"]'::jsonb` (JSONB array membership) |
| `field LIKE "Intro%"`  | `field LIKE 'Intro%'`                                                                                     |
| `field IS NULL`        | `data#>>'{field}' IS NULL` (missing key or JSON null)                                                     |
| `field IS NOT NULL`    | `data#>>'{field}' IS NOT NULL`                                                                            |
| `A AND B`              | `A AND B`                                                                                                 |
| `A OR B`               | `A OR B`                                                                                                  |

Note: `IN` is expanded to an OR chain of equality comparisons. `CONTAINS` uses PostgreSQL's `@>` JSONB operator, on arrays only, to check array membership.

**Example translations:**

```
WQL:  status = 'published' AND viewCount >= 100
SQL:  SELECT * FROM posts WHERE status = 'published' AND viewCount >= 100

WQL:  status IN ['draft', 'published']
SQL:  SELECT * FROM posts WHERE status = 'draft' OR status = 'published'

WQL:  tags CONTAINS 'typescript'
SQL:  SELECT * FROM posts WHERE (CASE WHEN jsonb_typeof(tags) = 'array' THEN tags END) @> '["typescript"]'::jsonb

WQL:  status = 'published' ORDER BY createdAt DESC LIMIT 20
SQL:  SELECT * FROM posts WHERE status = 'published' ORDER BY createdAt DESC LIMIT 20
```

---

## DynamoDB (DynamoStore)

DynamoDB's filter expressions are more restricted than SQL or MongoDB (no full table scans; queries are against a primary key or GSI). The DynamoStore translates WQL to DynamoDB `FilterExpression` objects for the filter portion and uses `KeyConditionExpression` for key-based lookups.

> The exact translation logic is in `packages/aws/src/services/dynamodb.service.ts`. Consult the source for the current implementation.

**Key differences:**

- Queries on non-key attributes require a scan, which is costly
- DynamoDB does not support `LIKE` natively — the store may evaluate LIKE in-memory after the DynamoDB query
- `IS NULL` becomes `attribute_not_exists(field) OR attribute_type(field, NULL)` and `IS NOT NULL` its negation; on a GSI sort key they are evaluated in memory. Empty strings are not stored, so they match `IS NULL`
- OFFSET uses `LastEvaluatedKey` JSON-encoded as a base64 string

---

## Verify

```bash
# Run the ql package tests to verify parsing and in-memory evaluation
npx vitest run packages/ql/src/query.spec.ts
```

```
✓ packages/ql/src/query.spec.ts > QueryTest > dev
✓ packages/ql/src/query.spec.ts > QueryTest > prependQuery
```

```bash
# Run the mongodb package tests (requires a running MongoDB) to verify MongoDB translation
cd packages/mongodb
pnpm test
```

## See also

- [WQL Syntax](./Syntax.md) — grammar and value types
- [Operators](./Operators.md) — operator reference with examples
- [@webda/ql README](./README.md) — package overview and API
- [@webda/core Stores](../core/Stores.md) — Store contract and query interface
