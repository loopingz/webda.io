# @webda/ts-plugin module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/ts-plugin

> TypeScript Language Service Plugin and build-time transformer for Webda — one package that gives your IDE correct getter/setter types for Webda model fields and, optionally, generates `webda.module.json` at compile time via `ts-patch`.

## When to use it

- You want IDE autocomplete and hover to show widened setter types (`string | number | Date`) for Webda model date fields instead of the narrower declared type.
- You want to suppress false `TS2322` errors when assigning string values to a `Date` field that accepts coercion.
- You want to replace the separate `webdac build` step with a single `tspc` compile that transforms and generates `webda.module.json` in one pass.

## Install

```bash
pnpm add -D @webda/ts-plugin
# For build-time transform (optional):
pnpm add -D ts-patch && npx ts-patch install
```

## Configuration

### IDE only (Language Service Plugin — no `ts-patch` required)

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

In VS Code: Command Palette → "TypeScript: Select TypeScript Version" → "Use Workspace Version".

### IDE + Build (with ts-patch)

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@webda/ts-plugin",
        "transform": "@webda/ts-plugin/transform",
        "afterDeclarations": "@webda/ts-plugin/transform",
        "generateModule": true,
        "namespace": "MyApp",
        "modelBases": ["MyCustomBaseModel"],
        "coercions": {
          "Decimal": { "setterType": "string | number | Decimal" }
        }
      }
    ]
  }
}
```

| Plugin option | Type | Default | Description |
|---|---|---|---|
| `generateModule` | boolean | `true` | Generate `webda.module.json` during build |
| `namespace` | string | auto from `package.json` | Package namespace for `webda.module.json` |
| `modelBases` | string[] | `[]` | Additional base class names recognized as Webda models |
| `coercions` | object | `{}` | Map of type name → `{ setterType }` for additional coercion rules beyond `Date` |

## Usage

```typescript
// With @webda/ts-plugin active, this source code:
class User extends CoreModel {
  createdAt: Date;
}

// Gives you in the IDE:
//   get createdAt(): Date              ← correct return type
//   set createdAt(v: string|number|Date)  ← widened setter (no TS2322)

// And the compiled .js becomes:
//   get createdAt() { return this.__createdAt; }
//   set createdAt(value) { this.__createdAt = value instanceof Date ? value : new Date(value); }

// Build:
//   Before: tsc && webdac build
//   After (with ts-patch installed):
//   tspc
//   → generates lib/ and webda.module.json in one step
```

> **CONCERN:** The typedoc build for this package currently fails with `TS5103: Invalid value for '--ignoreDeprecations'`. The auto-generated API docs at `docs/pages/Modules/ts-plugin/` will be incomplete until this is resolved.

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/ts-plugin/` (build currently failing — see concern above).
- Source: [`packages/ts-plugin`](https://github.com/loopingz/webda.io/tree/main/packages/ts-plugin)
- Related: [`@webda/compiler`](../compiler) for the full `webdac build` pipeline; [`@webda/decorators`](../decorators) for the decorator primitives that this plugin operates on.

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
