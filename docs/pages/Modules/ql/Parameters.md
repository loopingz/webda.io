---
sidebar_position: 4
sidebar_label: Parameters
---

# WQL Parameters

Never build a WQL query by concatenating user input: a value such as `' OR TRUE OR name = '` would change the meaning of the query. Webda gives you two safe ways to put values in a query.

## Template literals (compile time)

A template literal passed directly to a query method is rewritten by `webdac` into an `escape()` call, so every interpolated value is escaped by type:

```typescript
await Task.query(`owner = ${user} AND priority >= ${min}`);
// compiled to: Task.query(escape(["owner = ", " AND priority >= ", ""], [user, min]))
```

Do not put quotes around the interpolation: `escape()` adds them for strings.

The rewrite only applies when the template literal is the argument itself and the code is compiled by `webdac`. A query built in a variable first, a string concatenation, or code run without the Webda compiler (plain `tsc`, esbuild, vitest) is **not** escaped. Use parameters in those cases.

## Parameters (runtime)

Every query entry point accepts the values separately from the query: `Model.query`, `Model.iterate`, a repository's `query` / `iterate`, and a relation's `query` / `iterate`.

```typescript
// Positional: ? with an array, in order
await Task.query("owner = ? AND status IN ?", [user, ["open", "late"]]);

// Named: :name with an object; a name can be used several times
await Task.query("owner = :owner OR reviewer = :owner", { owner: user });

// Pagination values too
await Task.query("status = ? ORDER BY priority DESC LIMIT ? OFFSET ?", ["open", 20, token]);
```

`bind(query, params)` from `@webda/ql` returns the bound query string, if you need it outside a query method:

```typescript
import { bind } from "@webda/ql";

bind("owner = ? AND priority >= ?", ["alice", 2]);
// owner = 'alice' AND priority >= 2
```

### Where placeholders are allowed

Only where the grammar expects a value: the right side of a comparison, an `IN` set (or a whole `IN ?` array), `LIKE` and `CONTAINS` values, `LIMIT` and `OFFSET`. A placeholder can never stand for an attribute, an operator or a keyword, so `? = 1`, `x ? 1` or `ORDER BY ?` are syntax errors.

Placeholders are found by the WQL lexer: a `?` or `:name` inside a quoted string is part of the string, not a placeholder (`time = '10:30' AND x = ?`).

### Escaping

Parameters and template literals share the same escaping:

| Value | Written as |
|-------|-----------|
| string | `'it''s'` (single quotes, `'` doubled, `\` escaped) |
| number | `42`, `-7`, `3.14` (`NaN`, `Infinity` and numbers needing an exponent are rejected) |
| boolean | `TRUE` / `FALSE` |
| `Date` | its ISO string, quoted |
| array | `['a', 'b']`, for `IN` (empty or nested arrays are rejected) |
| object, function, symbol | rejected |

### Null values

WQL has no `NULL` value, only the `IS NULL` / `IS NOT NULL` operators, so `null` and `undefined` are rewritten:

| Query | Value | Result |
|-------|-------|--------|
| `x = ?` | `null` / `undefined` | `x IS NULL` |
| `x != ?` | `null` / `undefined` | `x IS NOT NULL` |
| any other position (`>`, `LIKE`, `IN`, inside a set, `LIMIT`) | `null` / `undefined` | error |

### Errors

Binding throws a `WebdaQLError` when:

- a `?` has no value, or there are more values than `?` placeholders
- a `:name` has no value (only the object's own properties count), or a value is not used
- a query mixes `?` and `:name`
- parameters are given but the query has no placeholder
- a value cannot be written, or is not valid where it is used (for example an array compared with `=`)

A query that still contains a placeholder when it is evaluated fails with `Unbound parameter '?'`: a placeholder is never treated as a value.

## Compile-time checks

Queries with placeholders are still checked by `webdac` at compile time: unknown attributes are reported, exactly as for queries without placeholders. A plain string literal with placeholders is left as is and bound at runtime.

## See also

- [WQL Syntax](./Syntax.md)
- [Operators](./Operators.md)
- [Store Translators](./Translators.md)
