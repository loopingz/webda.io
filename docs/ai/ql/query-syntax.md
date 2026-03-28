---
sidebar_position: 3
title: Query Syntax
description: Complete syntax reference for WebdaQL query language
---

# Query Syntax

Complete reference for WebdaQL query language syntax, operators, and clauses.

## Query Structure

A complete WebdaQL query has the following structure:

```
[expression] [ORDER BY field [ASC|DESC] [, ...]] [LIMIT number] [OFFSET "token"]
```

All parts are optional. An empty query matches all objects.

### Examples

```typescript
// Expression only
"age > 18"

// Expression with ordering
"status = 'active' ORDER BY created DESC"

// Expression with pagination
"category = 'books' LIMIT 50 OFFSET 'page-2-token'"

// Complete query
"price > 10 AND stock > 0 ORDER BY price ASC, name ASC LIMIT 20"
```

## Value Types

### Strings

Strings can use single or double quotes:

```typescript
"name = 'John'"
'name = "John"'
"email = 'user@example.com'"
'path = "C:\\Users\\Documents"'
```

**Escaping:**
- `\'` - Escape single quote in single-quoted string
- `\"` - Escape double quote in double-quoted string
- `\\` - Escape backslash

```typescript
'name = "John\'s book"'
"title = \"The \\\"Best\\\" Guide\""
```

### Numbers

Integer and decimal numbers are supported:

```typescript
"age = 25"
"price = 99.99"
"count = 0"
"temperature = -15"
"score = 3.14159"
```

### Booleans

Boolean values use uppercase keywords:

```typescript
"active = TRUE"
"deleted = FALSE"
"enabled = TRUE AND verified = FALSE"
```

**Note:** Case-sensitive - must be `TRUE` or `FALSE`, not `true`/`false`.

### Arrays

Arrays contain comma-separated values of any type:

```typescript
"role IN ['admin', 'moderator']"
"score IN [90, 95, 100]"
"value IN ['text', 123, TRUE]"
```

## Comparison Operators

### Equal (=)

Check if values are equal:

```typescript
// String equality
"name = 'John'"
"status = 'active'"

// Number equality
"age = 25"
"count = 0"

// Boolean equality
"active = TRUE"
"deleted = FALSE"
```

**Note:** Uses loose equality (`==`), so `1 = TRUE` is true.

### Not Equal (!=)

Check if values are not equal:

```typescript
"status != 'inactive'"
"age != 0"
"deleted != TRUE"
```

### Greater Than (>)

Check if value is greater:

```typescript
"age > 18"
"price > 100"
"score > 0"
```

### Greater or Equal (>=)

Check if value is greater or equal:

```typescript
"age >= 18"
"score >= 85"
"quantity >= 1"
```

### Less Than (<)

Check if value is less:

```typescript
"age < 65"
"price < 100"
"stock < 10"
```

### Less or Equal (<=)

Check if value is less or equal:

```typescript
"age <= 65"
"price <= 99.99"
"quantity <= 100"
```

## Pattern Matching

### LIKE Operator

Match string patterns using wildcards:

- `%` - Matches zero or more characters
- `_` - Matches exactly one character

```typescript
// Starts with
"name LIKE 'John%'"
// Matches: "John", "Johnny", "John Smith"

// Ends with
"email LIKE '%@example.com'"
// Matches: "user@example.com", "admin@example.com"

// Contains
"description LIKE '%important%'"
// Matches: "This is important", "Very important task"

// Exact length with wildcards
"code LIKE 'A__'"
// Matches: "ABC", "A12", "AXZ" (exactly 3 characters starting with A)

// Complex patterns
"filename LIKE 'report_____%.pdf'"
// Matches: "report_2024_jan.pdf", "report_final_v2.pdf"
// (at least 5 characters after underscore, ending with .pdf)
```

### Escaping Wildcards

Escape special characters with backslash:

