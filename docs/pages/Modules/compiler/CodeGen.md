---
sidebar_position: 3
sidebar_label: Code Generation
---

# `webdac code` — Code Generation

`webdac code` analyzes your Webda source files and generates (or updates) boilerplate methods that the framework requires. It uses [ts-morph](https://ts-morph.com/) to read, transform, and write TypeScript source files in-place.

## When to run it

Run `webdac code` (or `webdac build --code`) when:

- You have a new model that needs `unserialize()` or accessor getter/setters
- You have a new service that needs a `loadParameters()` method
- You are migrating from an older Webda version (the `updateImports` module fixes deprecated import paths)

## Commands

```bash
webdac code                       # run all configured morpher modules
webdac code --module accessors    # run only the accessors module
webdac code --module loadParameters --module unserializer
```

## Morpher modules

### `loadParameters`

Generates or updates the `loadParameters(params)` method on `Service` subclasses. This method is called during service construction to coerce raw configuration values into typed `ServiceParameters`.

**Before (`webdac code`):**

```typescript
export class MyService extends Service<MyServiceParameters> {
  // no loadParameters method
  async init(): Promise<this> {
    // ...
    return this;
  }
}
```

**After (`webdac code`):**

```typescript
export class MyService extends Service<MyServiceParameters> {
  loadParameters(params: DeepPartial<MyServiceParameters>): MyServiceParameters {
    return new MyServiceParameters().load(params);
  }

  async init(): Promise<this> {
    // ...
    return this;
  }
}
```

### `unserializer`

Generates or updates the `static unserialize(data)` method on `Model` subclasses. This is used when loading model instances from a store.

**Before:**

```typescript
export class Post extends Model {
  title!: string;
  slug!: string;
}
```

**After:**

```typescript
export class Post extends Model {
  title!: string;
  slug!: string;

  static unserialize(data: any): Post {
    const obj = new Post();
    return obj.load(data);
  }
}
```

### `accessors`

Generates getter/setter pairs for properties managed by the `@webda/ts-plugin` accessor transformer. These properties are backed by `WEBDA_STORAGE` and support dirty-tracking.

**Before:**

```typescript
export class Post extends Model {
  title!: string;  // @accessor-managed
}
```

**After:**

```typescript
export class Post extends Model {
  get title(): string {
    return this[WEBDA_STORAGE]["title"];
  }

  set title(value: string) {
    this[WEBDA_STORAGE]["title"] = value;
    this.setDirty("title");
  }
}
```

### `updateImports`

Rewrites import paths to reflect package reorganizations between Webda versions. For example:

| Old import | New import |
|-----------|-----------|
| `@webda/core:FileStore` | `@webda/fs` |
| `@webda/core:WebdaQL` | `@webda/ql` |
| `@webda/core:JSONUtils` | `@webda/utils` |
| `@testdeck/mocha` | `@webda/test` |

### `capabilities`

Removes deprecated `registerFilter()` calls from older Webda capability registration patterns.

## How it works

`webdac code` uses the `WebdaMorpher` class which internally creates a ts-morph `Project`. Each module is a function `(sourceFile: SourceFile) => void` that reads and writes the source file AST.

Changes are applied **in-place** to the source files. The morpher uses `diffLines` to show what changed and only writes files that actually differ.

```typescript
// Simplified morpher architecture
export class WebdaMorpher {
  modules: { [key: string]: (sourceFile: SourceFile) => void } = {
    unserializer: sourceFile => deserializer(sourceFile, typeChecker),
    loadParameters: setLoadParameters,
    accessors: transformAccessors,
    updateImports: sourceFile => updateImports(sourceFile, replacePackages),
    capabilities: removeFilterRegistrations
  };
}
```

## Options

| Flag | Description |
|------|-------------|
| `--module <name>` | Run only these morpher module(s). Repeatable. |
| `--appPath` | Path to the app directory (default: `.`) |

## Integration with build

Use `--code` on the build command to run code generation before compilation:

```bash
webdac build --code
```

This is equivalent to:

```bash
webdac code && webdac build
```

## Verify

```bash
# Run code generation with dry-run view (check what would change)
cd sample-apps/blog-system
node ../../packages/compiler/lib/shell.js code
```

If no methods need generation (because they already exist), the command exits silently with no output.

```bash
# Run the compiler tests (includes morpher tests)
cd packages/compiler
pnpm test
```

## See also

- [Build](./Build.md) — `webdac build` compiles TypeScript and regenerates the module manifest
- [Module Manifest](./ModuleManifest.md) — what `webdac build` produces
- [Plugins](./Plugins.md) — adding custom morpher modules
