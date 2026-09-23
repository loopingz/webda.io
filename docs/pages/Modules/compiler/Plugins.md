---
sidebar_position: 5
sidebar_label: Plugins
---

# Extending the Compiler

This page describes how the `@webda/compiler` is structured internally and what extension points exist for advanced users.

## Current extension model

As of Webda 4.x, there is **no public plugin API** for adding custom morpher modules or custom schema generators through a configuration file. The compiler is designed as an internal build tool with a fixed pipeline.

However, the source is open and the internal structure is designed for extension:

- `WebdaMorpher` in `packages/compiler/src/morpher/morpher.ts` is a class whose `modules` map can be extended by subclassing.
- `ModuleGenerator` in `packages/compiler/src/module.ts` handles model/service discovery and schema generation.

If you need custom code generation, file an issue at [github.com/loopingz/webda.io](https://github.com/loopingz/webda.io) or contribute a new morpher module.

## Internal morpher architecture

The `WebdaMorpher` class manages a registry of transform modules:

```typescript
// packages/compiler/src/morpher/morpher.ts
export class WebdaMorpher {
  project: Project;

  modules: { [key: string]: (sourceFile: SourceFile) => void } = {
    unserializer: sourceFile => deserializer(sourceFile, typeChecker),
    loadParameters: setLoadParameters,
    accessors: transformAccessors,
    updateImports: sourceFile => updateImports(sourceFile, replacePackages),
    capabilities: removeFilterRegistrations
  };
}
```

Each module is a function `(sourceFile: SourceFile) => void` that receives a ts-morph `SourceFile` and can read/write the AST.

### Writing a custom morpher module (advanced)

If you are building a custom tool on top of `@webda/compiler`:

```typescript
import { WebdaMorpher } from "@webda/compiler";

class MyMorpher extends WebdaMorpher {
  constructor() {
    super({ project: { tsConfigFilePath: "./tsconfig.json" } });

    // Add a custom module
    this.modules["myTransform"] = (sourceFile) => {
      for (const cls of sourceFile.getClasses()) {
        if (!cls.getBaseClass()?.getName()?.endsWith("Service")) continue;
        // ... your transformation
      }
    };
  }
}

const morpher = new MyMorpher();
await morpher.run(["myTransform"]);
```

> **Note**: `WebdaMorpher` does not export `run()` as a public method in the current release. Consult the source at `packages/compiler/src/morpher/morpher.ts` for the current API.

## Internal `ModuleGenerator`

`ModuleGenerator` (`packages/compiler/src/module.ts`) is the class that walks the TypeScript program to discover models, services, and deployers. It is instantiated by `webdac build` and is not intended to be used directly.

Key methods:
- `generateModelSchemas(node)` — produces input/output/stored JSON Schemas for a model
- `generateModule()` — main entry point; writes `webda.module.json`

## Code generation — `@webda/content-mapper`

Webda models are written with plain properties, and the build generates what makes them work
at runtime: `WEBDA_STORAGE`-backed accessors that coerce assigned values (`Date`, relation
links), relation initialisers, `toJSON`, behaviour hydration, and WebdaQL query rewrites.

This happens inside `webdac build` and needs no configuration. The build runs on TypeScript
7.1 in two passes: the first analyses your sources and plans the generated code; the second
type-checks the rewritten sources and emits exactly what was checked. If the second pass
reports any error, nothing is written.

### The file-naming rule

Generation applies to files named `*.model.ts` and `*.service.ts`. A model or service
declared in any other file is never transformed, so `webdac build` fails and names it:

```
1 Webda class(es) are in files the content mapper cannot claim:
 - src/user.ts declares model 'User' but is not a mapped file; rename it to 'user.model.ts'
```

Set `WEBDA_STRICT_FILE_NAMING=0` to downgrade this to a warning while migrating.

### Editor support

To see the generated accessors in your editor — hover, go-to-definition, and no false errors
when assigning a string to a `Date` field — register the content mapper in `tsconfig.json`:

```jsonc
{
  "contentMappers": [
    { "package": "@webda/content-mapper", "extensions": [".model.ts", ".service.ts"] }
  ]
}
```

Content mappers run external code, so TypeScript asks you to trust them: `tsc --runExternalCode`
on the command line, and `initializationOptions.runExternalCode` for the language server.

See `docs/contribute/TypeScript 7 Content Mappers.md` for how this works and why.

## Build hooks

`webdac build` supports pre/post-build hooks configured in `package.json`:

```json
{
  "webda": {
    "hooks": {
      "prebuild": "pnpm run generate-types",
      "postbuild": "pnpm run validate"
    }
  }
}
```

Hooks run as shell commands in the project directory.

## Verify

```bash
# Confirm the compiler's morpher module list
node -e "
import('@webda/compiler').then(m => {
  const morpher = new m.WebdaMorpher({ pretend: true });
  console.log('modules:', Object.keys(morpher.modules));
}).catch(e => console.error(e.message));
"
```

```
modules: [ 'unserializer', 'loadParameters', 'accessors', 'updateImports', 'capabilities' ]
```

> **TODO**: A formal plugin registry for custom morpher modules is planned. Track progress at [github.com/loopingz/webda.io/issues](https://github.com/loopingz/webda.io/issues).

## See also

- [Build](./Build.md) — `webdac build` orchestrates the compilation pipeline
- [Code Generation](./CodeGen.md) — built-in morpher modules
- [Module Manifest](./ModuleManifest.md) — the output of the build pipeline
- [@webda/tsc-esm](../tsc-esm/README.md) — ESM extension-rewriter that runs after compilation
