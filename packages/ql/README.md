# @webda/ql module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

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
expression? orderExpression? limitExpression? offsetExpression?      -- a filter query (implicit SELECT)
SELECT f1, f2 [WHERE expression] [ORDER BY ...] [LIMIT n] [OFFSET t]
DELETE [WHERE expression] [LIMIT n]
UPDATE SET a = v, b.c = v [WHERE expression] [LIMIT n]
```

Keywords are uppercase only: `select`, `delete`, `set`, `where`... in lowercase are field names.

**Filter expressions** support:
- Comparison: `field = value`, `field != value`, `field > value`, `field >= value`, `field < value`, `field <= value`
- Pattern match: `field LIKE "pattern"` (`_` = single char, `%` = any chars)
- Set membership: `field IN [value, value, ...]`
- Array contains: `field CONTAINS value`
- Null checks: `field IS NULL`, `field IS NOT NULL` (missing, `undefined` or `null`)
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

### Parameters

Never concatenate user input into a query. Pass values as parameters instead, with `?` and an array or `:name` and an object:

```typescript
await Task.query("owner = ? AND status IN ?", [user, ["open", "late"]]);
await Task.query("owner = :owner OR reviewer = :owner", { owner: user });

WebdaQL.bind("priority >= ? LIMIT ?", [2, 10]); // priority >= 2 LIMIT 10
```

Placeholders are only allowed where a value is expected, values are escaped by type, and `= ?` / `!= ?` with `null` become `IS NULL` / `IS NOT NULL`. Template literals passed straight to a query method are escaped the same way at compile time by `webdac`. See [Parameters](../../docs/pages/Modules/ql/Parameters.md).

### Statements: SELECT, DELETE, UPDATE

WebdaQL parses `SELECT`, `DELETE` and `UPDATE` statements; the parsed `Query` carries `type` (`"SELECT"` for a plain filter), `fields` (SELECT) and `assignments` (UPDATE), and `toString()` round-trips them.

- **Field lists are parse-level only**: the Query operations (REST, gRPC, MCP, GraphQL) refuse a `SELECT` field list with a 400, and repositories refuse it in `query()`.
- **DELETE and UPDATE are repository-level operations**: `useRepository(Model).deleteMany("DELETE WHERE ...")` and `updateMany("UPDATE SET ... WHERE ...")` run them in bulk and return the affected count. They **bypass events, hooks, validation and `canAct`**. The Query operations refuse them with a 400, and `query()` / `iterate()` refuse them.

```typescript
const q = WebdaQL.parse("UPDATE SET status = 'archived' WHERE owner = 'bob' LIMIT 10");
q.type;        // "UPDATE"
q.assignments; // [{ field: "status", value: "archived" }]
await useRepository(Task).updateMany("UPDATE SET status = ? WHERE owner = ?", ["archived", "bob"]); // count
```

See [Statements](../../docs/pages/Modules/ql/Statements.md).

### API reference

| Export | Description |
|--------|-------------|
| `QueryValidator` | Parses a WQL string; `eval(obj)` evaluates it, `toString()` normalizes it |
| `bind(query, params)` | Binds `?` / `:name` placeholders to escaped values |
| `escape(parts, values)` | Escapes template literal values (used by the compile-time rewrite) |
| `validateSyntax(query)` | Checks a query against the grammar without evaluating it; placeholders allowed |
| `PrependCondition(query, condition)` | Merges a condition in front of an existing query, preserving ORDER BY / LIMIT / OFFSET |
| `ExpressionBuilder` | ANTLR visitor that builds the optimized expression AST |
| `AndExpression` | Logic AND node |
| `OrExpression` | Logic OR node |
| `ComparisonExpression` | Comparison leaf node |
| `parse(query, allowedFields?)` | Parses a filter or statement; `allowedFields` checks SELECT fields and SET targets |
| `validateQueryFields(query, allowed)` | Checks SELECT fields and SET targets against a field list |
| `assertFilterQuery(query)` | Refuses DELETE, UPDATE and SELECT field lists |
| `Query` | Parsed query result: `{ type, filter, fields?, assignments?, orderBy?, limit?, continuationToken? }` |
| `OrderBy` | `{ field: string; direction: "ASC" \| "DESC" }` |

### See also

- [WQL Syntax reference](../../docs/pages/Modules/ql/Syntax.md)
- [Operators](../../docs/pages/Modules/ql/Operators.md)
- [Parameters](../../docs/pages/Modules/ql/Parameters.md) — binding values safely
- [Statements](../../docs/pages/Modules/ql/Statements.md) — SELECT, DELETE, UPDATE and repository bulk operations
- [Store Translators](../../docs/pages/Modules/ql/Translators.md) — how each Store backend converts WQL

<!-- README_FOOTER -->
## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
