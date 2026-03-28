---
sidebar_position: 2
title: Getting Started
description: Quick start guide for @webda/ql
---

# Getting Started

This guide will help you get started with `@webda/ql` and learn how to write and evaluate queries.

## Installation

Install the package using your preferred package manager:

```bash
npm install @webda/ql
```

```bash
yarn add @webda/ql
```

```bash
pnpm add @webda/ql
```

## Requirements

- **Node.js:** >=22.0.0
- **Module System:** ES Modules (ESM)

## Basic Imports

Import the validators you need:

```typescript
import { QueryValidator, SetterValidator, PartialValidator } from '@webda/ql';
```

Or import specific classes:

```typescript
import { QueryValidator } from '@webda/ql/lib/query.js';
import {
  ComparisonExpression,
  AndExpression,
  OrExpression
} from '@webda/ql/lib/query.js';
```

## Your First Query

### Simple Comparison

Create and evaluate a basic query:

```typescript
import { QueryValidator } from '@webda/ql';

const validator = new QueryValidator("age > 18");
const person = { name: "Alice", age: 25 };

console.log(validator.eval(person));  // true
```

### Multiple Conditions

Combine conditions with AND:

```typescript
const validator = new QueryValidator("age > 18 AND status = 'active'");

const user1 = { age: 25, status: "active" };
console.log(validator.eval(user1));  // true

const user2 = { age: 25, status: "inactive" };
console.log(validator.eval(user2));  // false

const user3 = { age: 16, status: "active" };
console.log(validator.eval(user3));  // false
```

### Alternative Conditions

Use OR for alternatives:

```typescript
const validator = new QueryValidator("role = 'admin' OR role = 'moderator'");

console.log(validator.eval({ role: "admin" }));      // true
console.log(validator.eval({ role: "moderator" }));  // true
console.log(validator.eval({ role: "user" }));       // false
```

## Common Query Patterns

### 1. Equality Checks

```typescript
// String equality
const q1 = new QueryValidator("name = 'John'");
const q2 = new QueryValidator('email = "john@example.com"');

// Number equality
const q3 = new QueryValidator("age = 25");
const q4 = new QueryValidator("score = 100");

// Boolean equality
const q5 = new QueryValidator("active = TRUE");
const q6 = new QueryValidator("deleted = FALSE");

// Test equality
console.log(q1.eval({ name: "John" }));     // true
console.log(q3.eval({ age: 25 }));          // true
console.log(q5.eval({ active: true }));     // true
```

### 2. Inequality Checks

```typescript
const validator = new QueryValidator("status != 'inactive'");

console.log(validator.eval({ status: "active" }));    // true
console.log(validator.eval({ status: "pending" }));   // true
console.log(validator.eval({ status: "inactive" }));  // false
```

### 3. Numeric Comparisons

```typescript
// Greater than
const gt = new QueryValidator("age > 18");
console.log(gt.eval({ age: 19 }));  // true
console.log(gt.eval({ age: 18 }));  // false

// Greater or equal
const gte = new QueryValidator("score >= 85");
console.log(gte.eval({ score: 85 }));   // true
console.log(gte.eval({ score: 100 }));  // true
console.log(gte.eval({ score: 84 }));   // false

// Less than
const lt = new QueryValidator("price < 100");
console.log(lt.eval({ price: 99 }));   // true
console.log(lt.eval({ price: 100 }));  // false

// Less or equal
const lte = new QueryValidator("quantity <= 50");
console.log(lte.eval({ quantity: 50 }));  // true
console.log(lte.eval({ quantity: 30 }));  // true
console.log(lte.eval({ quantity: 51 }));  // false

// Range check
const range = new QueryValidator("age >= 18 AND age <= 65");
console.log(range.eval({ age: 25 }));   // true
console.log(range.eval({ age: 17 }));   // false
console.log(range.eval({ age: 66 }));   // false
```

### 4. Pattern Matching with LIKE

Use `LIKE` for pattern matching with wildcards:

- `%` matches zero or more characters
- `_` matches exactly one character

