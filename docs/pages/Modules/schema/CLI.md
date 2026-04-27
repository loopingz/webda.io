---
sidebar_position: 4
sidebar_label: CLI Reference
---

# CLI Reference — `webda-schema-generator`

The `webda-schema-generator` binary (shipped with `@webda/schema`) generates a JSON Schema Draft-07 document from any TypeScript type name and writes it to stdout or a file.

## Synopsis

```bash
webda-schema-generator --type <TypeName> [options]
```

## Options

| Flag | Required | Description |
|------|----------|-------------|
| `--type <TypeName>` | **Yes** | Name of the interface, class, or type alias to generate a schema for |
| `--file <path>` | No | Restrict the type search to this specific source file (relative or absolute) |
| `--project <dir\|tsconfig>` | No | Directory containing `tsconfig.json`, or path to the tsconfig file itself. Defaults to `process.cwd()` |
| `--out <file>` | No | Write the JSON schema to this file instead of printing to stdout |
| `--pretty` | No | Pretty-print the JSON output (2-space indent) |
| `--help` / `-h` | No | Print help and exit |

## Examples

```bash
# Print the schema for "Args" to stdout (pretty)
webda-schema-generator --type Args --project ./tsconfig.test.json --pretty

# Restrict search to a single file
webda-schema-generator --type MyServiceParameters --file src/service.ts --pretty

# Write to a file
webda-schema-generator --type Config --project ./ --out config.schema.json --pretty
```

## Help output

Running `webda-schema-generator --help` (or using the CLI binary directly from the package lib):

```
schema-gen - Generate JSON Schema from a TypeScript type

Usage:
  schema-gen --type <TypeName> [--file <relative/or/absolute/path>] [--project <tsconfigDirOrFile>] [--out schema.json] [--pretty]

Examples:
  schema-gen --type User --file src/models.ts
  schema-gen --type ApiResponse --project ./

Options:
  --type     Name of interface/class/type alias (required)
  --file     Restrict search to a specific file (optional)
  --project  Directory containing tsconfig.json or path to tsconfig.json (defaults CWD)
  --out      Write schema JSON to file instead of stdout
  --pretty   Pretty-print JSON output
```

## Live example

The following command was run against the `@webda/schema` package itself, using its test tsconfig which includes both source and test files:

```bash
cd packages/schema
node lib/cli.js --type Args --project ./tsconfig.test.json --pretty
```

Output:

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

## Error handling

| Situation | Exit code | Message |
|-----------|-----------|---------|
| `--type` missing | `1` | `Error: --type is required` + help |
| Type not found | `1` | `Failed generating schema: Type "X" not found` |
| tsconfig not found | `1` | `Failed generating schema: Could not find tsconfig.json` |
| Success | `0` | Schema JSON (to stdout or file) |

## Environment variable

Set `SCHEMA_TRACE=1` to enable handler match trace logging during generation. This is an internal debugging mechanism; trace output goes to the generator's internal log callback (not printed by the CLI by default).

## Integration with `webdac build`

The Webda compiler (`webdac build`) runs schema generation automatically after TypeScript compilation. You do not normally need to invoke `webda-schema-generator` directly. Use it when:

- You need a schema for a specific type (e.g. for OpenAPI documentation)
- You want to generate schemas as part of a CI artifact
- You are debugging why a field constraint is or isn't appearing in the generated schema

## Verify

```bash
cd packages/schema
node lib/cli.js --type Args --project ./tsconfig.test.json --pretty
```

The command should print the JSON schema shown above and exit with code 0.

## See also

- [JSON Schema Generation](./JSON-Schema.md) — programmatic API and configuration options
- [Validation](./Validation.md) — using generated schemas with ajv for runtime validation
- [@webda/compiler](../compiler/README.md) — `webdac build` orchestrates schema generation