```typescript
// Match literal underscore
"name LIKE 'user\\_id'"
// Matches: "user_id"
// Does not match: "user1id"

// Match literal percent
"discount LIKE '50\\%'"
// Matches: "50%"

// Match literal backslash
"path LIKE 'C:\\\\Users\\\\%'"
// Matches: "C:\Users\Documents"
```

### Pattern Examples

```typescript
// Email validation
"email LIKE '%@%.%'"

// Phone numbers (XXX-XXX-XXXX)
"phone LIKE '___-___-____'"

// File extensions
"filename LIKE '%.jpg' OR filename LIKE '%.png' OR filename LIKE '%.gif'"

// Alphanumeric codes
"code LIKE 'ABC%' AND code LIKE '%123'"

// Date formats (YYYY-MM-DD)
"date LIKE '____-__-__'"
```

## Set Operations

### IN Operator

Check if value is in a set:

```typescript
// String sets
"role IN ['admin', 'moderator', 'user']"
"status IN ['active', 'pending']"

// Number sets
"grade IN [90, 95, 100]"
"priority IN [1, 2, 3]"

// Mixed types
"value IN ['text', 123, TRUE]"
```

### Examples

```typescript
// Multiple roles
"role IN ['admin', 'superuser']"
// Equivalent to: role = 'admin' OR role = 'superuser'

// Specific values
"status IN ['active', 'verified', 'premium']"

// Numeric ranges (discrete values)
"level IN [1, 5, 10, 20, 50]"

// Combining with other operators
"role IN ['admin', 'moderator'] AND active = TRUE"

// Negation with NOT
"status != 'inactive' AND role IN ['user', 'guest']"
```

## Array Operations

### CONTAINS Operator

Check if an array contains a value:

```typescript
// String in array
"tags CONTAINS 'javascript'"

// Number in array
"scores CONTAINS 100"

// With other conditions
"tags CONTAINS 'featured' AND status = 'published'"
```

### Examples

```typescript
// Blog posts with tag
const post = { tags: ["javascript", "typescript", "tutorial"] };
"tags CONTAINS 'javascript'"  // true

// Product categories
const product = { categories: ["electronics", "computers", "laptops"] };
"categories CONTAINS 'laptops'"  // true

// User permissions
const user = { permissions: ["read", "write", "delete"] };
"permissions CONTAINS 'write'"  // true

// Empty arrays
const empty = { tags: [] };
"tags CONTAINS 'anything'"  // false

// Multiple conditions
"tags CONTAINS 'featured' AND tags CONTAINS 'popular'"
// Note: Requires two separate CONTAINS checks
```

## Logical Operators

### AND Operator

All conditions must be true:

```typescript
// Simple AND
"age > 18 AND status = 'active'"

// Multiple ANDs
"age > 18 AND age < 65 AND active = TRUE"

// With nested fields
"user.age > 18 AND user.verified = TRUE AND user.role = 'member'"
```

**Expression Optimization:**

WebdaQL optimizes AND expressions by flattening nested ANDs:

```typescript
// These are equivalent:
"a = 1 AND b = 2 AND c = 3"
"a = 1 AND (b = 2 AND c = 3)"
"(a = 1 AND b = 2) AND c = 3"

// All become: a = 1 AND b = 2 AND c = 3
```

### OR Operator

At least one condition must be true:

```typescript
// Simple OR
"role = 'admin' OR role = 'moderator'"

// Multiple ORs
"status = 'pending' OR status = 'active' OR status = 'verified'"

// With other operators
"age < 18 OR age > 65 OR disabled = TRUE"
```

**Expression Optimization:**

WebdaQL optimizes OR expressions by flattening nested ORs:

```typescript
// These are equivalent:
"a = 1 OR b = 2 OR c = 3"
"a = 1 OR (b = 2 OR c = 3)"
"(a = 1 OR b = 2) OR c = 3"

// All become: a = 1 OR b = 2 OR c = 3
```

### Operator Precedence

