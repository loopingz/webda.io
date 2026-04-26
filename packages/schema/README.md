# @webda/schema module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->
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
