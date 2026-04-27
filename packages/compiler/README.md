# @webda/compiler module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

## @webda/compiler

The build toolchain for Webda applications. It orchestrates TypeScript compilation (via `@webda/tsc-esm`), generates the module manifest (`webda.module.json`), produces JSON Schemas for all models and service parameters, and optionally morphs source files to add boilerplate methods.

### When to use it

- Run `webdac build` once after making changes to build and generate the module manifest.
- Use `webdac build --watch` during development for incremental rebuilds.
- Use `webdac code` to auto-generate missing methods (`loadParameters`, `unserialize`, accessor getters/setters) on existing models and services.

### Install

```bash
npm install --save-dev @webda/compiler
```

The `webdac` binary is included.

### Commands

#### `webdac build`

Compiles the application TypeScript and regenerates `webda.module.json` and all schemas.

```bash
webdac build              # one-shot build
webdac build --watch      # watch mode (incremental)
webdac build --appPath /path/to/app
```

What it does:
1. Runs `tsc` via `@webda/tsc-esm` to compile TypeScript → ES modules in `lib/`
2. Analyzes the compiled program to discover models, services, deployers, and beans
3. Generates per-model JSON Schemas (input, output, stored) using `@webda/schema`
4. Writes `webda.module.json` at the project root
5. Merges dependency modules from `node_modules`
6. Writes `.webda-config-schema.json` and `.webda-deployment-schema.json`

#### `webdac code`

Analyzes your source and generates missing boilerplate methods:

```bash
webdac code                    # analyze all configured modules
webdac code --module accessors # run a specific morpher module
```

Morpher modules available:

| Module | Description |
|--------|-------------|
| `loadParameters` | Generates `loadParameters()` for Services |
| `unserializer` | Generates `unserialize()` for Models |
| `accessors` | Generates getter/setter pairs for morpher-managed fields |
| `updateImports` | Fixes deprecated import paths |
| `capabilities` | Removes deprecated capability filter registrations |

### `webda.module.json` format

```json
{
  "$schema": "https://webda.io/schemas/webda.module.v4.json",
  "beans": {
    "MyApp/MyBean": {
      "Import": "lib/services/mybean:MyBean",
      "Schema": { ... }
    }
  },
  "moddas": {
    "MyApp/MyService": {
      "Import": "lib/services/myservice:MyService",
      "Schema": { ... }
    }
  },
  "models": {
    "MyApp/Post": {
      "Import": "lib/models/post:Post",
      "Schema": { ... }
    }
  },
  "deployers": {},
  "schemas": {}
}
```

### See also

- [Build reference](../../docs/pages/Modules/compiler/Build.md)
- [Code generation](../../docs/pages/Modules/compiler/CodeGen.md)
- [Module manifest](../../docs/pages/Modules/compiler/ModuleManifest.md)
- [Extending the compiler](../../docs/pages/Modules/compiler/Plugins.md)

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
