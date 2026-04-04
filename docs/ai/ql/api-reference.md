---
sidebar_position: 4
title: API Reference
description: Complete API reference for @webda/ql
---

# API Reference

Complete reference documentation for all classes, functions, and types exported by @webda/ql.

## QueryValidator

Main class for parsing and evaluating queries.

```typescript
class QueryValidator {
  constructor(sql: string, builder?: ExpressionBuilder);

  eval(target: any): boolean;
  getExpression(): Expression;
  getQuery(): Query;
  getLimit(): number;
  getOffset(): string;
  hasCondition(): boolean;
  merge(query: string, type?: "OR" | "AND"): this;
  toString(): string;
  displayTree(tree?: ParseTree): string;
}
```

### Constructor

Create a new query validator from a query string.

```typescript
constructor(sql: string, builder?: ExpressionBuilder)
```

**Parameters:**
- `sql`: Query string to parse
- `builder`: Optional custom expression builder (default: `ExpressionBuilder`)

**Throws:**
- `SyntaxError` if query is invalid

**Example:**
```typescript
import { QueryValidator } from '@webda/ql';

const validator = new QueryValidator("age > 18 AND status = 'active'");

// With custom builder
import { PartialExpressionBuilder } from '@webda/ql';
const custom = new QueryValidator("age > 18", new PartialExpressionBuilder());
```

### eval()

Evaluate the query against an object.

```typescript
eval(target: any): boolean
```

**Parameters:**
- `target`: Object to evaluate

**Returns:** `true` if object matches query, `false` otherwise

**Example:**
```typescript
const validator = new QueryValidator("age >= 18");

validator.eval({ age: 25 });  // true
validator.eval({ age: 16 });  // false

// Filter array
const users = [
  { name: "Alice", age: 25 },
  { name: "Bob", age: 16 }
];
const adults = users.filter(u => validator.eval(u));
// [{ name: "Alice", age: 25 }]
```

### getExpression()

Get the parsed expression object.

```typescript
getExpression(): Expression
```

**Returns:** The root expression object

**Example:**
```typescript
const validator = new QueryValidator("age > 18 AND status = 'active'");
const expr = validator.getExpression();

console.log(expr.toString());
// "age > 18 AND status = 'active'"

console.log(expr instanceof AndExpression);  // true
```

### getQuery()

Get the complete query object including metadata.

```typescript
getQuery(): Query
```

**Returns:** Query object with filter, limit, offset, and orderBy

**Example:**
```typescript
const validator = new QueryValidator(
  "age > 18 ORDER BY name DESC LIMIT 50"
);

const query = validator.getQuery();
console.log(query.filter);  // Expression object
console.log(query.limit);  // 50
console.log(query.orderBy);  // [{ field: "name", direction: "DESC" }]
console.log(query.continuationToken);  // undefined
console.log(query.toString());  // "age > 18 ORDER BY name DESC LIMIT 50"
```

### getLimit()

Get the LIMIT value.

```typescript
getLimit(): number
```

**Returns:** Limit value, or 1000 if not specified

**Example:**
```typescript
const q1 = new QueryValidator("LIMIT 50");
console.log(q1.getLimit());  // 50

const q2 = new QueryValidator("age > 18");
console.log(q2.getLimit());  // 1000 (default)
```

### getOffset()

Get the OFFSET token.

```typescript
getOffset(): string
```

**Returns:** Offset token, or empty string if not specified

**Example:**
```typescript
const q1 = new QueryValidator('OFFSET "page-2-token"');
console.log(q1.getOffset());  // "page-2-token"

const q2 = new QueryValidator("age > 18");
console.log(q2.getOffset());  // ""
```

### hasCondition()

Check if query has filter conditions.

```typescript
hasCondition(): boolean
```

**Returns:** `true` if query has conditions, `false` if empty

**Example:**
```typescript
const q1 = new QueryValidator("age > 18");
console.log(q1.hasCondition());  // true

const q2 = new QueryValidator("");
console.log(q2.hasCondition());  // false

const q3 = new QueryValidator("LIMIT 50");
console.log(q3.hasCondition());  // false
```

### merge()

Merge another query into this one.

