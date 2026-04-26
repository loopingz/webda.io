---
sidebar_label: "@webda/ql"
---
# ql

## @webda/ql — WebdaQL

A structured query language (WQL) for filtering and paginating Webda Store results. WQL queries are parsed by an ANTLR4 grammar and translated to native backend queries by each Store implementation (in-memory, MongoDB, PostgreSQL, DynamoDB).

### When to use it

You need WQL when you call `store.query()` or a relation's `.query()` method. Every Webda Store accepts a WQL string; no raw SQL, MongoDB filter objects, or DynamoDB conditions needed.

```typescript
// Query the User repository
const { results } = await User.getRepository().query(
  `email = 'alice@example.com' LIMIT 1`
);

// Query a relation
const { results: posts } = await user.posts.query(
  `status = 'published' ORDER BY createdAt DESC LIMIT 10`
);
```

### Install

```bash
npm install @webda/ql
```

> This package is a dependency of `@webda/core` — you rarely need to install it directly.

### Syntax overview

```
expression? orderExpression? limitExpression? offsetExpression?
```

**Filter expressions** support:
- Comparison: `field = value`, `field != value`, `field > value`, `field >= value`, `field < value`, `field <= value`
- Pattern match: `field LIKE "pattern"` (`_` = single char, `%` = any chars)
- Set membership: `field IN [value, value, ...]`
- Array contains: `field CONTAINS value`
- Logic: `AND`, `OR`, `( ... )`

**Pagination / ordering:**
- `ORDER BY field [ASC|DESC], ...`
- `LIMIT <integer>`
- `OFFSET "<continuationToken>"`

### Quick examples

```typescript
import * as WebdaQL from "@webda/ql";

// Parse and evaluate against an in-memory object
const validator = new WebdaQL.QueryValidator(
  `status = 'published' AND viewCount >= 100`
);
const post = { status: "published", viewCount: 150 };
console.log(validator.eval(post)); // true

// Prepend a mandatory condition to a user-supplied query
const merged = WebdaQL.PrependCondition(
  `status = 'published' ORDER BY title LIMIT 10`,
  `authorId = 'u-123'`
);
// => 'status = "published" AND authorId = "u-123" ORDER BY title ASC LIMIT 10'
```

### API reference

| Export | Description |
|--------|-------------|
| `QueryValidator` | Parses a WQL string; `eval(obj)` evaluates it, `toString()` normalizes it |
| `PrependCondition(query, condition)` | Merges a condition in front of an existing query, preserving ORDER BY / LIMIT / OFFSET |
| `ExpressionBuilder` | ANTLR visitor that builds the optimized expression AST |
| `AndExpression` | Logic AND node |
| `OrExpression` | Logic OR node |
| `ComparisonExpression` | Comparison leaf node |
| `Query` | Parsed query result: `{ filter, orderBy?, limit?, continuationToken? }` |
| `OrderBy` | `{ field: string; direction: "ASC" \| "DESC" }` |

### See also

- [WQL Syntax reference](_media/Syntax.md)
- [Operators](_media/Operators.md)
- [Store Translators](_media/Translators.md) — how each Store backend converts WQL
