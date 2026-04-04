---
sidebar_position: 3
title: Advanced Features
description: Advanced features of @webda/schema including transformers, buffer strategies, and JSDoc support
---

# Advanced Features

Explore the advanced capabilities of `@webda/schema` for complex schema generation scenarios.

## Type Transformers

Transformers allow you to modify the type being processed during schema generation. This is powerful for generating schemas from DTOs, serialization methods, or computed types.

### Basic Transformer

```typescript
import { SchemaGenerator } from '@webda/schema';

const generator = new SchemaGenerator({
  transformer: (options) => {
    // options contains: type, definition, path, node, depth
    // Return modified options or original
    return options;
  }
});
```

### Transformer Options

The transformer receives a `SchemaPropertyArguments` object:

```typescript
interface SchemaPropertyArguments {
  // TypeScript type being processed
  type: ts.Type;

  // Current JSON Schema definition being built
  definition: JSONSchema7;

  // Schema path (e.g., "/User/address")
  path: string;

  // TypeScript AST node (if available)
  node?: ts.Node;

  // Current recursion depth
  depth: number;
}
```

### Use Case: toJSON Serialization

Generate schemas based on a class's `toJSON()` method instead of its internal structure:

```typescript
class User {
  private password: string;  // Should not be in schema
  public id: string;
  public name: string;

  toJSON() {
    return {
      id: this.id,
      name: this.name
      // password excluded
    };
  }
}

const generator = new SchemaGenerator({
  transformer: (options) => {
    // Check if type has toJSON method
    const toJsonMethod = options.type.getProperty('toJSON');
    if (!toJsonMethod || !options.node) {
      return options;
    }

    // Get the method type
    const methodType = generator.checker.getTypeOfSymbolAtLocation(
      toJsonMethod,
      options.node
    );

    // Get the return type
    const signatures = generator.checker.getSignaturesOfType(
      methodType,
      ts.SignatureKind.Call
    );

    if (signatures.length > 0) {
      const returnType = generator.checker.getReturnTypeOfSignature(
        signatures[0]
      );

      // Replace type with toJSON return type
      return { ...options, type: returnType };
    }

    return options;
  }
});

// Schema will only include id and name, not password
const schema = generator.getSchemaForTypeName('User');
```

### Use Case: DTO Transformation

Generate input schemas from `fromDto()` parameters and output schemas from `toDto()` return types:

```typescript
class Model {
  private internalState: any;

  // DTO for creating/updating
  static fromDto(dto: CreateModelDto): Model {
    return new Model(dto);
  }

  // DTO for serialization
  toDto(): ModelDto {
    return {
      id: this.id,
      name: this.name
    };
  }
}

const generator = new SchemaGenerator({
  transformer: (options) => {
    const schemaType = options.definition.schemaType; // custom metadata

    if (schemaType === 'input') {
      // Use fromDto parameter type
      const fromDtoMethod = options.type.getProperty('fromDto');
      if (fromDtoMethod) {
        const methodType = generator.checker.getTypeOfSymbolAtLocation(
          fromDtoMethod,
          options.node!
        );
        const signatures = generator.checker.getSignaturesOfType(
          methodType,
          ts.SignatureKind.Call
        );
        const params = signatures[0].getParameters();
        if (params.length === 1) {
          const paramType = generator.checker.getTypeOfSymbolAtLocation(
            params[0],
            options.node!
          );
          return { ...options, type: paramType };
        }
      }
    } else if (schemaType === 'output') {
      // Use toDto return type
      const toDtoMethod = options.type.getProperty('toDto');
      if (toDtoMethod) {
        const methodType = generator.checker.getTypeOfSymbolAtLocation(
          toDtoMethod,
          options.node!
        );
        const returnType = generator.checker.getReturnTypeOfSignature(
          generator.checker.getSignaturesOfType(
            methodType,
            ts.SignatureKind.Call
          )[0]
        );
        return { ...options, type: returnType };
      }
    }

    return options;
  }
});
```

### Multiple Transformers

Chain multiple transformation strategies:

```typescript
const generator = new SchemaGenerator({
  transformer: (options) => {
    // First, try toJSON
    let result = toJsonTransformer(options);

    // Then, try DTO transformation
    result = dtoTransformer(result);

    // Finally, apply custom business logic
    result = customTransformer(result);

    return result;
  }
});
```

## Buffer Serialization Strategies

Node.js `Buffer` types can be serialized in multiple ways. Choose the strategy that fits your use case.

### Base64 Strategy (Default)

Represents buffers as base64-encoded strings:

```typescript
const generator = new SchemaGenerator({
  bufferStrategy: 'base64'
});
```

Generated schema:

```json
{
  "type": "string",
  "contentEncoding": "base64",
  "contentMediaType": "application/octet-stream"
}
```

### Binary Strategy

Uses the OpenAPI-compatible `binary` format:

```typescript
const generator = new SchemaGenerator({
  bufferStrategy: 'binary'
});
```

Generated schema:

