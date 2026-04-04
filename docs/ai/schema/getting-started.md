---
sidebar_position: 2
title: Getting Started
description: Quick start guide for @webda/schema
---

# Getting Started

This guide will help you get started with `@webda/schema` and learn how to generate JSON Schema from TypeScript types.

## Installation

Install the package using your preferred package manager:

```bash
npm install --save-dev @webda/schema
```

```bash
yarn add -D @webda/schema
```

```bash
pnpm add -D @webda/schema
```

## Requirements

- **Node.js:** >=22.0.0
- **Module System:** ES Modules (ESM)
- **TypeScript:** Must be installed in your project

## Basic Imports

Import the schema generator:

```typescript
import { SchemaGenerator } from '@webda/schema';
```

## CLI Usage

The package provides a command-line tool for quick schema generation.

### Basic Command

```bash
webda-schema-generator --type TypeName
```

### CLI Options

| Option | Description | Required |
|--------|-------------|----------|
| `--type <name>` | Type/interface/class name to generate schema for | ✅ Yes |
| `--file <path>` | Restrict search to specific TypeScript file | No |
| `--project <path>` | Path to tsconfig.json or directory containing it | No (defaults to CWD) |
| `--out <file>` | Write schema to file instead of stdout | No |
| `--pretty` | Pretty-print JSON output | No |

### CLI Examples

Generate and print to console:

```bash
webda-schema-generator --type User --file src/models.ts
```

Pretty-print output:

```bash
webda-schema-generator --type User --pretty
```

Write to file:

```bash
webda-schema-generator --type ApiResponse --out schema.json --pretty
```

Specify project:

```bash
webda-schema-generator --type Config --project ./tsconfig.json
```

Restrict to specific file:

```bash
webda-schema-generator --type User --file src/types/user.ts --pretty
```

### Help Command

```bash
webda-schema-generator --help
```

## Programmatic API

Use the schema generator in your TypeScript/JavaScript code.

### Basic Usage

```typescript
import { SchemaGenerator } from '@webda/schema';

// Create generator instance
const generator = new SchemaGenerator({
  project: './tsconfig.json'
});

// Generate schema for a type
const schema = generator.getSchemaForTypeName('User');

// Output the schema
console.log(JSON.stringify(schema, null, 2));
```

### Constructor Options

```typescript
interface GenerateSchemaOptions {
  // Path to tsconfig.json or directory containing it
  project?: string;

  // File that contains the target type (optional)
  file?: string;

  // Maximum recursion depth (default: 10)
  maxDepth?: number;

  // Generate schema with $ref definitions (default: false)
  asRef?: boolean;

  // Logging function
  log?: (...args: any[]) => void;

  // Existing TypeScript Program to use
  program?: ts.Program;

  // Buffer serialization strategy
  bufferStrategy?: 'base64' | 'binary' | 'hex' | 'array';

  // Custom buffer mapper
  mapBuffer?: (definition: JSONSchema7, ctx: { type: ts.Type; path: string }) => void;

  // Disable boolean default to false
  disableBooleanDefaultToFalse?: boolean;

  // Schema type (input/output)
  type?: 'input' | 'output';

  // Transformer function
  transformer?: (options: SchemaPropertyArguments) => SchemaPropertyArguments;
}
```

### Generate Schema by Type Name

```typescript
const generator = new SchemaGenerator({
  project: './tsconfig.json'
});

// Find and generate schema for a type by name
const userSchema = generator.getSchemaForTypeName('User');
```

### Generate Schema from Type

```typescript
const generator = new SchemaGenerator({
  project: './tsconfig.json'
});

// Get TypeScript program
const program = generator.getProgram();
const checker = program.getTypeChecker();

// Find a type
const sourceFile = program.getSourceFile('src/models.ts');
const node = findTypeNode(sourceFile, 'User');
const type = checker.getTypeAtLocation(node);

// Generate schema from type
const schema = generator.getSchemaFromType(type);
```

### Specify File Path

Restrict type search to a specific file:

```typescript
const schema = generator.getSchemaForTypeName(
  'User',
  'src/types/user.ts'
);
```

## Common Use Cases

### 1. Basic Type to Schema

Generate schema for a simple interface:

```typescript
// types.ts
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  active: boolean;
}

// generate.ts
import { SchemaGenerator } from '@webda/schema';

const generator = new SchemaGenerator({
  project: './'
});

const schema = generator.getSchemaForTypeName('User', 'types.ts');

console.log(JSON.stringify(schema, null, 2));
```

Output:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "additionalProperties": false,
  "properties": {
    "active": {
      "default": false,
      "type": "boolean"
    },
    "age": {
      "type": "number"
    },
    "email": {
      "type": "string"
    },
    "id": {
      "type": "string"
    },
    "name": {
      "type": "string"
    }
  },
  "required": ["id", "name", "email", "age"],
  "type": "object"
}
```

### 2. Optional Properties

Handle optional properties:

```typescript
interface Product {
  id: string;
  name: string;
  description?: string;  // Optional
  price: number;
}