```typescript
// Starts with
const startsWith = new QueryValidator("name LIKE 'John%'");
console.log(startsWith.eval({ name: "John" }));       // true
console.log(startsWith.eval({ name: "Johnny" }));     // true
console.log(startsWith.eval({ name: "John Smith" })); // true
console.log(startsWith.eval({ name: "Bob" }));        // false

// Ends with
const endsWith = new QueryValidator("email LIKE '%@example.com'");
console.log(endsWith.eval({ email: "user@example.com" }));     // true
console.log(endsWith.eval({ email: "admin@example.com" }));    // true
console.log(endsWith.eval({ email: "user@other.com" }));       // false

// Contains
const contains = new QueryValidator("description LIKE '%important%'");
console.log(contains.eval({ description: "This is important" }));     // true
console.log(contains.eval({ description: "Very important task" }));   // true
console.log(contains.eval({ description: "Regular task" }));          // false

// Single character wildcard
const pattern = new QueryValidator("code LIKE 'A_C'");
console.log(pattern.eval({ code: "ABC" }));  // true
console.log(pattern.eval({ code: "AXC" }));  // true
console.log(pattern.eval({ code: "ABCD" })); // false

// Complex patterns
const complex = new QueryValidator("filename LIKE 'report_____%.pdf'");
console.log(complex.eval({ filename: "report_2024_jan.pdf" }));  // true
console.log(complex.eval({ filename: "report_2024.pdf" }));      // false
```

### 5. Set Membership with IN

Check if a value is in a set:

```typescript
// String sets
const roles = new QueryValidator("role IN ['admin', 'moderator', 'user']");
console.log(roles.eval({ role: "admin" }));      // true
console.log(roles.eval({ role: "moderator" }));  // true
console.log(roles.eval({ role: "guest" }));      // false

// Number sets
const scores = new QueryValidator("grade IN [90, 95, 100]");
console.log(scores.eval({ grade: 95 }));   // true
console.log(scores.eval({ grade: 85 }));   // false

// Mixed type sets
const mixed = new QueryValidator("value IN ['text', 123, TRUE]");
console.log(mixed.eval({ value: "text" })); // true
console.log(mixed.eval({ value: 123 }));    // true
console.log(mixed.eval({ value: true }));   // true
console.log(mixed.eval({ value: false }));  // false
```

### 6. Array Operations with CONTAINS

Check if an array contains a specific value:

```typescript
const validator = new QueryValidator("tags CONTAINS 'javascript'");

const post1 = { tags: ["javascript", "typescript", "nodejs"] };
console.log(validator.eval(post1));  // true

const post2 = { tags: ["python", "django"] };
console.log(validator.eval(post2));  // false

const post3 = { tags: [] };
console.log(validator.eval(post3));  // false

// Numeric arrays
const numbers = new QueryValidator("primes CONTAINS 7");
console.log(numbers.eval({ primes: [2, 3, 5, 7, 11] }));  // true
console.log(numbers.eval({ primes: [4, 6, 8, 10] }));     // false
```

### 7. Nested Field Access

Access nested properties using dot notation:

```typescript
const validator = new QueryValidator("user.profile.age > 18");

const data = {
  user: {
    profile: {
      age: 25,
      name: "Alice"
    }
  }
};

console.log(validator.eval(data));  // true

// Multiple nested fields
const nested = new QueryValidator(
  "account.user.email LIKE '%@example.com' AND account.status = 'active'"
);

const account = {
  account: {
    user: {
      email: "alice@example.com"
    },
    status: "active"
  }
};

console.log(nested.eval(account));  // true
```

## Working with QueryValidator

### Creating Validators

```typescript
import { QueryValidator } from '@webda/ql';

// From a query string
const validator = new QueryValidator("age > 18 AND status = 'active'");

// Empty query (matches everything)
const matchAll = new QueryValidator("");
console.log(matchAll.eval({ anything: true }));  // true
```

### Evaluating Objects

```typescript
const validator = new QueryValidator("score >= 85");

// Single object
const result = validator.eval({ score: 90 });
console.log(result);  // true

// Filter an array
const students = [
  { name: "Alice", score: 95 },
  { name: "Bob", score: 78 },
  { name: "Charlie", score: 88 }
];

const passing = students.filter(student => validator.eval(student));
console.log(passing);
// [
//   { name: "Alice", score: 95 },
//   { name: "Charlie", score: 88 }
// ]
```

### Getting Query Information

