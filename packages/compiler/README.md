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

The build toolchain for Webda applications. It compiles on TypeScript 7.1 through `@webda/content-mapper`, generates the module manifest (`webda.module.json`) and JSON Schemas for all models and service parameters, and can migrate sources written for older Webda versions.

### When to use it

- Run `webdac build` once after making changes to build and generate the module manifest.
- Use `webdac build --watch` during development to rebuild on every change.
- Use `webdac code` once when migrating an application from an older Webda version (moved imports, obsolete filter registrations).

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
webdac build --watch      # watch mode: rebuild on every change under src/
webdac build --appPath /path/to/app
```

What it does:
1. Compiles with TypeScript 7.1 through `@webda/content-mapper`, which generates accessors,
   `toJSON` and behaviours, type-checks the result and emits ES modules to `lib/`
2. Discovers models, services, deployers, and beans with the same type checker
3. Generates per-model JSON Schemas (input, output, stored)
4. Writes `webda.module.json` at the project root
5. Merges dependency modules from `node_modules`
6. Writes `.webda-config-schema.json` and `.webda-deployment-schema.json`

#### `webdac code`

Migrates application sources written for an older Webda version, in place:

```bash
webdac code                        # run every migration module
webdac code --module updateImports # run a specific module
```

Migration modules available:

| Module | Description |
|--------|-------------|
| `updateImports` | Moves imports to the packages that now own them |
| `capabilities` | Removes filter registrations the framework now does automatically |

It no longer generates code: `webdac build` does, without touching your sources.

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