```typescript
merge(query: string, type?: "OR" | "AND"): this
```

**Parameters:**
- `query`: Query string to merge
- `type`: Logical operator to use (default: `"AND"`)

**Returns:** `this` (for chaining)

**Example:**
```typescript
const validator = new QueryValidator("status = 'active'");

// Merge with AND (default)
validator.merge("age > 18");
console.log(validator.toString());
// "status = 'active' AND age > 18"

// Merge with OR
const v2 = new QueryValidator("role = 'admin'");
v2.merge("role = 'moderator'", "OR");
console.log(v2.toString());
// "role = 'admin' OR role = 'moderator'"

// Merge overwrites LIMIT, OFFSET, ORDER BY
const v3 = new QueryValidator("LIMIT 10");
v3.merge("LIMIT 20");
console.log(v3.toString());  // "LIMIT 20"
```

### toString()

Get string representation of the query.

```typescript
toString(): string
```

**Returns:** Query string

**Example:**
```typescript
const validator = new QueryValidator(
  "age > 18 ORDER BY name DESC LIMIT 50"
);

console.log(validator.toString());
// "age > 18 ORDER BY name DESC LIMIT 50"
```

### displayTree()

Get the original query string as parsed.

```typescript
displayTree(tree?: ParseTree): string
```

**Parameters:**
- `tree`: Optional parse tree node (default: root)

**Returns:** Query string as parsed

**Example:**
```typescript
const validator = new QueryValidator("age>18AND status='active'");
console.log(validator.displayTree());
// "age > 18 AND status = 'active'" (formatted)
```

## SetterValidator

Validator for setting object properties safely.

```typescript
class SetterValidator extends QueryValidator {
  constructor(sql: string);

  eval(target: any): boolean;
}
```

### Constructor

Create a new setter validator.

```typescript
constructor(sql: string)
```

**Parameters:**
- `sql`: Assignment expression (must use `=` and `AND` only)

**Throws:**
- `SyntaxError` if expression contains non-assignment operators

**Example:**
```typescript
import { SetterValidator } from '@webda/ql';

// Valid
const setter1 = new SetterValidator('name = "Alice" AND age = 30');

// Invalid - throws SyntaxError
try {
  const setter2 = new SetterValidator('age > 18');  // Not an assignment
} catch (error) {
  console.error(error.message);
  // "Set Expression can only contain And and assignment expression '='"
}

try {
  const setter3 = new SetterValidator('name = "Alice" OR age = 30');  // OR not allowed
} catch (error) {
  console.error(error.message);
}
```

### eval()

Set properties on the target object.

```typescript
eval(target: any): boolean
```

**Parameters:**
- `target`: Object to modify

**Returns:** `true` (always)

**Example:**
```typescript
const setter = new SetterValidator('name = "Alice" AND age = 30');
const user = {};

setter.eval(user);
console.log(user);  // { name: "Alice", age: 30 }

// Nested properties
const setter2 = new SetterValidator('user.profile.name = "Bob"');
const data = {};
setter2.eval(data);
console.log(data);
// { user: { profile: { name: "Bob" } } }

// Update existing
const existing = { name: "Old", age: 25 };
const updater = new SetterValidator('name = "New"');
updater.eval(existing);
console.log(existing);  // { name: "New", age: 25 }
```

### Prototype Pollution Protection

SetterValidator automatically blocks `__proto__` access:

```typescript
const malicious = new SetterValidator('__proto__.isAdmin = TRUE');
const obj = {};

malicious.eval(obj);

console.log(obj.__proto__.isAdmin);  // undefined (blocked)
console.log({}.isAdmin);  // undefined (safe)
```

## PartialValidator

Validator for partial object matching.

```typescript
class PartialValidator extends QueryValidator {
  constructor(query: string, builder?: PartialExpressionBuilder);

  eval(target: any, partial?: boolean): boolean;
  wasPartialMatch(): boolean;
}
```

### Constructor

Create a new partial validator.

```typescript
constructor(query: string, builder?: PartialExpressionBuilder)
```

**Parameters:**
- `query`: Query string
- `builder`: Optional custom builder (default: `PartialExpressionBuilder`)

