---
sidebar_position: 1
title: Overview
description: Introduction to @webda/ql - SQL-like query language for filtering and querying JavaScript objects
---

# @webda/ql

A powerful SQL-like query language for filtering and querying JavaScript objects, built with ANTLR4 for robust parsing and expression evaluation.

## What is @webda/ql?

`@webda/ql` (WebdaQL) is a domain-specific query language that brings SQL-like syntax to JavaScript object filtering. It provides a safe, expressive way to:

- **Query Objects** - Filter JavaScript objects using familiar SQL-like syntax
- **Validate Data** - Ensure objects match specific criteria before processing
- **Update Objects** - Safely set multiple properties using assignment expressions
- **Build APIs** - Create flexible query interfaces for your applications
- **Secure Filtering** - Built-in protection against prototype pollution attacks

## Key Features

### SQL-Like Syntax

Write intuitive queries that feel like SQL but work on JavaScript objects:

```typescript
import { QueryValidator } from '@webda/ql';

const validator = new QueryValidator("name = 'John' AND age >= 18");

const user = { name: "John", age: 25, active: true };
console.log(validator.eval(user));  // true
```

### Powerful Operators

Support for comparison, pattern matching, and set operations:

```typescript
// Comparison operators
"age > 18"
"status = 'active'"
"score >= 85 AND score <= 100"

// Pattern matching with LIKE
"email LIKE '%@example.com'"
"name LIKE 'John%'"

// Set membership with IN
"role IN ['admin', 'moderator', 'user']"

// Array operations with CONTAINS
"tags CONTAINS 'javascript'"
```

### Nested Field Access

Query deeply nested object properties using dot notation:

```typescript
const validator = new QueryValidator("user.profile.age >= 21");

const data = {
  user: {
    profile: {
      age: 25,
      name: "Alice"
    }
  }
};

validator.eval(data);  // true
```

### Logical Expressions

Combine conditions with AND/OR operators and parentheses:

```typescript
// AND conditions
"name = 'John' AND age > 18"

// OR conditions
"role = 'admin' OR role = 'moderator'"

// Complex expressions with grouping
"(age >= 18 AND age <= 65) OR retired = TRUE"
"status = 'active' AND (role = 'admin' OR permissions CONTAINS 'write')"
```

### Query Modifiers

Add sorting, pagination, and limits to your queries:

```typescript
// Sorting
"age > 18 ORDER BY name ASC"
"created >= '2024-01-01' ORDER BY created DESC, name ASC"

// Pagination
"status = 'active' LIMIT 50"
"category = 'electronics' LIMIT 20 OFFSET 'cursor-token'"

// Combined
"price > 100 ORDER BY price DESC LIMIT 10"
```

### Safe Property Assignment

Set multiple object properties securely with SetterValidator:

```typescript
import { SetterValidator } from '@webda/ql';

const setter = new SetterValidator('name = "Alice" AND age = 30');
const user = {};

setter.eval(user);
console.log(user);  // { name: "Alice", age: 30 }

// Automatic protection against prototype pollution
const malicious = new SetterValidator('__proto__.isAdmin = TRUE');
malicious.eval({});  // Property is NOT set - protected!
```

### Partial Validation

Validate objects that may be incomplete or partial:

```typescript
import { PartialValidator } from '@webda/ql';

const validator = new PartialValidator("name = 'John' AND age > 18");

// Only checks fields that are present
const partial = { name: "John" };  // age is missing
console.log(validator.eval(partial));  // true (partial match)
console.log(validator.wasPartialMatch());  // true

// Strict validation when needed
console.log(validator.eval(partial, false));  // false (age undefined)
```

### ANTLR4-Powered Parser

Robust parsing with proper error handling and syntax validation:

```typescript
try {
  const validator = new QueryValidator("name INVALID 'test'");
} catch (error) {
  console.error(error.message);
  // Provides detailed syntax error information
}
```

## Use Cases

### API Query Endpoints

Build flexible REST APIs with query support:

```typescript
import { QueryValidator } from '@webda/ql';

app.get('/api/users', (req, res) => {
  const query = req.query.filter || '';
  const validator = new QueryValidator(query);

  const users = getAllUsers();
  const filtered = users.filter(user => validator.eval(user));

  res.json(filtered);
});

// Client can query: /api/users?filter=age > 18 AND status = 'active'
```

### Data Validation

Validate incoming data against business rules:

```typescript
const ageValidator = new QueryValidator("age >= 18 AND age <= 120");
const emailValidator = new QueryValidator("email LIKE '%@%'");

function validateUser(user) {
  if (!ageValidator.eval(user)) {
    throw new Error("Invalid age");
  }
  if (!emailValidator.eval(user)) {
    throw new Error("Invalid email");
  }
}
```

### Configuration Management

Filter and query configuration objects:

```typescript
const configs = loadAllConfigurations();

const activeConfigs = configs.filter(
  config => new QueryValidator("enabled = TRUE").eval(config)
);

const productionConfigs = configs.filter(
  config => new QueryValidator("environment = 'production'").eval(config)
);
```

### Search Interfaces

Build advanced search with multiple criteria:

