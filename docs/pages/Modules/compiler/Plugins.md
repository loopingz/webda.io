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

## Compile-time TypeScript plugin — `@webda/ts-plugin`

The `@webda/ts-plugin` package implements a TypeScript language service plugin that runs at compile time to generate accessor getters/setters for model fields. It is registered in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "@webda/ts-plugin" }
    ]
  }
}
```

The plugin uses `createAccessorTransformer` and `createDeclarationAccessorTransformer` from `@webda/ts-plugin/transform`. These are available as a public API:

```typescript
import {
  createAccessorTransformer,
  computeCoercibleFields,
  DEFAULT_COERCIONS
} from "@webda/ts-plugin/transform";
```

See `packages/ts-plugin/src/` for details.

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
- [@webda/ts-plugin](../ts-plugin/README.md) — compile-time TypeScript transformer