**Example:**
```typescript
import { PartialValidator } from '@webda/ql';

const validator = new PartialValidator("name = 'John' AND age > 18");
```

### eval()

Evaluate query with partial matching support.

```typescript
eval(target: any, partial?: boolean): boolean
```

**Parameters:**
- `target`: Object to evaluate
- `partial`: Enable partial matching (default: `true`)

**Returns:** `true` if object matches (considering partial mode)

**Example:**
```typescript
const validator = new PartialValidator("name = 'John' AND age > 18");

// Partial mode (default) - missing fields ignored
const partial = { name: "John" };  // age missing
console.log(validator.eval(partial));  // true
console.log(validator.wasPartialMatch());  // true

// Complete object
const complete = { name: "John", age: 25 };
console.log(validator.eval(complete));  // true
console.log(validator.wasPartialMatch());  // false

// Strict mode - missing fields cause failure
console.log(validator.eval(partial, false));  // false
```

### wasPartialMatch()

Check if last evaluation was a partial match.

```typescript
wasPartialMatch(): boolean
```

**Returns:** `true` if any fields were missing in last evaluation

**Example:**
```typescript
const validator = new PartialValidator("name = 'John' AND age > 18 AND email LIKE '%@%'");

// Two fields missing
validator.eval({ name: "John" });
console.log(validator.wasPartialMatch());  // true

// One field missing
validator.eval({ name: "John", age: 25 });
console.log(validator.wasPartialMatch());  // true

// All fields present
validator.eval({ name: "John", age: 25, email: "john@example.com" });
console.log(validator.wasPartialMatch());  // false
```

## Expression Classes

Abstract base class and implementations for query expressions.

### Expression

Abstract base class for all expressions.

```typescript
abstract class Expression<T = string> {
  operator: T;

  constructor(operator: T);

  abstract eval(target: any): boolean;
  abstract toString(depth?: number): string;
}
```

**Properties:**
- `operator`: The operator type for this expression

**Methods:**
- `eval(target)`: Evaluate expression against object
- `toString(depth?)`: Get string representation

### ComparisonExpression

Expression for comparison operations.

```typescript
class ComparisonExpression<T extends ComparisonOperator = ComparisonOperator>
  extends Expression<T>
{
  value: value | value[];
  attribute: string[];

  constructor(operator: T, attribute: string, value: value | any[]);

  eval(target: any): boolean;
  toString(): string;
  setAttributeValue(target: any): void;

  static getAttributeValue(target: any, attribute: string[]): any;
  static likeToRegex(like: string): RegExp;
}
```

**Type Parameters:**
- `T`: Comparison operator type

**Properties:**
- `value`: Right-hand side value(s)
- `attribute`: Property path as array (e.g., `["user", "name"]`)

**Methods:**

#### constructor()

```typescript
constructor(
  operator: ComparisonOperator,
  attribute: string,
  value: value | any[]
)
```

**Example:**
```typescript
import { ComparisonExpression } from '@webda/ql';

const expr = new ComparisonExpression("=", "age", 25);
console.log(expr.eval({ age: 25 }));  // true

const expr2 = new ComparisonExpression("IN", "role", ["admin", "user"]);
console.log(expr2.eval({ role: "admin" }));  // true

const expr3 = new ComparisonExpression("LIKE", "name", "John%");
console.log(expr3.eval({ name: "Johnny" }));  // true
```

#### eval()

Evaluate the comparison.

```typescript
eval(target: any): boolean
```

**Supported Operators:**
- `=` - Loose equality (`==`)
- `!=` - Loose inequality (`!=`)
- `>`, `>=`, `<`, `<=` - Numeric comparisons
- `LIKE` - Pattern matching with wildcards
- `IN` - Set membership
- `CONTAINS` - Array contains value

**Example:**
```typescript
const expr = new ComparisonExpression(">=", "age", 18);
console.log(expr.eval({ age: 25 }));  // true
console.log(expr.eval({ age: 16 }));  // false
```

#### toString()

Get string representation.

```typescript
toString(): string
```

**Example:**
```typescript
const expr = new ComparisonExpression("=", "name", "John");
console.log(expr.toString());  // 'name = "John"'

const expr2 = new ComparisonExpression("IN", "role", ["admin", "user"]);
console.log(expr2.toString());  // 'role IN ["admin", "user"]'
```

