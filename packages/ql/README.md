# @webda/ql

WebdaQL is a SQL-inspired query language for [Webda](https://webda.io) models. It supports filtering, ordering, pagination, field projection, updates, and deletions.

## Installation

```bash
npm install @webda/ql
```

## Quick Start

```ts
import { parse, QueryValidator } from "@webda/ql";

// Filter query
const query = parse("status = 'active' AND age > 18 ORDER BY name DESC LIMIT 50");
query.filter.eval({ status: "active", age: 25 }); // true
query.limit; // 50
query.orderBy; // [{ field: "name", direction: "DESC" }]
```

## Query Syntax

### Filter Queries

The base syntax is a filter expression with optional ordering and pagination:

```
<expression> [ORDER BY <field> ASC|DESC, ...] [LIMIT <n>] [OFFSET '<token>']
```

#### Comparison Operators

| Operator   | Example                        | Description                        |
| ---------- | ------------------------------ | ---------------------------------- |
| `=`        | `status = 'active'`            | Equality (loose)                   |
| `!=`       | `age != 0`                     | Inequality                         |
| `<`        | `age < 18`                     | Less than                          |
| `<=`       | `age <= 65`                    | Less than or equal                 |
| `>`        | `score > 100`                  | Greater than                       |
| `>=`       | `score >= 0`                   | Greater than or equal              |
| `LIKE`     | `name LIKE 'J%'`              | Pattern match (`%` = any, `_` = one char) |
| `IN`       | `role IN ['admin', 'editor']`  | Membership in a set                |
| `CONTAINS` | `tags CONTAINS 'urgent'`       | Array contains value               |

#### Logical Operators

Combine conditions with `AND` and `OR`. Use parentheses for grouping:

```
status = 'active' AND (role = 'admin' OR role = 'editor')
```

#### Values

- Strings: single or double quotes (`'hello'`, `"hello"`)
- Integers: `42`
- Booleans: `TRUE`, `FALSE`

#### Dot Notation

Access nested attributes with dot notation:

```
user.profile.name = 'John'
```

### SELECT (Field Projection)

Select specific fields to return. The `SELECT` keyword is optional when using a comma-separated field list:

```
name, age WHERE status = 'active' ORDER BY name ASC LIMIT 10
```

Or with the explicit `SELECT` keyword:

```
SELECT name, age WHERE status = 'active'
```

Without a `WHERE` clause (select all items, specific fields):

```
name, email
```

Parsed result:

```ts
const q = parse("name, age WHERE status = 'active'");
q.type;   // "SELECT"
q.fields; // ["name", "age"]
q.filter.eval({ status: "active" }); // true
```

### DELETE

Delete items matching a condition:

```
DELETE WHERE status = 'inactive'
delete where age < 18 AND status = 'pending' LIMIT 100
```

Parsed result:

```ts
const q = parse("DELETE WHERE status = 'inactive'");
q.type; // "DELETE"
q.filter.eval({ status: "inactive" }); // true
```

### UPDATE

Update fields on items matching a condition:

```
UPDATE SET status = 'active' WHERE name = 'John'
update set status = 'active', age = 30 where name = 'John'
UPDATE SET profile.verified = true WHERE id = 1
```

Parsed result:

```ts
const q = parse("UPDATE SET status = 'active', age = 30 WHERE name = 'John'");
q.type;        // "UPDATE"
q.assignments; // [{ field: "status", value: "active" }, { field: "age", value: 30 }]
q.filter.eval({ name: "John" }); // true
```

## Field Validation

The `parse()` function accepts an optional `allowedFields` parameter to validate SELECT fields and UPDATE SET targets at parse time:

```ts
const allowed = ["name", "age", "status", "profile.email"];

// Valid fields pass
parse("name, age WHERE status = 'active'", allowed);

// Unknown field throws SyntaxError
parse("name, unknown WHERE status = 'active'", allowed);
// => SyntaxError: Unknown field "unknown". Allowed fields: name, age, status, profile.email
```

You can also validate after parsing with `validateQueryFields()`:

```ts
import { parse, validateQueryFields } from "@webda/ql";

const query = parse("name, age WHERE status = 'active'");
validateQueryFields(query, ["name", "age", "status"]); // OK
validateQueryFields(query, ["status"]); // throws SyntaxError
```

When used with Webda repositories, field validation is automatic: the repository derives allowed fields from the model's JSON Schema metadata.

## API Reference

### `parse(query: string, allowedFields?: string[]): Query`

Parse a query string into a `Query` object. Supports all statement types (filter, SELECT, DELETE, UPDATE).

### `QueryValidator`

Low-level parser for filter expressions. Use `parse()` for full statement support.

```ts
const v = new QueryValidator("status = 'active' AND age > 18");
v.eval({ status: "active", age: 25 }); // true
v.getExpression(); // Expression AST
v.getLimit();      // 1000 (default)
v.getOffset();     // ""
```

### `SetterValidator`

Parse and apply assignment expressions:

```ts
const target: any = {};
new SetterValidator('name = "John" AND age = 30').eval(target);
// target = { name: "John", age: 30 }
```

### `PartialValidator`

Evaluate queries with partial objects (missing fields are treated as matching):

```ts
const v = new PartialValidator("name = 'John' AND age > 18");
v.eval({ name: "John" });        // true (age undefined, skipped)
v.wasPartialMatch();             // true
v.eval({ name: "John" }, false); // false (strict mode)
```

### `PrependCondition(query, condition)`

Merge a condition into an existing query:

```ts
PrependCondition("status = 'active' ORDER BY name LIMIT 10", "age > 18");
// => 'age > 18 AND status = "active" ORDER BY name ASC LIMIT 10'
```

### `validateQueryFields(query, allowedFields)`

Validate SELECT fields and UPDATE assignments against an allowed field list.

### `unsanitize(query)`

Restore `<` and `>` from HTML-sanitized query strings (`&lt;` / `&gt;`).

## Query Interface

```ts
interface Query {
  filter: Expression;
  limit?: number;
  continuationToken?: string;
  orderBy?: { field: string; direction: "ASC" | "DESC" }[];
  type?: "DELETE" | "UPDATE" | "SELECT";
  fields?: string[];
  assignments?: { field: string; value: string | number | boolean }[];
  toString(): string;
}
```

## Grammar

WebdaQL uses an [ANTLR4](https://www.antlr.org/) grammar for parsing filter expressions. The statement-level syntax (SELECT, DELETE, UPDATE) is handled by a TypeScript pre-parser that delegates the filter portion to the ANTLR engine.

**Statement keywords are case-insensitive:** `DELETE`, `UPDATE`, `SET`, `SELECT`, `WHERE`, `TRUE`, `FALSE` can be written in any case (`delete where ...`, `Update Set ...`, etc.).

**Filter-level keywords are case-sensitive and uppercase:** `AND`, `OR`, `LIKE`, `IN`, `CONTAINS`, `ORDER BY`, `ASC`, `DESC`, `LIMIT`, `OFFSET` must remain uppercase as they are handled by the ANTLR grammar.
