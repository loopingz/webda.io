---
sidebar_label: "@webda/compiler"
---
# compiler

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

- [Build reference](_media/Build.md)
- [Code generation](_media/CodeGen.md)
- [Module manifest](_media/ModuleManifest.md)
- [Extending the compiler](_media/Plugins.md)