#### setAttributeValue()

Set the value on target object (used by SetterValidator).

```typescript
setAttributeValue(target: any): void
```

**Example:**
```typescript
const expr = new ComparisonExpression("=", "user.name", "Alice");
const obj = {};

expr.setAttributeValue(obj);
console.log(obj);  // { user: { name: "Alice" } }
```

#### static getAttributeValue()

Read nested property value from object.

```typescript
static getAttributeValue(target: any, attribute: string[]): any
```

**Example:**
```typescript
const obj = {
  user: {
    profile: {
      name: "Alice"
    }
  }
};

const value = ComparisonExpression.getAttributeValue(
  obj,
  ["user", "profile", "name"]
);
console.log(value);  // "Alice"
```

#### static likeToRegex()

Convert LIKE pattern to RegExp.

```typescript
static likeToRegex(like: string): RegExp
```

**Example:**
```typescript
const regex1 = ComparisonExpression.likeToRegex("John%");
console.log(regex1);  // /John.*/

const regex2 = ComparisonExpression.likeToRegex("test_");
console.log(regex2);  // /test.{1}/

console.log("Johnny".match(regex1));  // ["Johnny"]
console.log("test1".match(regex2));   // ["test1"]
```

### AndExpression

Expression for AND logic.

```typescript
class AndExpression extends LogicalExpression<"AND"> {
  children: Expression[];

  constructor(children: Expression[]);

  eval(target: any): boolean;
  toString(depth?: number): string;
}
```

**Properties:**
- `children`: Array of child expressions (all must be true)

**Example:**
```typescript
import { AndExpression, ComparisonExpression } from '@webda/ql';

const expr = new AndExpression([
  new ComparisonExpression("=", "name", "John"),
  new ComparisonExpression(">", "age", 18)
]);

console.log(expr.eval({ name: "John", age: 25 }));  // true
console.log(expr.eval({ name: "John", age: 16 }));  // false

console.log(expr.toString());
// 'name = "John" AND age > 18'
```

### OrExpression

Expression for OR logic.

```typescript
class OrExpression extends LogicalExpression<"OR"> {
  children: Expression[];

  constructor(children: Expression[]);

  eval(target: any): boolean;
  toString(depth?: number): string;
}
```

**Properties:**
- `children`: Array of child expressions (at least one must be true)

**Example:**
```typescript
import { OrExpression, ComparisonExpression } from '@webda/ql';

const expr = new OrExpression([
  new ComparisonExpression("=", "role", "admin"),
  new ComparisonExpression("=", "role", "moderator")
]);

console.log(expr.eval({ role: "admin" }));      // true
console.log(expr.eval({ role: "moderator" }));  // true
console.log(expr.eval({ role: "user" }));       // false

console.log(expr.toString());
// 'role = "admin" OR role = "moderator"'
```

### PartialComparisonExpression

Comparison expression with partial matching support.

```typescript
class PartialComparisonExpression<T extends ComparisonOperator = ComparisonOperator>
  extends ComparisonExpression<T>
{
  constructor(
    builder: PartialExpressionBuilder,
    op: T,
    attribute: string,
    value: any
  );

  eval(target: any): boolean;
}
```

**Example:**
```typescript
import { PartialExpressionBuilder, PartialComparisonExpression } from '@webda/ql';

const builder = new PartialExpressionBuilder();
builder.setPartial(true);

const expr = new PartialComparisonExpression(builder, "=", "name", "John");

// Field present - normal evaluation
console.log(expr.eval({ name: "John" }));  // true
console.log(expr.eval({ name: "Jane" }));  // false

// Field missing - returns true in partial mode
console.log(expr.eval({ age: 25 }));  // true
console.log(builder.partialMatch);  // true
```

## Builder Classes

### ExpressionBuilder

Visitor that builds expression tree from parse tree.

