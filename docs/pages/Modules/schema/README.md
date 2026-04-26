---
sidebar_label: "@webda/schema"
---
# schema

## @webda/schema

TypeScript-compiler–powered JSON Schema (Draft-07) generator for interfaces, classes, and type aliases — the tool that produces the `.webda-config-schema.json` and `.webda-deployment-schema.json` files that power VS Code autocomplete for Webda projects.

### When to use it

- You want VS Code (or any JSON-Schema-aware editor) to autocomplete and validate `webda.config.jsonc` — the schema files are generated automatically by `webdac build`.
- You need to generate a JSON Schema from any TypeScript type programmatically (e.g. for API documentation, runtime validation, or OpenAPI generation).
- You want to validate incoming request bodies or model payloads against a generated schema using ajv.

### Install

```bash
npm install @webda/schema
```

The `webda-schema-generator` CLI binary is included in the package.

### Configuration (webda.config.jsonc)

Add a `$schema` pointer to get in-editor autocomplete:

```jsonc
// webda.config.jsonc
{
  "$schema": "./.webda-config-schema.json",
  "version": 3,
  "services": {
    "myStore": {
      "type": "MemoryStore",
      "model": "MyApp/MyModel"
    }
  }
}
```

The schema file is regenerated every time you run `webdac build`.

### Usage — Programmatic API

```typescript
import { SchemaGenerator } from "@webda/schema";

const generator = new SchemaGenerator({ project: process.cwd() });

// Generate schema for a named type
const schema = generator.getSchemaForTypeName("MyServiceParameters");
console.log(JSON.stringify(schema, null, 2));
```

**`GenerateSchemaOptions`** key options:

| Option | Default | Description |
|--------|---------|-------------|
| `project` | `process.cwd()` | Path to tsconfig directory or file |
| `file` | — | Restrict search to this source file |
| `maxDepth` | `10` | Max recursion depth for nested types |
| `asRef` | `false` | Emit top-level type as a `$ref` into `definitions` |
| `bufferStrategy` | `"base64"` | How `Buffer`/`ArrayBuffer` is represented |
| `accessorMode` | `"input"` | `"input"` excludes getter-only props; `"output"` includes them |

### Usage — CLI

```bash
# Generate schema for a TypeScript type and print to stdout
webda-schema-generator --type MyServiceParameters --file src/service.ts --pretty

# Write to a file
webda-schema-generator --type Config --project ./ --out config.schema.json --pretty
```

CLI options:

| Flag | Required | Description |
|------|----------|-------------|
| `--type <TypeName>` | Yes | Interface / class / type alias name |
| `--file <path>` | No | Restrict search to specific source file |
| `--project <dir\|tsconfig>` | No | tsconfig directory or path (default: CWD) |
| `--out <file>` | No | Write schema to file instead of stdout |
| `--pretty` | No | Pretty-print JSON |

### Reference

- [`SchemaGenerator`](_media/JSON-Schema.md) — main class
- [Validation](_media/Validation.md) — runtime request validation with ajv
- [CLI reference](_media/CLI.md) — `webda-schema-generator` flags

### See also

- [@webda/compiler](_media/README.md) — `webdac build` triggers schema generation
- [@webda/core](_media/README-1.md) — `ServiceParameters` types that are schema-generated