```typescript
function searchProducts(criteria) {
  const query = buildQuery(criteria);
  const validator = new QueryValidator(query);

  return products.filter(product => validator.eval(product));
}

// Example: Search for electronics under $500, in stock
const results = searchProducts({
  category: 'electronics',
  maxPrice: 500,
  inStock: true
});
// Generates: "category = 'electronics' AND price <= 500 AND stock > 0"
```

### Batch Updates

Safely update multiple properties:

```typescript
import { SetterValidator } from '@webda/ql';

function updateUser(userId, updates) {
  const user = findUser(userId);
  const setter = new SetterValidator(updates);

  setter.eval(user);
  saveUser(user);
}

// Update: "status = 'active' AND lastLogin = '2024-01-28'"
```

## Installation

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
- **Dependencies:** antlr4ts ^0.5.0-alpha.4

## Quick Start

```typescript
import { QueryValidator, SetterValidator, PartialValidator } from '@webda/ql';

// Basic filtering
const query = new QueryValidator("age > 18 AND status = 'active'");
const user = { name: "Alice", age: 25, status: "active" };
console.log(query.eval(user));  // true

// Property assignment
const setter = new SetterValidator('name = "Bob" AND age = 30');
const newUser = {};
setter.eval(newUser);
console.log(newUser);  // { name: "Bob", age: 30 }

// Partial validation
const validator = new PartialValidator("name = 'John' AND email LIKE '%@example.com'");
console.log(validator.eval({ name: "John" }));  // true (partial)
console.log(validator.wasPartialMatch());  // true

// Complex queries with sorting and limits
const advanced = new QueryValidator(
  "category = 'books' AND price < 50 ORDER BY price DESC LIMIT 10"
);
const q = advanced.getQuery();
console.log(q.limit);  // 10
console.log(q.orderBy);  // [{ field: "price", direction: "DESC" }]
```

## Language Syntax Overview

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equal | `age = 18` |
| `!=` | Not equal | `status != 'inactive'` |
| `>` | Greater than | `score > 85` |
| `>=` | Greater or equal | `age >= 18` |
| `<` | Less than | `price < 100` |
| `<=` | Less or equal | `quantity <= 50` |
| `LIKE` | Pattern match | `name LIKE 'John%'` |
| `IN` | Set membership | `role IN ['admin', 'user']` |
| `CONTAINS` | Array contains | `tags CONTAINS 'featured'` |

### Logical Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `AND` | Logical AND | `age > 18 AND active = TRUE` |
| `OR` | Logical OR | `role = 'admin' OR role = 'moderator'` |
| `( )` | Grouping | `(age < 18 OR age > 65) AND citizen = TRUE` |

### Value Types

| Type | Example | Notes |
|------|---------|-------|
| String | `'hello'` or `"world"` | Single or double quotes |
| Number | `42`, `3.14`, `0` | Integer or decimal |
| Boolean | `TRUE`, `FALSE` | Case-sensitive keywords |
| Array | `['a', 'b', 123]` | Mixed types supported |

### Clauses

| Clause | Syntax | Example |
|--------|--------|---------|
| ORDER BY | `ORDER BY field [ASC\|DESC]` | `ORDER BY age DESC, name ASC` |
| LIMIT | `LIMIT number` | `LIMIT 50` |
| OFFSET | `OFFSET "token"` | `OFFSET "cursor-abc123"` |

## Security Features

### Prototype Pollution Protection

WebdaQL automatically protects against prototype pollution attacks:

```typescript
import { SetterValidator } from '@webda/ql';

const malicious = new SetterValidator('__proto__.isAdmin = TRUE');
const obj = {};
malicious.eval(obj);

console.log(obj.__proto__.isAdmin);  // undefined (protected!)
console.log({}.isAdmin);  // undefined (safe!)
```

### Query Validation

All queries are validated during parsing, preventing injection attacks:

```typescript
try {
  const invalid = new QueryValidator("'; DROP TABLE users; --");
} catch (error) {
  // Syntax error - invalid query rejected
}
```

## Architecture

WebdaQL uses ANTLR4 for robust parsing:

1. **Lexer** (`WebdaQLLexer.g4`) - Tokenizes input strings
2. **Parser** (`WebdaQLParser.g4`) - Builds parse tree from tokens
3. **Visitor** (`ExpressionBuilder`) - Converts parse tree to expression objects
4. **Evaluator** (`Expression` classes) - Evaluates expressions against objects

```
Query String → Lexer → Parser → Expression Tree → Evaluation Result
```

## Package Information

- **Version:** 4.0.0-beta.1
- **License:** LGPL-3.0-only
- **Repository:** [github.com/loopingz/webda.io](https://github.com/loopingz/webda.io)
- **Node.js:** >=22.0.0
- **Module Type:** ES Module (ESM)

## Next Steps

- [Getting Started](./getting-started.md) - Installation and basic usage
- [Query Syntax](./query-syntax.md) - Complete syntax reference with examples
- [API Reference](./api-reference.md) - Complete API documentation

## Contributing

This package is part of the Webda.io project. Contributions are welcome!

## Support

- **Documentation:** [webda.io/docs](https://webda.io/docs)
- **Issues:** [GitHub Issues](https://github.com/loopingz/webda.io/issues)
- **Community:** Join our community for support and discussions
