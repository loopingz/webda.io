# schema-gen

TypeScript language-service powered JSON Schema generator for interfaces, classes, and type aliases.

## Features
- Uses the real TypeScript compiler + language service for type resolution
- Handles primitives, literals, unions (as enum or anyOf), intersections (allOf), arrays, tuples, objects
- Mapped types (object with `additionalProperties` when key space can't be enumerated)
- Conditional types (apparent type + heuristic branch expansion; may fall back to empty objects for generics)
- Indexed access types (resolved to referenced value type)
- Template literal types (enumerated when finite, else regex `pattern`)
- Generates `$ref` references and shared `definitions` for named types
- Simple zero-dependency argument parsing CLI

## Install

```bash
npm install --save-dev ./schema
```

(Or publish this package and install from your registry.)

## CLI Usage

```bash
webda-schema-generator --type User --file test/Sample.ts --pretty
webda-schema-generator --type Complex --file test/Sample.ts --out complex.schema.json --pretty
```

Options:
- `--type <TypeName>` (required)
- `--file <path>` restrict search to specific file
- `--project <dir|tsconfig>` specify project root or tsconfig path (default: CWD)
- `--out <file>` write output schema to file
- `--pretty` pretty-print JSON

## Programmatic API

```ts
import { generateJsonSchema } from '@webda/schema';

const { schema } = generateJsonSchema({ type: 'User', file: 'test/Sample.ts', project: process.cwd() });
console.log(schema);
```

## JSON Schema Draft
Currently emits Draft-07 with `$schema: http://json-schema.org/draft-07/schema#`.

## Limitations / Future Improvements
## Configuration Options

You can customize generation behavior via internal `GenerationOptions` (see `generateSchema.ts`).

| Option | Default | Description |
| ------ | ------- | ----------- |
| `preferConstForSingletonTuple` | `true` | Single-element const tuples inferred into consuming conditional properties as a `const` string. |
| `enumForMultiTuple` | `true` | Multi-element const string tuples inferred into consuming conditional properties as `enum` rather than array. |
| `preferArrayForTupleOwner` | `true` | The property declaring a const tuple is emitted as an `array` with `prefixItems` (instead of `enum`). |
| `debugTrace` | `false` (enable by setting `SCHEMA_TRACE=1`) | Captures handler match trace records for debugging resolution ordering. |

Set `SCHEMA_TRACE=1` when running the CLI to record handler matches (currently internal; expose as needed).

## Handlers Architecture

Schema generation is modular: see `src/handlers/` for prioritized handlers (primitive, literal, templateLiteral, union, conditional, intersection, arrayTuple, indexedAccess, mapped, object). Each implements:

```ts
interface TypeSchemaHandler {
	id: string;
	priority: number;
	canHandle(type: ts.Type, ctx: GenerationContext): boolean;
	emit(type: ts.Type, ctx: GenerationContext, typeToSchema: (t: ts.Type, forceInline?: boolean) => any): any;
}
```

## Tests

Run `npm test` to execute runtime assertions (`test/run-tests.js`) covering:
- Mapped type key enumeration
- Const tuple + conditional inference propagation
- Template literal enumeration for finite combinations
- Discriminated union expansion (kind/value)

## Limitations / Future Improvements
- Recursive types produce `$ref` but deeper cycle handling is minimal
- Generic conditional branches only partially introspected; branch object literals may appear empty
- Complex mapped types with key remapping or modifiers approximated via `additionalProperties`
- Index signatures still treated implicitly; explicit `patternProperties` could be added
- Union handling ignores `undefined` for optional fields rather than creating `anyOf` with `null`
- Template literal pattern fallback currently simplified; numeric + non-literal placeholders widen to `string`
- Additional snapshot fixtures desired for regression safety
- Trace diagnostics not yet surfaced via public API or CLI flag

## Contributing
PRs welcome – extend `typeToSchema` for more TypeScript constructs.