```typescript
class ExpressionBuilder
  extends AbstractParseTreeVisitor<Query>
  implements WebdaQLParserVisitor<any>
{
  limit: number;
  offset: string;
  orderBy: OrderBy[];

  getOffset(): string;
  getLimit(): number;

  // Visitor methods (internal)
  visitLimitExpression(ctx: LimitExpressionContext): void;
  visitOffsetExpression(ctx: OffsetExpressionContext): void;
  visitOrderExpression(ctx: OrderExpressionContext): void;
  visitOrderFieldExpression(ctx: OrderFieldExpressionContext): OrderBy;
  visitWebdaql(ctx: WebdaqlContext): Query;
  visitAndLogicExpression(ctx: AndLogicExpressionContext): AndExpression;
  visitOrLogicExpression(ctx: OrLogicExpressionContext): OrExpression;
  visitBinaryComparisonExpression(ctx: BinaryComparisonExpressionContext): ComparisonExpression;
  visitLikeExpression(ctx: LikeExpressionContext): ComparisonExpression;
  visitInExpression(ctx: InExpressionContext): ComparisonExpression;
  visitContainsExpression(ctx: ContainsExpressionContext): ComparisonExpression;
  visitSetExpression(ctx: SetExpressionContext): value[];
  visitStringLiteral(ctx: StringLiteralContext): string;
  visitBooleanLiteral(ctx: BooleanLiteralContext): boolean;
  visitIntegerLiteral(ctx: IntegerLiteralContext): number;
}
```

### PartialExpressionBuilder

Builder with partial matching support.

```typescript
class PartialExpressionBuilder extends ExpressionBuilder {
  partial: boolean;
  partialMatch: boolean;

  setPartial(partial: boolean): void;
  setPartialMatch(partial: boolean): void;

  // Overridden visitor methods
  visitLikeExpression(ctx: any): PartialComparisonExpression;
  visitBinaryComparisonExpression(ctx: any): PartialComparisonExpression;
  visitInExpression(ctx: any): PartialComparisonExpression;
  visitContainsExpression(ctx: any): PartialComparisonExpression;
}
```

## Type Definitions

### Query

Complete query object with filter and metadata.

```typescript
interface Query {
  filter: Expression;
  limit?: number;
  continuationToken?: string;
  orderBy?: OrderBy[];
  toString(): string;
}
```

**Properties:**
- `filter`: The filter expression
- `limit`: Maximum number of results
- `continuationToken`: Pagination cursor
- `orderBy`: Sorting specification

**Example:**
```typescript
const validator = new QueryValidator(
  "age > 18 ORDER BY name DESC LIMIT 50"
);

const query = validator.getQuery();
console.log(query.filter.toString());  // "age > 18"
console.log(query.limit);  // 50
console.log(query.orderBy);  // [{ field: "name", direction: "DESC" }]
```

### OrderBy

Sort specification for a single field.

```typescript
interface OrderBy {
  field: string;
  direction: "ASC" | "DESC";
}
```

**Properties:**
- `field`: Field name to sort by
- `direction`: Sort direction (`"ASC"` or `"DESC"`)

**Example:**
```typescript
const orderBy: OrderBy[] = [
  { field: "price", direction: "DESC" },
  { field: "name", direction: "ASC" }
];
```

### ComparisonOperator

Union type for comparison operators.

```typescript
type ComparisonOperator =
  | "="
  | "<="
  | ">="
  | "<"
  | ">"
  | "!="
  | "LIKE"
  | "IN"
  | "CONTAINS";
```

### value

Union type for literal values.

```typescript
type value = boolean | string | number;
```

## Utility Functions

### PrependCondition()

Helper to merge query conditions.

```typescript
function PrependCondition(
  query?: string,
  condition?: string
): string
```

**Parameters:**
- `query`: Base query string
- `condition`: Condition to prepend

**Returns:** Merged query string

**Example:**
```typescript
import { PrependCondition } from '@webda/ql';

const result1 = PrependCondition("", "age > 18");
console.log(result1);  // "age > 18"

const result2 = PrependCondition("status = 'active'", "age > 18");
console.log(result2);  // "status = 'active' AND age > 18"

const result3 = PrependCondition("ORDER BY name", "age > 18");
console.log(result3);  // "age > 18 ORDER BY name ASC"
```

### parse()

Parse query string into Query object.

```typescript
function parse(query: string): Query
```

