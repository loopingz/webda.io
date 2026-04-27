---
sidebar_position: 2
sidebar_label: JSON Schema Generation
---

# JSON Schema Generation

`@webda/schema` converts TypeScript types — interfaces, classes, and type aliases — into [JSON Schema Draft-07](https://json-schema.org/draft-07) documents using the real TypeScript compiler and language service for accurate type resolution.

## How it works

The `SchemaGenerator` class creates a TypeScript program from your `tsconfig.json`, then walks the type graph to produce a JSON Schema. It handles:

- Primitives, string/number/boolean literals, enums
- Unions (`anyOf`) and intersections (`allOf`)
- Arrays, tuples, and readonly arrays
- Optional and nullable properties
- `Buffer`/`ArrayBuffer` (multiple strategies)
- JSDoc tags: `@description`, `@format`, `@pattern`, `@minimum`, `@maximum`, `@minLength`, `@maxLength`, `@readonly`, `@default`, `@enum`
- Recursive types (via `$ref` into `definitions`)
- Template literal types (finite → `enum`, infinite → `pattern`)
- Conditional and mapped types (best-effort resolution)

## Configuration schema files in Webda

When you run `webdac build`, it generates two schema files at the root of your project:

| File | Covers |
|------|--------|
| `.webda-config-schema.json` | All service parameters known to the current application |
| `.webda-deployment-schema.json` | Deployment-specific overrides |

Add a `$schema` pointer to your `webda.config.json` (or `webda.config.jsonc`) to activate VS Code autocomplete:

```jsonc
{
  "$schema": ".webda/config.schema.json",
  "version": 3,
  "services": {
    "HttpServer": {
      "type": "Webda/HttpServer",
      // VS Code will autocomplete and validate all parameters here
      "port": 18080
    }
  }
}
```

## Programmatic API

### Basic usage

```typescript
import { SchemaGenerator } from "@webda/schema";

// Create a generator bound to a TypeScript project
const generator = new SchemaGenerator({
  project: process.cwd()   // path to directory containing tsconfig.json
});

// Generate a schema for any named type in the project
const schema = generator.getSchemaForTypeName("MyServiceParameters");
console.log(JSON.stringify(schema, null, 2));
```

### Example: generating a schema from an interface with JSDoc constraints

Given this TypeScript source:

```typescript
// src/cli.ts (from @webda/schema itself)
export interface Args {
  /** Path to the tsconfig directory or file */
  project?: string;
  /** Restrict type search to this source file */
  file?: string;
  /** Name of the TypeScript type to generate a schema for */
  type?: string;
  /** Output file path (defaults to stdout) */
  out?: string;
  /** Pretty-print the JSON output */
  pretty?: boolean;
}
```

The generator produces:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "additionalProperties": false,
  "description": "Parsed command-line arguments.",
  "properties": {
    "file": {
      "description": "Restrict type search to this source file",
      "type": "string"
    },
    "out": {
      "description": "Output file path (defaults to stdout)",
      "type": "string"
    },
    "pretty": {
      "default": false,
      "description": "Pretty-print the JSON output",
      "type": "boolean"
    },
    "project": {
      "description": "Path to the tsconfig directory or file",
      "type": "string"
    },
    "type": {
      "description": "Name of the TypeScript type to generate a schema for",
      "type": "string"
    }
  },
  "type": "object"
}
```

Key observations:
- `pretty?: boolean` gets `"default": false` (boolean fields default to false unless `disableBooleanDefaultToFalse: true`)
- JSDoc `@description` text on the interface becomes the top-level `"description"` field
- `additionalProperties: false` is emitted for classes and interfaces by default

### Constructor options

```typescript
const generator = new SchemaGenerator({
  project: "./tsconfig.json",     // or path to directory containing tsconfig.json
  maxDepth: 10,                   // max recursion depth (default: 10)
  asRef: false,                   // emit top-level type as $ref (default: false)
  bufferStrategy: "base64",       // Buffer encoding strategy
  accessorMode: "input",          // "input" | "output"
  disableBooleanDefaultToFalse: false,
});
```

### Buffer strategies

| Strategy | JSON Schema |
|----------|-------------|
| `"base64"` (default) | `{ type: "string", contentEncoding: "base64" }` |
| `"binary"` | `{ type: "string", format: "binary" }` |
| `"hex"` | `{ type: "string", contentEncoding: "hex", pattern: "^[0-9a-fA-F]*$" }` |
| `"array"` | `{ type: "array", items: { type: "integer", minimum: 0, maximum: 255 } }` |

### Accessor mode

- **`"input"`** (default): Getter-only properties are excluded. The schema represents what can be _sent_ to the model.
- **`"output"`**: Getter return types are included. The schema represents what the model _produces_.

## JSDoc annotation reference

These JSDoc tags on TypeScript properties are recognized and emitted directly into the JSON Schema:

| JSDoc tag | JSON Schema keyword |
|-----------|---------------------|
| `@description` | `description` |
| `@format uri` | `format: "uri"` |
| `@pattern ^[a-z]+$` | `pattern` |
| `@minimum 0` | `minimum` |
| `@maximum 100` | `maximum` |
| `@minLength 3` | `minLength` |
| `@maxLength 50` | `maxLength` |
| `@default "draft"` | `default` |
| `@enum ["a", "b"]` | `enum` |
| `@readonly` | `readOnly: true` |

## Verify

```bash
# From the @webda/schema package directory
cd packages/schema
node lib/cli.js --type Args --project ./tsconfig.test.json --pretty
```

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "additionalProperties": false,
  "description": "Parsed command-line arguments.",
  "properties": {
    "file": { "description": "Restrict type search to this source file", "type": "string" },
    "out":  { "description": "Output file path (defaults to stdout)", "type": "string" },
    "pretty": { "default": false, "description": "Pretty-print the JSON output", "type": "boolean" },
    "project": { "description": "Path to the tsconfig directory or file", "type": "string" },
    "type": { "description": "Name of the TypeScript type to generate a schema for", "type": "string" }
  },
  "type": "object"
}
```

## See also

- [Validation](./Validation.md) — using the generated schema to validate incoming data with ajv
- [CLI reference](./CLI.md) — `webda-schema-generator` command flags
- [@webda/compiler](../compiler/README.md) — `webdac build` triggers schema generation automatically