```typescript
const validator = new QueryValidator(
  "age > 18 ORDER BY name DESC LIMIT 50"
);

// Get the expression
const expression = validator.getExpression();
console.log(expression.toString());  // "age > 18"

// Get query details
const query = validator.getQuery();
console.log(query.limit);  // 50
console.log(query.orderBy);  // [{ field: "name", direction: "DESC" }]

// Get limit and offset
console.log(validator.getLimit());   // 50
console.log(validator.getOffset());  // ""

// Convert back to string
console.log(validator.toString());
// "age > 18 ORDER BY name DESC LIMIT 50"
```

### Merging Queries

Combine multiple queries:

```typescript
const base = new QueryValidator("status = 'active'");

// Merge with AND (default)
base.merge("age > 18");
console.log(base.toString());
// "status = 'active' AND age > 18"

// Merge with OR
const validator = new QueryValidator("role = 'admin'");
validator.merge("role = 'moderator'", "OR");
console.log(validator.toString());
// "role = 'admin' OR role = 'moderator'"

// Merge overwrites LIMIT and OFFSET
const paged = new QueryValidator("status = 'active' LIMIT 10");
paged.merge("LIMIT 20");
console.log(paged.toString());
// "status = 'active' LIMIT 20"
```

## Setting Object Properties

Use `SetterValidator` to safely set object properties:

```typescript
import { SetterValidator } from '@webda/ql';

// Set single property
const setter1 = new SetterValidator('name = "Alice"');
const user1 = {};
setter1.eval(user1);
console.log(user1);  // { name: "Alice" }

// Set multiple properties
const setter2 = new SetterValidator('name = "Bob" AND age = 30 AND active = TRUE');
const user2 = {};
setter2.eval(user2);
console.log(user2);  // { name: "Bob", age: 30, active: true }

// Set nested properties
const setter3 = new SetterValidator('user.profile.name = "Charlie" AND user.role = "admin"');
const data = {};
setter3.eval(data);
console.log(data);
// {
//   user: {
//     profile: { name: "Charlie" },
//     role: "admin"
//   }
// }

// Update existing object
const existing = { name: "Old Name", age: 25 };
const updater = new SetterValidator('name = "New Name" AND city = "New York"');
updater.eval(existing);
console.log(existing);
// { name: "New Name", age: 25, city: "New York" }
```

### SetterValidator Restrictions

SetterValidator only allows assignment expressions with `=` operator:

```typescript
import { SetterValidator } from '@webda/ql';

// Valid - only assignments with AND
const valid = new SetterValidator('name = "Alice" AND age = 30');

// Invalid - OR operator not allowed
try {
  const invalid1 = new SetterValidator('name = "Alice" OR age = 30');
} catch (error) {
  console.error(error.message);
  // "Set Expression can only contain And and assignment expression '='"
}

// Invalid - comparison operators not allowed
try {
  const invalid2 = new SetterValidator('age > 18 AND name = "Alice"');
} catch (error) {
  console.error(error.message);
  // "Set Expression can only contain And and assignment expression '='"
}
```

### Prototype Pollution Protection

SetterValidator automatically protects against prototype pollution:

```typescript
import { SetterValidator } from '@webda/ql';

const malicious = new SetterValidator('__proto__.isAdmin = TRUE');
const obj = {};

malicious.eval(obj);

// The property is NOT set
console.log(obj.__proto__.isAdmin);  // undefined
console.log({}.isAdmin);  // undefined

// Object is safe
console.log(obj);  // {}
```

## Partial Validation

Use `PartialValidator` for validating incomplete objects:

```typescript
import { PartialValidator } from '@webda/ql';

const validator = new PartialValidator("name = 'John' AND age > 18 AND email LIKE '%@example.com'");

// Partial object - only has name
const partial1 = { name: "John" };
console.log(validator.eval(partial1));  // true (partial match)
console.log(validator.wasPartialMatch());  // true

// Partial object - has name and age
const partial2 = { name: "John", age: 25 };
console.log(validator.eval(partial2));  // true (partial match)
console.log(validator.wasPartialMatch());  // true

// Complete object - has all fields
const complete = { name: "John", age: 25, email: "john@example.com" };
console.log(validator.eval(complete));  // true (full match)
console.log(validator.wasPartialMatch());  // false

// Failed match - present field doesn't match
const failed = { name: "Jane", age: 25 };
console.log(validator.eval(failed));  // false
console.log(validator.wasPartialMatch());  // true

// Strict validation (no partial matching)
console.log(validator.eval(partial1, false));  // false (age undefined)
```