AND has higher precedence than OR:

```typescript
// Without parentheses
"a = 1 OR b = 2 AND c = 3"
// Evaluated as: a = 1 OR (b = 2 AND c = 3)

// With parentheses for clarity
"(a = 1 OR b = 2) AND c = 3"
// Evaluated as specified
```

### Grouping with Parentheses

Use parentheses to control evaluation order:

```typescript
// Age range OR retired
"(age >= 18 AND age <= 65) OR retired = TRUE"

// Multiple role checks
"role = 'admin' AND (status = 'active' OR status = 'trial')"

// Complex conditions
"(category = 'electronics' AND price < 500) OR (category = 'books' AND price < 50)"

// Nested grouping
"status = 'active' AND (role = 'admin' OR (role = 'moderator' AND verified = TRUE))"
```

## Field Access

### Simple Fields

Access top-level properties:

```typescript
"name = 'John'"
"age > 18"
"active = TRUE"
```

### Nested Fields

Access nested properties with dot notation:

```typescript
// One level deep
"user.name = 'John'"
"account.status = 'active'"

// Multiple levels deep
"user.profile.age > 18"
"order.shipping.address.country = 'USA'"

// With other operators
"settings.notifications.email = TRUE"
"data.stats.views > 1000"
```

### Examples

```typescript
// User object
const user = {
  profile: {
    name: "Alice",
    age: 28,
    contact: {
      email: "alice@example.com"
    }
  },
  settings: {
    theme: "dark",
    notifications: true
  }
};

// Queries
"profile.name = 'Alice'"  // true
"profile.age > 25"  // true
"profile.contact.email LIKE '%@example.com'"  // true
"settings.theme = 'dark' AND settings.notifications = TRUE"  // true
```

## ORDER BY Clause

### Basic Ordering

Sort results by one or more fields:

```typescript
// Single field, ascending (default)
"age > 18 ORDER BY name"
"age > 18 ORDER BY name ASC"

// Single field, descending
"status = 'active' ORDER BY created DESC"
```

### Multiple Fields

Sort by multiple fields (comma-separated):

```typescript
// Multiple fields
"status = 'active' ORDER BY priority DESC, created ASC"

// More complex
"category = 'books' ORDER BY rating DESC, price ASC, title ASC"
```

### Direction Keywords

- `ASC` - Ascending order (A to Z, 0 to 9, oldest to newest)
- `DESC` - Descending order (Z to A, 9 to 0, newest to oldest)

```typescript
// Ascending
"ORDER BY name ASC"
"ORDER BY created ASC"

// Descending
"ORDER BY price DESC"
"ORDER BY updated DESC"

// Mixed
"ORDER BY category ASC, price DESC"
```

### Examples

```typescript
// Sort users by age
"ORDER BY age ASC"

// Recent items first
"status = 'published' ORDER BY created DESC"

// Products by price
"category = 'electronics' ORDER BY price ASC"

// Complex sorting
"status = 'active' ORDER BY isPremium DESC, lastLogin DESC, name ASC"
```

### Usage in Code

```typescript
import { QueryValidator } from '@webda/ql';

const validator = new QueryValidator(
  "status = 'active' ORDER BY created DESC, name ASC"
);

const query = validator.getQuery();
console.log(query.orderBy);
// [
//   { field: "created", direction: "DESC" },
//   { field: "name", direction: "ASC" }
// ]

// Apply sorting in your code
const results = items
  .filter(item => validator.eval(item))
  .sort((a, b) => {
    // Sort by created DESC
    if (a.created !== b.created) {
      return b.created - a.created;
    }
    // Then by name ASC
    return a.name.localeCompare(b.name);
  });
```

## LIMIT Clause

Restrict the number of results:

```typescript
// Basic limit
"status = 'active' LIMIT 50"

// With ordering
"category = 'books' ORDER BY price ASC LIMIT 10"

// With expression
"age > 18 AND verified = TRUE LIMIT 100"
```

