---
sidebar_position: 3
sidebar_label: Operators
---

# WQL Operators

WebdaQL supports comparison operators, logical operators, and special-form operators for set membership, pattern matching, and array inspection.

## Comparison operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `=` | Equal | `status = 'published'` |
| `!=` | Not equal | `status != 'draft'` |
| `>` | Greater than | `viewCount > 1000` |
| `>=` | Greater than or equal | `viewCount >= 100` |
| `<` | Less than | `viewCount < 10` |
| `<=` | Less than or equal | `rating <= 5` |

All comparison operators work on strings, integers, and booleans.

### String comparison

```
username = 'alice'
username != 'admin'
```

### Integer comparison

```
viewCount >= 100
price < 50
rating > 3
```

### Boolean comparison

```
featured = TRUE
deleted = FALSE
```

## Logical operators

### AND

Both conditions must be true. Multiple ANDs at the same level are automatically flattened by the parser.

```
status = 'published' AND viewCount >= 100
```

### OR

At least one condition must be true.

```
status = 'draft' OR status = 'archived'
```

### Grouping with parentheses

Use parentheses to control evaluation order. AND binds more tightly than OR in WQL.

```
(status = 'draft' OR status = 'archived') AND author.active = TRUE
```

## LIKE operator

Pattern matching for strings. Two wildcard characters:

| Wildcard | Meaning |
|----------|---------|
| `_` | Exactly one character |
| `%` | Zero or more characters |

```
title LIKE "Intro%"        -- starts with "Intro"
slug LIKE "%-tutorial"     -- ends with "-tutorial"
username LIKE "a_ice"      -- five chars, second position any char
```

In-memory evaluation (MemoryStore) converts the LIKE pattern to a JavaScript RegExp. Backend stores (MongoDB, PostgreSQL) use their native LIKE/regex support.

```typescript
import * as WebdaQL from "@webda/ql";

const v = new WebdaQL.QueryValidator('title LIKE "Intro%"');
console.log(v.eval({ title: "Introduction to Webda" })); // true
console.log(v.eval({ title: "Advanced Webda" }));        // false
```

## IN operator

Tests if a field's value is one of a set of values.

```
status IN ['published', 'archived']
status IN ['draft', 'published', 'archived']
id IN ['u-1', 'u-2', 'u-3']
```

The set can contain strings, integers, and booleans:

```
code IN [200, 201, 204]
flag IN [TRUE, FALSE]
```

```typescript
const v = new WebdaQL.QueryValidator("status IN ['published', 'archived']");
console.log(v.eval({ status: "published" })); // true
console.log(v.eval({ status: "draft" }));     // false
```

## CONTAINS operator

Tests if an **array field** contains a specific value. This is distinct from IN (which checks a scalar field against a list).

```
tags CONTAINS 'typescript'
categories CONTAINS 'webda'
```

```typescript
const v = new WebdaQL.QueryValidator("tags CONTAINS 'typescript'");
console.log(v.eval({ tags: ["typescript", "webda"] })); // true
console.log(v.eval({ tags: ["javascript"] }));          // false
```

In MongoDB, CONTAINS translates to the same syntax as `=` on an array field (MongoDB checks if the array contains the value).

## ORDER BY clause

Sort results by one or more fields. Default direction is ASC if omitted.

```
ORDER BY createdAt DESC
ORDER BY status ASC, title DESC
ORDER BY viewCount DESC, createdAt ASC
```

```typescript
import * as WebdaQL from "@webda/ql";

const validator = new WebdaQL.QueryValidator(
  "status = 'published' ORDER BY createdAt DESC, title ASC"
);
const query = validator.getQuery();
console.log(query.orderBy);
// [
//   { field: "createdAt", direction: "DESC" },
//   { field: "title",     direction: "ASC"  }
// ]
```

## LIMIT clause

Limit the maximum number of results returned.

```
status = 'published' LIMIT 20
```

```typescript
const validator = new WebdaQL.QueryValidator("status = 'published' LIMIT 20");
const query = validator.getQuery();
console.log(query.limit); // 20
```

## OFFSET clause

Provide an opaque continuation token for keyset pagination. The token is a string (often base64-encoded) returned by the previous page of results.

```
status = 'published' ORDER BY createdAt DESC LIMIT 20 OFFSET "eyJsYXN0IjoiMjAyNC0wMS0wMSJ9"
```

The token is backend-specific. MongoDB uses a numeric offset; DynamoDB uses a LastEvaluatedKey encoded as a JSON string; the in-memory store uses a numeric index. You should treat the token as opaque and pass it back from the previous query's `continuationToken` response field.

## Combining all clauses

```
status = 'published' AND viewCount >= 100
ORDER BY createdAt DESC, title ASC
LIMIT 20
OFFSET "eyJsYXN0S2V5IjoiYWJjZCJ9"
```

Clauses must appear in this order: filter → ORDER BY → LIMIT → OFFSET.

## Verify

```bash
npx vitest run packages/ql/src/query.spec.ts
```

The spec file covers all operators including equality, LIKE, IN, CONTAINS, >=, <=, >, <, !=, AND, OR, and mixed expressions.

## See also

- [WQL Syntax overview](./Syntax.md) — grammar, value types, identifiers
- [Store Translators](./Translators.md) — how each backend translates these operators
- [@webda/ql README](./README.md) — package overview
