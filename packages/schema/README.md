# @webda/schema module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

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

- [`SchemaGenerator`](../../docs/pages/Modules/schema/JSON-Schema.md) — main class
- [Validation](../../docs/pages/Modules/schema/Validation.md) — runtime request validation with ajv
- [CLI reference](../../docs/pages/Modules/schema/CLI.md) — `webda-schema-generator` flags

### See also

- [@webda/compiler](../compiler/README.md) — `webdac build` triggers schema generation
- [@webda/core](../core/README.md) — `ServiceParameters` types that are schema-generated

<!-- README_FOOTER -->
## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
