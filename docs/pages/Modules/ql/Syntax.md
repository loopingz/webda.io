---
sidebar_position: 2
sidebar_label: WQL Syntax
---

# WQL Syntax

WebdaQL (WQL) is a structured query language for filtering, ordering, and paginating Webda Store results. It is parsed by an ANTLR4 grammar (`WebdaQLParser.g4` + `WebdaQLLexer.g4`) and evaluated either in-memory or translated to a backend-native query.

## Grammar overview

```
webdaql     : (statement | filterQuery) EOF ;
filterQuery : expression? orderExpression? limitExpression? offsetExpression? ;
statement   : SELECT fieldList whereClause? orderExpression? limitExpression? offsetExpression?
            | DELETE whereClause? limitExpression?
            | UPDATE SET assignmentList whereClause? limitExpression? ;
```

The statements (`SELECT`, `DELETE`, `UPDATE`) are described in [Statements](./Statements.md): field lists are parse-level only and DELETE / UPDATE run through the repository `deleteMany` / `updateMany`, never through the Query operations. A plain filter query is an implicit SELECT of every field; it is composed of four optional sections, always in this order:

| Section | Syntax                            | Purpose                              |
| ------- | --------------------------------- | ------------------------------------ |
| Filter  | `expression`                      | Predicate — which records to include |
| Order   | `ORDER BY field [ASC\|DESC], ...` | Sort order                           |
| Limit   | `LIMIT <integer>`                 | Maximum number of results            |
| Offset  | `OFFSET "<token>"`                | Continuation token for pagination    |

Values (and the `LIMIT` / `OFFSET` values) can also be `?` or `:name` placeholders, bound from parameters: see [Parameters](./Parameters.md).

## Filter expressions

```antlr
expression
    : identifier LIKE (stringLiteral | parameter)       #likeExpression
    | identifier IN (setExpression | parameter)         #inExpression
    | identifier CONTAINS (stringLiteral | parameter)   #containsExpression
    | identifier IS NULL                      #isNullExpression
    | identifier IS NOT NULL                  #isNotNullExpression
    | identifier (= | != | >= | <= | < | >) (values | parameter | functionCall)   #binaryComparisonExpression
    | expression AND expression               #andLogicExpression
    | expression OR expression                #orLogicExpression
    | LR_BRACKET expression RR_BRACKET        #subExpression
    | atom                                    #atomExpression
    ;
```

## Value types

WQL supports three primitive value types in filter expressions:

| Type        | Examples                                                 |
| ----------- | -------------------------------------------------------- |
| **String**  | `'published'`, `"hello world"` (single or double quotes) |
| **Number**  | `42`, `0`, `-5`, `3.14` (no exponent form such as `1e3`) |
| **Boolean** | `TRUE`, `FALSE`                                          |

Sets, used by `IN`, are written with square brackets: `status IN ['draft', 'review']`. They cannot be empty.

A character the grammar does not know (for example `#`) is a syntax error; it is never silently ignored.

## Identifiers

Identifiers can include a single dot to access nested properties:

```
status               → root property "status"
author.name          → nested "author.name"
tags.0.label         → first element of tags array, label field
```

## Example queries

### Simple equality

```
status = 'published'
```

### Compound condition

```
status = 'published' AND viewCount >= 100
```

### OR with grouping

```
status = 'draft' OR (status = 'published' AND viewCount < 10)
```

### Set membership

```
status IN ['published', 'archived']
```

### Pattern match (LIKE)

```
title LIKE "Intro%"
```

`_` matches exactly one character, `%` matches zero or more characters.

### Array contains

```
tags CONTAINS 'typescript'
```

### Null checks

```
deletedAt IS NULL
author.email IS NOT NULL
```

### Ordering and pagination

```
status = 'published' ORDER BY createdAt DESC, title ASC LIMIT 20 OFFSET "eyJsYXN0S2V5IjoiMTIzIn0="
```

## NOW() time function

WebdaQL provides the `NOW()` function to represent timestamps as milliseconds since UNIX epoch (`Date.now()`).

### Syntax

- `NOW()`: current timestamp.
- `NOW('offset')`: current timestamp with a duration string offset (e.g., `NOW('-5m')`, `NOW('+1d')`, `NOW('-1d2h')`).
- `NOW(offset)`: current timestamp with a millisecond offset (e.g., `NOW(-300000)`).
- `NOW(?)` / `NOW(:param)`: parameterized offset.

### Supported duration units

| Unit         | Suffixes             | Example         |
| ------------ | -------------------- | --------------- |
| Milliseconds | `ms`                 | `NOW('-500ms')` |
| Seconds      | `s`, `sec`           | `NOW('-30s')`   |
| Minutes      | `m`, `min`           | `NOW('-15m')`   |
| Hours        | `h`, `hr`            | `NOW('+2h')`    |
| Days         | `d`, `day`           | `NOW('-7d')`    |
| Months       | `mo`, `mon`, `month` | `NOW('-1mo')`   |
| Years        | `y`, `yr`, `year`    | `NOW('-1y')`    |

Offsets can combine segments, such as `NOW('-1d2h')` (1 day and 2 hours in the past) or `NOW('+1h30m')`.

### Dynamic evaluation

Unlike static literals, `NOW()` returns a dynamic timestamp resolved when the query is evaluated or executed:

```typescript
@Operation({
  id: "SensitiveAction",
  permission: "mfa = 'verified' AND mfaAt > NOW('-10m')"
})
```

Cached queries dynamically re-evaluate `NOW()` against the current clock time each time permissions or filters are checked.

## Query normalization

The `QueryValidator` class parses and normalizes queries. It flattens nested AND/OR of the same type and canonicalizes string quoting to double quotes:

```typescript
import * as WebdaQL from "@webda/ql";

const v = new WebdaQL.QueryValidator("status = 'published' AND (viewCount >= 100 AND title LIKE 'Intro%')");
console.log(v.getExpression().toString());
// Output: status = "published" AND viewCount >= 100 AND title LIKE "Intro%"
// Note: nested AND is flattened
```

## Merging queries with PrependCondition

Use `PrependCondition` to insert a mandatory system-level condition in front of a user-supplied query, while preserving ORDER BY / LIMIT / OFFSET:

```typescript
import { PrependCondition } from "@webda/ql";

const merged = PrependCondition(`status = 'published' ORDER BY title ASC LIMIT 10`, `authorId = 'u-123'`);
console.log(merged);
// status = "published" AND authorId = "u-123" ORDER BY title ASC LIMIT 10
```

## In-memory evaluation

The parsed expression can be evaluated directly against a JavaScript object without any database:

```typescript
import * as WebdaQL from "@webda/ql";

const validator = new WebdaQL.QueryValidator(`status = 'published' AND viewCount >= 100`);

const post = { status: "published", viewCount: 150 };
console.log(validator.eval(post)); // true

const draft = { status: "draft", viewCount: 5 };
console.log(validator.eval(draft)); // false
```

This is exactly how the in-memory store (`MemoryStore`) executes queries — it calls `validator.eval(record)` on each item.

## Verify

```bash
npx vitest run packages/ql/src/query.spec.ts
```

```
✓ packages/ql/src/query.spec.ts > QueryTest > dev
✓ packages/ql/src/query.spec.ts > QueryTest > prependQuery
```

## See also

- [Operators](./Operators.md) — full operator reference with examples
- [Statements](./Statements.md) — SELECT, DELETE, UPDATE and repository bulk operations
- [Store Translators](./Translators.md) — how MongoDB, PostgreSQL, DynamoDB translate WQL
- [@webda/ql README](./README.md) — package overview and API summary
