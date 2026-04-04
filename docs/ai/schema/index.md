---
sidebar_position: 1
title: Overview
description: Introduction to @webda/schema - TypeScript compiler-based JSON Schema generator
---

# @webda/schema

A TypeScript compiler-based JSON Schema (Draft-07) generator that leverages the TypeScript language service for accurate type resolution and schema generation.

## What is @webda/schema?

`@webda/schema` is a sophisticated schema generator that uses the real TypeScript compiler and language service to produce JSON Schema definitions from TypeScript types. Unlike AST-based generators, it provides accurate type resolution for complex TypeScript features including generics, conditional types, and mapped types.

- **Compiler-Powered** - Uses TypeScript's language service for accurate type resolution
- **Advanced Types** - Handles generics, unions, intersections, mapped types, conditional types
- **JSDoc Integration** - Extracts documentation and validation constraints from JSDoc comments
- **Flexible Output** - Generate inline schemas or use `$ref` definitions
- **Buffer Strategies** - Multiple serialization strategies for Node.js Buffer types
- **CLI & API** - Use from command line or programmatically

## Key Features

### 🔧 Real TypeScript Compiler

Uses the TypeScript language service for type resolution, ensuring accurate schema generation that matches TypeScript's type system.

```typescript
import { SchemaGenerator } from '@webda/schema';

const generator = new SchemaGenerator({
  project: './tsconfig.json'
});

const schema = generator.getSchemaForTypeName('User');
```

### 🚀 Advanced TypeScript Support

Handles complex TypeScript constructs that other generators struggle with:

```typescript
// Generics
type Response<T> = {
  data: T;
  status: number;
};

// Conditional types
type ApiResponse<T> = T extends string ? { text: T } : { data: T };

// Mapped types
type Readonly<T> = { readonly [P in keyof T]: T[P] };

// Intersections
type User = Person & Employee & { id: string };

// Template literals
type EventName = `on${Capitalize<string>}`;
```

### 📝 JSDoc Support

Extract rich metadata from JSDoc comments:

```typescript
/**
 * User account information
 * @minimum 18
 * @maximum 120
 */
type Age = number;

/**
 * Email address
 * @format email
 */
type Email = string;

/**
 * @deprecated Use newField instead
 */
oldField?: string;
```

### 💾 Buffer Serialization

Multiple strategies for serializing Node.js Buffer types:

```typescript
const generator = new SchemaGenerator({
  bufferStrategy: 'base64' // 'base64' | 'binary' | 'hex' | 'array'
});

// Or use custom mapping
const generator = new SchemaGenerator({
  mapBuffer: (definition, ctx) => {
    definition.type = 'string';
    definition.format = 'byte';
  }
});
```

### 🎯 Type Transformers

Transform types during schema generation for DTOs and serialization:

```typescript
const generator = new SchemaGenerator({
  transformer: (options) => {
    // Use toJSON() return type instead of class type
    const toJsonMethod = options.type.getProperty('toJSON');
    if (toJsonMethod) {
      const returnType = getReturnType(toJsonMethod);
      return { ...options, type: returnType };
    }
    return options;
  }
});
```

## Installation

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
- **TypeScript:** Installed in your project

## Quick Start

### CLI Usage

Generate schema from the command line:

```bash
# Generate schema for a type
webda-schema-generator --type User --file src/models.ts --pretty

# Write to file
webda-schema-generator --type ApiResponse --out schema.json

# Specify tsconfig
webda-schema-generator --type Config --project ./tsconfig.json
```

### Programmatic Usage

Use the API in your code:

```typescript
import { SchemaGenerator } from '@webda/schema';

const generator = new SchemaGenerator({
  project: './tsconfig.json'
});

// Generate schema for a type name
const schema = generator.getSchemaForTypeName('User');

// Or from a TypeScript type
const type = generator.find('User');
const schema2 = generator.getSchemaFromType(type);

console.log(JSON.stringify(schema, null, 2));
```

## Supported TypeScript Features

