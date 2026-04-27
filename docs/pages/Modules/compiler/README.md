---
sidebar_label: "@webda/compiler"
---
# compiler

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

- [Build reference](_media/Build.md)
- [Code generation](_media/CodeGen.md)
- [Module manifest](_media/ModuleManifest.md)
- [Extending the compiler](_media/Plugins.md)