const schema = generator.getSchemaForTypeName('Product');
```

Result: `description` will NOT be in the `required` array.

### 3. Union Types

Generate schemas for union types:

```typescript
type Status = 'pending' | 'active' | 'completed';

const schema = generator.getSchemaForTypeName('Status');
```

Output:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "enum": ["pending", "active", "completed"],
  "type": "string"
}
```

### 4. Generic Types

Handle generic types:

```typescript
interface Response<T> {
  data: T;
  status: number;
  message: string;
}

interface User {
  id: string;
  name: string;
}

type UserResponse = Response<User>;

const schema = generator.getSchemaForTypeName('UserResponse');
```

### 5. Nested Objects

Generate schemas for nested structures:

```typescript
interface Address {
  street: string;
  city: string;
  country: string;
}

interface User {
  id: string;
  name: string;
  address: Address;
}

const schema = generator.getSchemaForTypeName('User');
```

### 6. Arrays and Tuples

Handle arrays and tuples:

```typescript
interface TodoList {
  items: string[];          // Array
  tags: readonly string[];  // Readonly array
  position: [number, number]; // Tuple
}

const schema = generator.getSchemaForTypeName('TodoList');
```

## Configuration

### Using tsconfig.json

By default, the generator uses `tsconfig.json` from the current working directory. You can specify a different project:

```typescript
const generator = new SchemaGenerator({
  project: './config/tsconfig.build.json'
});
```

### Enable Logging

Enable logging to debug schema generation:

```typescript
const generator = new SchemaGenerator({
  project: './',
  log: (...args) => console.log('[SchemaGenerator]', ...args)
});
```

### Maximum Depth

Control recursion depth for nested types:

```typescript
const generator = new SchemaGenerator({
  maxDepth: 20 // Default is 10
});
```

### References vs Inline

Generate schemas with `$ref` definitions:

```typescript
const generator = new SchemaGenerator({
  asRef: true
});

const schema = generator.getSchemaForTypeName('User');
```

Output with references:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$ref": "#/definitions/User",
  "definitions": {
    "User": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" }
      }
    }
  }
}
```

Inline schema (default):

```typescript
const generator = new SchemaGenerator({
  asRef: false // Default
});
```

## Schema Output

### Draft Version

All schemas include the Draft-07 identifier:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### Property Ordering

Properties are sorted alphabetically for consistency:

```typescript
interface User {
  name: string;
  id: string;
  email: string;
}
```

Generates properties in order: `email`, `id`, `name`.

### Required Fields

Required fields are automatically detected and sorted:

```typescript
interface User {
  id: string;        // Required
  name: string;      // Required
  email?: string;    // Optional
}
```

Output:

```json
{
  "required": ["id", "name"]
}
```

## Complete Example

Here's a complete example combining multiple features:

```typescript
// models.ts
/**
 * User account information
 */
interface User {
  /**
   * Unique identifier
   * @format uuid
   */
  id: string;

  /**
   * User's full name
   * @minLength 1
   * @maxLength 100
   */
  name: string;

  /**
   * Email address
   * @format email
   */
  email: string;

  /**
   * User's age
   * @minimum 0
   * @maximum 150
   */
  age: number;

  /**
   * Account status
   */
  status: 'active' | 'inactive' | 'suspended';

  /**
   * Optional profile information
   */
  profile?: {
    bio: string;
    website?: string;
  };

  /**
   * User roles
   */
  roles: string[];
}

// generate-schema.ts
import { SchemaGenerator } from '@webda/schema';
import { writeFileSync } from 'fs';

const generator = new SchemaGenerator({
  project: './tsconfig.json',
  log: console.log // Enable logging
});

const schema = generator.getSchemaForTypeName('User', 'models.ts');

// Write to file
writeFileSync(
  'user.schema.json',
  JSON.stringify(schema, null, 2),
  'utf-8'
);

console.log('Schema generated successfully!');
```

## Next Steps

- [Advanced Features](./advanced-features.md) - Learn about transformers, buffer strategies, and JSDoc
- [API Reference](./api-reference.md) - Complete API documentation

## Troubleshooting

### Type Not Found

If you get "Type not found" errors:

1. Check the type name spelling
2. Ensure the type is exported
3. Verify the file path is correct
4. Check your `tsconfig.json` includes the file

### Memory Issues

For large projects with deep recursion:

```typescript
const generator = new SchemaGenerator({
  maxDepth: 5 // Reduce from default 10
});
```

### TypeScript Compilation Errors

Ensure your TypeScript project compiles without errors:

```bash
npx tsc --noEmit
```

The schema generator uses the same TypeScript compiler configuration.