## Error Handling

Handle syntax errors gracefully:

```typescript
import { QueryValidator } from '@webda/ql';

try {
  const invalid = new QueryValidator("name INVALID 'test'");
} catch (error) {
  console.error("Syntax error:", error.message);
  // Provides details about the parsing error
}

try {
  const unclosed = new QueryValidator("name = 'unclosed");
} catch (error) {
  console.error("Parsing failed:", error.message);
}
```

## Practical Examples

### Example 1: User Filtering API

```typescript
import { QueryValidator } from '@webda/ql';

const users = [
  { id: 1, name: "Alice", age: 28, role: "admin", active: true },
  { id: 2, name: "Bob", age: 34, role: "user", active: true },
  { id: 3, name: "Charlie", age: 22, role: "user", active: false },
  { id: 4, name: "Diana", age: 45, role: "moderator", active: true }
];

// Filter active admins
const query1 = new QueryValidator("role = 'admin' AND active = TRUE");
console.log(users.filter(u => query1.eval(u)));
// [{ id: 1, name: "Alice", ... }]

// Filter users over 30
const query2 = new QueryValidator("age > 30");
console.log(users.filter(u => query2.eval(u)));
// [{ id: 2, name: "Bob", ... }, { id: 4, name: "Diana", ... }]

// Filter staff (admin or moderator)
const query3 = new QueryValidator("role = 'admin' OR role = 'moderator'");
console.log(users.filter(u => query3.eval(u)));
// [{ id: 1, name: "Alice", ... }, { id: 4, name: "Diana", ... }]
```

### Example 2: Product Search

```typescript
import { QueryValidator } from '@webda/ql';

const products = [
  { name: "Laptop", price: 999, category: "electronics", tags: ["computer", "work"] },
  { name: "Mouse", price: 25, category: "electronics", tags: ["computer", "accessories"] },
  { name: "Desk", price: 299, category: "furniture", tags: ["office", "work"] },
  { name: "Chair", price: 199, category: "furniture", tags: ["office", "ergonomic"] }
];

// Electronics under $100
const affordable = new QueryValidator("category = 'electronics' AND price < 100");
console.log(products.filter(p => affordable.eval(p)));
// [{ name: "Mouse", ... }]

// Work-related items
const workItems = new QueryValidator("tags CONTAINS 'work'");
console.log(products.filter(p => workItems.eval(p)));
// [{ name: "Laptop", ... }, { name: "Desk", ... }]

// Affordable furniture or accessories
const query = new QueryValidator(
  "(category = 'furniture' AND price < 250) OR tags CONTAINS 'accessories'"
);
console.log(products.filter(p => query.eval(p)));
// [{ name: "Mouse", ... }, { name: "Chair", ... }]
```

### Example 3: Configuration Validation

```typescript
import { QueryValidator } from '@webda/ql';

function validateConfig(config: any): string[] {
  const errors: string[] = [];

  // Check required fields
  if (!new QueryValidator("port > 0 AND port < 65536").eval(config)) {
    errors.push("Invalid port number");
  }

  if (!new QueryValidator("host LIKE '%'").eval(config)) {
    errors.push("Host is required");
  }

  if (!new QueryValidator("environment IN ['dev', 'staging', 'production']").eval(config)) {
    errors.push("Invalid environment");
  }

  if (new QueryValidator("environment = 'production'").eval(config)) {
    if (!new QueryValidator("ssl = TRUE").eval(config)) {
      errors.push("SSL must be enabled in production");
    }
  }

  return errors;
}

const config = {
  port: 3000,
  host: "localhost",
  environment: "dev",
  ssl: false
};

console.log(validateConfig(config));  // []

const badConfig = {
  port: 99999,
  host: "",
  environment: "testing",
  ssl: false
};

console.log(validateConfig(badConfig));
// ["Invalid port number", "Invalid environment"]
```

## Next Steps

- [Query Syntax](./query-syntax.md) - Complete syntax reference with all operators and clauses
- [API Reference](./api-reference.md) - Detailed API documentation for all classes
