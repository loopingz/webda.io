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

- [WQL Syntax reference](../../docs/pages/Modules/ql/Syntax.md)
- [Operators](../../docs/pages/Modules/ql/Operators.md)
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