### Examples

```typescript
import { QueryValidator } from '@webda/ql';

const validator = new QueryValidator("status = 'active' LIMIT 50");

console.log(validator.getLimit());  // 50

const query = validator.getQuery();
console.log(query.limit);  // 50

// Apply limit in your code
const results = items
  .filter(item => validator.eval(item))
  .slice(0, validator.getLimit());
```

### Default Limit

If no LIMIT is specified, `getLimit()` returns 1000 as default:

```typescript
const noLimit = new QueryValidator("status = 'active'");
console.log(noLimit.getLimit());  // 1000
```

## OFFSET Clause

Implement cursor-based pagination:

```typescript
// Basic offset
"status = 'active' OFFSET 'cursor-abc123'"

// With limit
"category = 'books' LIMIT 50 OFFSET 'page-2-token'"

// Complete pagination
"status = 'published' ORDER BY created DESC LIMIT 20 OFFSET 'next-page-token'"
```

### Offset Token

The offset value must be a string (continuation token):

```typescript
import { QueryValidator } from '@webda/ql';

const validator = new QueryValidator('LIMIT 50 OFFSET "page-2-cursor"');

console.log(validator.getOffset());  // "page-2-cursor"

const query = validator.getQuery();
console.log(query.continuationToken);  // "page-2-cursor"
```

### Pagination Example

```typescript
import { QueryValidator } from '@webda/ql';

function paginate(items: any[], query: string) {
  const validator = new QueryValidator(query);
  const limit = validator.getLimit();
  const offset = validator.getOffset();

  // Filter items
  const filtered = items.filter(item => validator.eval(item));

  // Find offset position
  let startIndex = 0;
  if (offset) {
    startIndex = filtered.findIndex(item => item.id === offset);
    if (startIndex < 0) startIndex = 0;
    else startIndex++; // Start after the offset item
  }

  // Get page of results
  const page = filtered.slice(startIndex, startIndex + limit);

  // Generate next cursor
  const nextCursor = page.length === limit
    ? page[page.length - 1].id
    : null;

  return { items: page, nextCursor };
}

// First page
const page1 = paginate(items, "status = 'active' LIMIT 20");

// Next page
const page2 = paginate(items, `status = 'active' LIMIT 20 OFFSET "${page1.nextCursor}"`);
```

## Complete Query Examples

### Example 1: User Search

```typescript
// Find active adult users
"age >= 18 AND status = 'active'"

// Find admins or moderators
"role IN ['admin', 'moderator']"

// Find verified premium users
"verified = TRUE AND subscription = 'premium'"

// Find users by name pattern
"name LIKE 'John%' OR name LIKE '%Smith'"

// Complex user query
"(age >= 18 AND age <= 65) AND (role = 'admin' OR verified = TRUE) AND status != 'banned'"
```

### Example 2: E-commerce

```typescript
// Affordable electronics
"category = 'electronics' AND price <= 500"

// In-stock featured items
"stock > 0 AND tags CONTAINS 'featured'"

// Search by name
"name LIKE '%laptop%' OR description LIKE '%laptop%'"

// Filter and sort
"category = 'books' AND price < 50 ORDER BY rating DESC, price ASC LIMIT 20"

// Complex product filter
"(category = 'electronics' AND price < 1000) OR (category = 'books' AND rating >= 4) ORDER BY popularity DESC LIMIT 50"
```

### Example 3: Content Management

```typescript
// Published articles
"status = 'published' AND publishDate <= '2024-01-28'"

// Recent posts
"status = 'published' ORDER BY created DESC LIMIT 10"

// Author's drafts
"author.id = 'user-123' AND status = 'draft'"

// Search articles
"(title LIKE '%javascript%' OR content LIKE '%javascript%') AND status = 'published'"

// Featured content
"tags CONTAINS 'featured' AND status = 'published' ORDER BY views DESC LIMIT 5"
```