| Feature | Support | Notes |
|---------|---------|-------|
| **Primitives** | ✅ Full | string, number, boolean, null, undefined |
| **Literals** | ✅ Full | String, number, boolean literals with `const` |
| **Arrays** | ✅ Full | T[], Array\<T\>, ReadonlyArray\<T\> |
| **Tuples** | ✅ Full | Optional elements, rest elements, readonly |
| **Objects** | ✅ Full | Interfaces, classes, anonymous objects |
| **Unions** | ✅ Full | Emits `anyOf` or `enum` when all const |
| **Intersections** | ✅ Full | Merges object properties, `allOf` for complex |
| **Generics** | ✅ Full | Type parameters resolved at instantiation |
| **Mapped Types** | ✅ Partial | Enumerable keys expanded, else `additionalProperties` |
| **Conditional Types** | ✅ Partial | Apparent type with heuristic branch expansion |
| **Template Literals** | ✅ Partial | Finite combinations → `enum`, else `pattern` |
| **Indexed Access** | ✅ Full | T[K] resolved to referenced value type |
| **Enums** | ✅ Full | String and numeric enums |
| **Type Aliases** | ✅ Full | Resolved and inlined or referenced |
| **Index Signatures** | ✅ Full | Maps to `additionalProperties` |

## Comparison with Other Generators

### vs. ts-json-schema-generator

| Feature | @webda/schema | ts-json-schema-generator |
|---------|--------------|--------------------------|
| TypeScript Compiler | ✅ Language Service | ✅ Compiler API |
| Conditional Types | ✅ Heuristic expansion | ⚠️ Limited |
| Template Literals | ✅ Pattern fallback | ⚠️ Limited |
| Transformers | ✅ Full control | ❌ None |
| Buffer Strategies | ✅ 4 strategies + custom | ❌ None |
| JSDoc Extraction | ✅ Full | ✅ Full |
| Dependencies | 0 runtime | ~15 runtime |
| Bundle Size | Smaller | Larger |

### vs. typescript-json-schema

| Feature | @webda/schema | typescript-json-schema |
|---------|--------------|------------------------|
| Maintenance | ✅ Active | ⚠️ Less active |
| TypeScript Version | Latest | May lag |
| Generics | ✅ Full | ⚠️ Partial |
| Conditional Types | ✅ Supported | ❌ Not supported |
| API Flexibility | ✅ High | ⚠️ Limited |

## Use Cases

### API Schema Generation

Generate JSON Schema for API request/response validation:

```typescript
const generator = new SchemaGenerator({
  project: './tsconfig.json',
  type: 'input' // or 'output'
});

const requestSchema = generator.getSchemaForTypeName('CreateUserRequest');
const responseSchema = generator.getSchemaForTypeName('CreateUserResponse');
```

### OpenAPI Integration

Generate schemas for OpenAPI specifications:

```typescript
const generator = new SchemaGenerator({
  bufferStrategy: 'binary', // OpenAPI binary format
  asRef: false // Inline for OpenAPI
});

const userSchema = generator.getSchemaForTypeName('User');
openApiSpec.components.schemas.User = userSchema;
```

### Configuration Validation

Validate configuration files against TypeScript types:

```typescript
const generator = new SchemaGenerator();
const configSchema = generator.getSchemaForTypeName('AppConfig');

// Use with JSON Schema validator
import Ajv from 'ajv';
const ajv = new Ajv();
const validate = ajv.compile(configSchema);
validate(config); // true or false
```

### DTO Transformation

Generate schemas for Data Transfer Objects:

```typescript
const generator = new SchemaGenerator({
  transformer: (options) => {
    // Use DTO methods instead of full class
    const toDtoMethod = options.type.getProperty('toDto');
    if (toDtoMethod) {
      return { ...options, type: getReturnType(toDtoMethod) };
    }
    return options;
  }
});
```

## Package Information

- **Version:** 0.5.0
- **License:** ISC
- **Node.js:** >=22.0.0
- **Module Type:** ES Module (ESM)
- **Dependencies:** 0 runtime (TypeScript is peer dependency)

## Next Steps

- [Getting Started](./getting-started.md) - Installation and basic usage
- [Advanced Features](./advanced-features.md) - Transformers, buffer strategies, JSDoc
- [API Reference](./api-reference.md) - Complete API documentation

## Contributing

This package is part of the Webda.io project. Contributions are welcome!

## Support

- **Issues:** [GitHub Issues](https://github.com/loopingz/webda.io/issues)
- **Community:** Join our community for support and discussions