```json
{
  "type": "string",
  "format": "binary",
  "contentMediaType": "application/octet-stream"
}
```

Best for OpenAPI/Swagger integration.

### Hex Strategy

Represents buffers as hexadecimal strings:

```typescript
const generator = new SchemaGenerator({
  bufferStrategy: 'hex'
});
```

Generated schema:

```json
{
  "type": "string",
  "contentEncoding": "hex",
  "pattern": "^[0-9a-fA-F]+$",
  "contentMediaType": "application/octet-stream"
}
```

### Array Strategy

Represents buffers as arrays of integers (0-255):

```typescript
const generator = new SchemaGenerator({
  bufferStrategy: 'array'
});
```

Generated schema:

```json
{
  "type": "array",
  "items": {
    "type": "integer",
    "minimum": 0,
    "maximum": 255
  }
}
```

### Custom Buffer Mapping

For complete control, provide a custom mapper:

```typescript
const generator = new SchemaGenerator({
  mapBuffer: (definition, ctx) => {
    // Custom logic based on path
    if (ctx.path.includes('image')) {
      definition.type = 'string';
      definition.format = 'byte'; // OpenAPI byte format
      definition.description = 'Base64-encoded image data';
    } else {
      definition.type = 'string';
      definition.contentEncoding = 'base64';
    }
  }
});
```

The `mapBuffer` callback receives:

```typescript
interface BufferContext {
  type: ts.Type;   // TypeScript type
  path: string;    // Schema path like "/User/avatar"
}
```

### ArrayBuffer Support

`ArrayBuffer` types are treated the same as `Buffer`:

```typescript
interface FileData {
  buffer: Buffer;        // Uses bufferStrategy
  arrayBuffer: ArrayBuffer;  // Uses bufferStrategy
}
```

## JSDoc Support

Extract rich metadata from JSDoc comments to enhance your schemas.

### Basic JSDoc

```typescript
/**
 * User account
 */
interface User {
  /**
   * Unique identifier
   */
  id: string;
}
```

Generated schema includes `description`:

```json
{
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique identifier"
    }
  },
  "description": "User account"
}
```

### Validation Constraints

Use JSDoc tags for JSON Schema validation keywords:

```typescript
interface Product {
  /**
   * Product name
   * @minLength 1
   * @maxLength 100
   */
  name: string;

  /**
   * Price in cents
   * @minimum 0
   * @maximum 1000000
   * @multipleOf 1
   */
  price: number;

  /**
   * Product tags
   * @minItems 1
   * @maxItems 10
   * @uniqueItems true
   */
  tags: string[];

  /**
   * Product details
   * @minProperties 1
   * @maxProperties 20
   */
  details: Record<string, string>;
}
```

Generated schema:

```json
{
  "properties": {
    "name": {
      "type": "string",
      "description": "Product name",
      "minLength": 1,
      "maxLength": 100
    },
    "price": {
      "type": "number",
      "description": "Price in cents",
      "minimum": 0,
      "maximum": 1000000,
      "multipleOf": 1
    },
    "tags": {
      "type": "array",
      "description": "Product tags",
      "minItems": 1,
      "maxItems": 10,
      "uniqueItems": true
    },
    "details": {
      "type": "object",
      "description": "Product details",
      "minProperties": 1,
      "maxProperties": 20
    }
  }
}
```

### Format Annotations

Specify string formats:

```typescript
interface Contact {
  /**
   * Email address
   * @format email
   */
  email: string;

  /**
   * Website URL
   * @format uri
   */
  website: string;

  /**
   * User UUID
   * @format uuid
   */
  userId: string;

  /**
   * Creation timestamp
   * @format date-time
   */
  createdAt: string;

  /**
   * IP address
   * @format ipv4
   */
  ipAddress: string;
}
```

Supported formats (JSON Schema Draft-07):
- `date-time`, `date`, `time`
- `email`, `idn-email`
- `hostname`, `idn-hostname`
- `ipv4`, `ipv6`
- `uri`, `uri-reference`, `iri`, `iri-reference`
- `uuid`, `uri-template`
- `json-pointer`, `relative-json-pointer`
- `regex`

### Pattern Constraints

Define regex patterns:

```typescript
interface ApiKey {
  /**
   * API key
   * @pattern ^[A-Za-z0-9]{32}$
   */
  key: string;

  /**
   * Username
   * @pattern ^[a-z0-9_]{3,20}$
   */
  username: string;
}
```

### Boolean Flags

```typescript
interface ApiEndpoint {
  /**
   * Path is deprecated
   * @deprecated
   */
  oldPath?: string;

  /**
   * Read-only identifier
   * @readOnly
   */
  id: string;

  /**
   * Write-only password
   * @writeOnly
   */
  password: string;
}
```

Generated schema:

```json
{
  "properties": {
    "oldPath": {
      "type": "string",
      "deprecated": true
    },
    "id": {
      "type": "string",
      "readOnly": true
    },
    "password": {
      "type": "string",
      "writeOnly": true
    }
  }
}
```

### Default Values

Document default values:

```typescript
interface Config {
  /**
   * Server port
   * @default 3000
   */
  port: number;

  /**
   * Enable debug mode
   * @default false
   */
  debug: boolean;

  /**
   * Log level
   * @default "info"
   */
  logLevel: string;
}
```

### Examples

Provide example values:

```typescript
interface User {
  /**
   * User ID
   * @examples ["user-123", "user-456"]
   */
  id: string;

  /**
   * Age
   * @examples [25, 30, 45]
   */
  age: number;
}
```

### Custom Metadata

Add custom properties using JSON format:

```typescript
interface Product {
  /**
   * Product SKU
   * @customField {"unit": "item", "category": "physical"}
   */
  sku: string;
}
```

### Draft-07 Advanced

```typescript
interface ConditionalSchema {
  /**
   * Country code
   * @if {"properties": {"country": {"const": "US"}}}
   * @then {"properties": {"zipCode": {"pattern": "^[0-9]{5}$"}}}
   * @else {"properties": {"postalCode": {"type": "string"}}}
   */
  country: string;
}
```

### Deprecated Messages

```typescript
interface Api {
  /**
   * Old endpoint
   * @deprecated
   * @deprecationMessage Use /v2/users instead
   */
  oldEndpoint?: string;
}
```

### Markdown Descriptions

```typescript
interface Documentation {
  /**
   * API Documentation
   * @markdownDescription This is a **markdown** description with [links](https://example.com)
   */
  docs: string;
}
```

## Input vs Output Schemas

Generate different schemas for input (request) and output (response):

```typescript
class User {
  id: string;        // Output only
  password: string;  // Input only
  name: string;      // Both

  // Getter-only (output)
  get fullName(): string {
    return this.name;
  }

  // Setter-only (input)
  set newPassword(value: string) {
    this.password = hash(value);
  }
}

// Input schema (for creating/updating)
const inputGenerator = new SchemaGenerator({
  type: 'input'
});
const inputSchema = inputGenerator.getSchemaForTypeName('User');
// Includes: password, name, newPassword
// Excludes: id, fullName

// Output schema (for responses)
const outputGenerator = new SchemaGenerator({
  type: 'output'
});
const outputSchema = outputGenerator.getSchemaForTypeName('User');
// Includes: id, name, fullName
// Excludes: password, newPassword
```

## Type Patterns

Handle complex TypeScript patterns.

### Discriminated Unions

```typescript
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rectangle'; width: number; height: number }
  | { kind: 'triangle'; base: number; height: number };

const schema = generator.getSchemaForTypeName('Shape');
```

Generated schema uses `anyOf`:

```json
{
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "const": "circle" },
        "radius": { "type": "number" }
      },
      "required": ["kind", "radius"]
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "rectangle" },
        "width": { "type": "number" },
        "height": { "type": "number" }
      },
      "required": ["kind", "width", "height"]
    }
  ]
}
```

### Mapped Types

```typescript
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

type Partial<T> = {
  [P in keyof T]?: T[P];
};

interface User {
  id: string;
  name: string;
}

type ReadonlyUser = Readonly<User>;
type PartialUser = Partial<User>;
```

### Conditional Types

```typescript
type IsString<T> = T extends string ? { value: T } : { data: T };

type StringResult = IsString<string>;  // { value: string }
type NumberResult = IsString<number>;  // { data: number }
```

### Template Literal Types

```typescript
type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Endpoint = `/${string}`;
type Route = `${HTTPMethod} ${Endpoint}`;

const schema = generator.getSchemaForTypeName('Route');
```

For finite combinations, generates `enum`. For infinite, generates `pattern`.

## Advanced Configuration

### Boolean Defaults

By default, boolean properties without a default are set to `false`:

```typescript
interface Config {
  enabled: boolean;  // Will have default: false
}
```

Disable this behavior:

```typescript
const generator = new SchemaGenerator({
  disableBooleanDefaultToFalse: true
});
```

### Recursion Control

Prevent infinite recursion in self-referential types:

```typescript
interface TreeNode {
  value: string;
  children: TreeNode[];  // Self-reference
}

const generator = new SchemaGenerator({
  maxDepth: 5  // Stop after 5 levels
});
```

### Reference Generation

Generate reusable type definitions:

```typescript
const generator = new SchemaGenerator({
  asRef: true
});

const schema = generator.getSchemaForTypeName('User');
```

Output:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$ref": "#/definitions/User",
  "definitions": {
    "User": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "address": { "$ref": "#/definitions/Address" }
      }
    },
    "Address": {
      "type": "object",
      "properties": {
        "street": { "type": "string" }
      }
    }
  }
}
```

### Using Existing Program

Reuse an existing TypeScript program:

```typescript
import ts from 'typescript';

const program = ts.createProgram({
  rootNames: ['src/models.ts'],
  options: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext
  }
});

const generator = new SchemaGenerator({
  program: program
});
```

## Next Steps

- [API Reference](./api-reference.md) - Complete API documentation
- [Getting Started](./getting-started.md) - Basic usage guide