### Example 4: Analytics

```typescript
// High performers
"score >= 85 AND completed = TRUE"

// Recent activity
"lastActive >= '2024-01-01' ORDER BY lastActive DESC"

// User engagement
"sessions > 10 AND totalTime > 3600"

// Conversion tracking
"source IN ['google', 'facebook'] AND converted = TRUE"

// Complex analytics
"(pageViews > 100 OR timeOnSite > 600) AND bounceRate < 0.5 ORDER BY engagementScore DESC LIMIT 100"
```

## Query Composition

### Building Queries Dynamically

```typescript
import { QueryValidator } from '@webda/ql';

function buildUserQuery(filters: any): string {
  const conditions: string[] = [];

  if (filters.minAge) {
    conditions.push(`age >= ${filters.minAge}`);
  }

  if (filters.status) {
    conditions.push(`status = '${filters.status}'`);
  }

  if (filters.roles && filters.roles.length > 0) {
    const roleList = filters.roles.map(r => `'${r}'`).join(', ');
    conditions.push(`role IN [${roleList}]`);
  }

  if (filters.searchName) {
    conditions.push(`name LIKE '%${filters.searchName}%'`);
  }

  let query = conditions.join(' AND ');

  if (filters.sortBy) {
    query += ` ORDER BY ${filters.sortBy}`;
    if (filters.sortDesc) {
      query += ' DESC';
    }
  }

  if (filters.limit) {
    query += ` LIMIT ${filters.limit}`;
  }

  return query;
}

// Usage
const filters = {
  minAge: 18,
  status: 'active',
  roles: ['user', 'member'],
  searchName: 'John',
  sortBy: 'created',
  sortDesc: true,
  limit: 50
};

const query = buildUserQuery(filters);
// "age >= 18 AND status = 'active' AND role IN ['user', 'member'] AND name LIKE '%John%' ORDER BY created DESC LIMIT 50"
```

### Merging Queries

```typescript
import { QueryValidator, PrependCondition } from '@webda/ql';

// Add conditions to existing query
const base = "status = 'active'";
const enhanced = PrependCondition(base, "age > 18");
// Result: "status = 'active' AND age > 18"

// Using merge method
const validator = new QueryValidator("status = 'active'");
validator.merge("age > 18");
console.log(validator.toString());
// "status = 'active' AND age > 18"

// Merge with OR
const validator2 = new QueryValidator("role = 'admin'");
validator2.merge("role = 'moderator'", "OR");
console.log(validator2.toString());
// "role = 'admin' OR role = 'moderator'"
```

## Best Practices

### 1. Use Parentheses for Clarity

```typescript
// Good - clear intention
"(age >= 18 AND age <= 65) OR retired = TRUE"

// Less clear
"age >= 18 AND age <= 65 OR retired = TRUE"
```

### 2. Validate User Input

```typescript
function safeQuery(userInput: string): QueryValidator | null {
  try {
    return new QueryValidator(userInput);
  } catch (error) {
    console.error("Invalid query:", error.message);
    return null;
  }
}
```

### 3. Use Field Access for Nested Data

```typescript
// Good - clear path
"user.profile.email LIKE '%@example.com'"

// Avoid - unclear
"email LIKE '%@example.com'"  // Which email field?
```

### 4. Combine Filters Logically

```typescript
// Good - logical grouping
"(role = 'admin' OR role = 'moderator') AND status = 'active'"

// Inefficient - could be simplified
"(role = 'admin' AND status = 'active') OR (role = 'moderator' AND status = 'active')"
```

### 5. Use IN for Multiple Values

```typescript
// Good - concise
"status IN ['active', 'pending', 'verified']"

// Verbose
"status = 'active' OR status = 'pending' OR status = 'verified'"
```

## Next Steps

- [API Reference](./api-reference.md) - Complete API documentation for QueryValidator and related classes
- [Getting Started](./getting-started.md) - Basic usage examples
