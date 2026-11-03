# @webda/content-mapper module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

Webda's compile-time code generation, as a [TypeScript 7.1 content mapper](https://webda.io/contribute/TypeScript%207%20Content%20Mappers).

TypeScript 7 removed custom emit transformers, `ts-patch` and language-service plugins. This package replaces them
with the supported mechanism: it rewrites model and service sources (`*.model.ts`, `*.service.ts`) into ordinary
TypeScript before the compiler sees them, with span maps so diagnostics, hover and rename still land on the authored
text.

You rarely use it directly: `webdac build` (from `@webda/compiler`) runs it for you.

## What it generates

| Generator        | Output                                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accessors`      | Typed accessors that coerce on assignment (`user.createdAt = "2020-01-01"` stores a `Date`) and relations                                                                                                                          |
| `behaviors`      | Members of the [Behaviors](https://webda.io/docs/Concepts/Models/Behaviors) attached to a model                                                                                                                                    |
| `loadParameters` | `loadParameters()` for services extending `Service<T>`, from their parameters class                                                                                                                                                |
| `qlValidator`    | Compile-time validation of `WebdaQLString<T>` queries, reported as TypeScript diagnostics; a sealed field in a query, in a `getPermissionQuery` or under an `@Index` / `@Unique` tag is a warning (`WQL9004`), logged by the build |

It also discovers the Webda objects of a project and produces the JSON schemas of models, services and operations
used in `webda.module.json`.

## Editor support

Starting in `typescript@7.1.0-dev.20261102.1`, `tsgo` rejects content mapper extensions that end in `.ts` (`TS18066`).
You can choose between two strategies depending on whether you prefer standard `.ts` file suffixes or an unmodified `tsc` binary:

### Strategy A: Keep `.model.ts` / `.service.ts` with `patchTsc` (Default)

Patch the installed native `tsc` binary so compound `.model.ts` and `.service.ts` extensions remain allowed in `tsc` and `tsc --lsp`:

```sh
node node_modules/@webda/content-mapper/lib/patch-tsc.js
```

Then register `.model.ts` and `.service.ts` in `tsconfig.json`:

```jsonc
{
  "contentMappers": [{ "package": "@webda/content-mapper", "extensions": [".model.ts", ".service.ts"] }]
}
```

### Strategy B: Use `.model.wts` / `.service.wts` with `outputExtensions` (Unmodified `tsc`)

If you prefer not to patch the `tsc` binary, use `.model.wts` and `.service.wts` source suffixes and configure `outputExtensions` in `@webda/content-mapper`'s manifest (or your mapper wrapper) so emitted files and ESM imports remain `./user.model.js` and `./query.service.js`:

```jsonc
// tsconfig.json
{
  "contentMappers": [{ "package": "@webda/content-mapper", "extensions": [".model.wts", ".service.wts"] }]
}
```

```jsonc
// package.json
{
  "typescript": {
    "contentMapper": {
      "exec": ["node", "lib/server.js"],
      "compilerOptions": ["module", "target"],
      "outputExtensions": {
        ".model.wts": ".model.js",
        ".service.wts": ".service.js",
        ".flow.wts": ".flow.js"
      }
    }
  }
}
```

> Note: With `.wts` files, configure your editor and tools (e.g. VS Code `"files.associations": { "*.wts": "typescript" }`, ESLint, Prettier) to treat `*.wts` as TypeScript.

Content mappers run external code, so TypeScript asks you to trust them: `tsc --runExternalCode` on the command line,
`initializationOptions.runExternalCode` for the language server.

A model or service declared in a file without a mapped suffix (`.model.ts` / `.service.ts` or `.model.wts` / `.service.wts`) is never transformed: `webdac
build` fails and names the file to rename (`WEBDA_STRICT_FILE_NAMING=0` downgrades it to a warning while migrating).

## Tests with Vitest

The Vite plugin applies the same generators, so specs exercise the code `webdac build` emits:

```typescript title="vitest.config.ts"
import { webdaContentMapper } from "@webda/content-mapper/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [webdaContentMapper()]
});
```

## Entry points

| Export                                | Use                                                        |
| ------------------------------------- | ---------------------------------------------------------- |
| `@webda/content-mapper`               | Generators, `WarmSession`, `runTwoPass`, schema generation |
| `@webda/content-mapper/server`        | The content mapper process started by TypeScript           |
| `@webda/content-mapper/vite`          | The `webdaContentMapper()` Vite/Vitest plugin              |
| `@webda/content-mapper/coercions`     | The default coercion rules                                 |
| `@webda/content-mapper/schema-worker` | Schema generation in a worker thread                       |

Requires TypeScript `>=7.1`.

## See also

- [Compiler plugins](https://webda.io/docs/Modules/compiler/Plugins)
- [Why we chose content mappers](https://webda.io/contribute/TypeScript%207%20Content%20Mappers)

<!-- README_FOOTER -->

## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://webda.io/img/sponsors/arize.svg" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://webda.io/img/sponsors/loopingz.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://webda.io/img/sponsors/tellae.svg" width="200">](https://tellae.fr)
