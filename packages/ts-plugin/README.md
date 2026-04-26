# @webda/ts-plugin module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

TypeScript Language Service Plugin + build-time transformer for Webda models. One package, two entry points:

- **IDE** (`index.ts`) — asymmetric getter/setter types on hover, suppresses false TS2322 errors
- **Build** (`transform.ts`) — transforms field declarations into accessor pairs, generates `webda.module.json`

## Problem

When `createdAt: Date` is transformed at build time into a getter/setter where the setter accepts `string | number | Date`, the source `.ts` file still declares `createdAt: Date`. Without this plugin:

- Hover shows `Date` instead of the widened setter type
- `user.createdAt = "2024-01-01"` shows a false TS2322 error
- Build transforms and `webda.module.json` generation require a separate `webdac` step

## Setup

### IDE only (Language Service Plugin)

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      { "name": "@webda/ts-plugin" }
    ]
  }
}
```

For VS Code: Command Palette → "TypeScript: Select TypeScript Version" → "Use Workspace Version".

### IDE + Build (with ts-patch)

```bash
npm install -D ts-patch @webda/ts-plugin
npx ts-patch install
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@webda/ts-plugin",
        "transform": "@webda/ts-plugin/transform",
        "afterDeclarations": "@webda/ts-plugin/transform",
        "generateModule": true
      }
    ]
  }
}
```

Then `tspc` (ts-patch's patched tsc) replaces both `tsc` and `webdac`:

```bash
# Before: tsc && webdac build
# After:
tspc
```

## Configuration

```jsonc
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@webda/ts-plugin",
        "transform": "@webda/ts-plugin/transform",
        // Additional model base classes (Model and UuidModel are always included)
        "modelBases": ["MyCustomBaseModel"],
        // Package namespace for webda.module.json (auto-detected from package.json)
        "namespace": "MyApp",
        // Additional coercion rules beyond Date
        "coercions": {
          "Decimal": { "setterType": "string | number | Decimal" }
        },
        // Generate webda.module.json (default: true)
        "generateModule": true
      }
    ]
  }
}
```

## Architecture

```
Source code:        createdAt: Date;

                    ┌─── IDE (tsserver) ──────────────────────┐
                    │  LS Plugin (src/index.ts)                │
                    │  - Widened hover info                    │
                    │  - Suppresses TS2322 for valid setters   │
                    └─────────────────────────────────────────┘

                    ┌─── Build (tspc via ts-patch) ───────────┐
                    │  Transformer (src/transform.ts)          │
                    │                                          │
                    │  "before" phase:                         │
                    │    Emitted .js gets getter/setter:       │
                    │    get createdAt() { ... }               │
                    │    set createdAt(value) { ... }          │
                    │                                          │
                    │  "afterDeclarations" phase:              │
                    │    Emitted .d.ts gets asymmetric types:  │
                    │    get createdAt(): Date;                │
                    │    set createdAt(v: string|number|Date); │
                    │                                          │
                    │    + generates webda.module.json         │
                    └─────────────────────────────────────────┘
```

## Files

```
src/
├── index.ts                        # LS plugin entry (export = init)
├── transform.ts                    # ts-patch transformer entry (export default + afterDeclarations)
├── analyzer.ts                     # Shared: class hierarchy walker, coercible property finder
├── coercions.ts                    # Shared: coercion registry (Date -> string|number|Date)
└── transforms/
    ├── accessors.ts                # AST transformer: field -> getter/setter
    └── module-generator.ts         # Generates webda.module.json from program analysis
```

## Migration from @webda/compiler

The module generator in this plugin is a scaffold covering core model/service discovery. The full `@webda/compiler` module.ts handles additional concerns:

- JSON Schema generation via `@webda/schema`
- Metadata plugins (Actions, Events, PrimaryKey, Plural)
- Complex relation detection (ModelsMapped, Binary)
- Source code morphing (import rewrites, deserialize method generation)

These can be migrated incrementally. The morpher's code transformation capabilities are replaced by the ts-patch transformer's AST rewriting.

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