**Parameters:**
- `query`: Query string to parse

**Returns:** Parsed Query object

**Example:**
```typescript
import { parse } from '@webda/ql';

const query = parse("age > 18 ORDER BY name DESC LIMIT 50");

console.log(query.filter.toString());  // "age > 18"
console.log(query.limit);  // 50
console.log(query.orderBy);  // [{ field: "name", direction: "DESC" }]
```

### unsanitize()

Remove HTML entity encoding from query string.

```typescript
function unsanitize(query: string): string
```

**Parameters:**
- `query`: Query string with HTML entities

**Returns:** Decoded query string

**Example:**
```typescript
import { unsanitize } from '@webda/ql';

const encoded = "age &lt; 18 AND score &gt; 85";
const decoded = unsanitize(encoded);
console.log(decoded);  // "age < 18 AND score > 85"
```

## Complete Example

Using the full API in a practical scenario:

```typescript
import {
  QueryValidator,
  SetterValidator,
  PartialValidator,
  PrependCondition,
  ComparisonExpression
} from '@webda/ql';

// 1. Query filtering
const users = [
  { name: "Alice", age: 28, role: "admin", active: true },
  { name: "Bob", age: 34, role: "user", active: true },
  { name: "Charlie", age: 22, role: "user", active: false }
];

const query = new QueryValidator("age > 25 AND active = TRUE");
const filtered = users.filter(u => query.eval(u));
console.log(filtered);
// [{ name: "Alice", ... }, { name: "Bob", ... }]

// 2. Setting properties
const setter = new SetterValidator('status = "verified" AND lastLogin = "2024-01-28"');
const user = { name: "Alice", age: 28 };
setter.eval(user);
console.log(user);
// { name: "Alice", age: 28, status: "verified", lastLogin: "2024-01-28" }

// 3. Partial validation
const validator = new PartialValidator("name = 'Alice' AND age > 25 AND email LIKE '%@%'");
const partial = { name: "Alice", age: 28 };  // email missing
console.log(validator.eval(partial));  // true
console.log(validator.wasPartialMatch());  // true

// 4. Query merging
const base = new QueryValidator("status = 'active'");
base.merge("age > 18");
console.log(base.toString());
// "status = 'active' AND age > 18"

// 5. Complex query with all features
const advanced = new QueryValidator(
  "(role = 'admin' OR role = 'moderator') AND age >= 18 ORDER BY name ASC LIMIT 50"
);

const advQuery = advanced.getQuery();
console.log(advQuery.filter.toString());
// "(role = 'admin' OR role = 'moderator') AND age >= 18"
console.log(advQuery.orderBy);
// [{ field: "name", direction: "ASC" }]
console.log(advQuery.limit);  // 50

// 6. Manual expression building
const expr = new ComparisonExpression("LIKE", "email", "%@example.com");
console.log(expr.eval({ email: "user@example.com" }));  // true
console.log(expr.toString());  // 'email LIKE "%@example.com"'

// 7. LIKE regex conversion
const regex = ComparisonExpression.likeToRegex("test_%");
console.log("test_1".match(regex));  // ["test_1"]
console.log("test_123".match(regex));  // ["test_123"]
```

## Error Handling

All validators throw `SyntaxError` for invalid queries:

```typescript
import { QueryValidator, SetterValidator } from '@webda/ql';

// Invalid query syntax
try {
  const invalid = new QueryValidator("age INVALID 18");
} catch (error) {
  console.error(error instanceof SyntaxError);  // true
  console.error(error.message);  // Detailed parsing error
}

// Invalid setter (non-assignment)
try {
  const invalid = new SetterValidator("age > 18");
} catch (error) {
  console.error(error.message);
  // "Set Expression can only contain And and assignment expression '='"
}

// Safe usage
function safeQuery(queryString: string) {
  try {
    return new QueryValidator(queryString);
  } catch (error) {
    console.error("Invalid query:", error.message);
    return null;
  }
}

const validator = safeQuery(userInput);
if (validator) {
  // Use validator
}
```

## Next Steps

- [Getting Started](./getting-started.md) - Basic usage guide
- [Query Syntax](./query-syntax.md) - Complete syntax reference
