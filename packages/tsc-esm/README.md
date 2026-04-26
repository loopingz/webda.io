# @webda/tsc-esm module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/tsc-esm

> ESM-aware TypeScript compiler wrapper — compiles your TypeScript to ESM and automatically rewrites bare specifiers (`./myclass`) to their `.js` equivalents so the output works in Node.js without manual import path edits.

## When to use it

- You write TypeScript imports without `.js` extensions (`import { X } from './myclass'`) but need valid ESM output where Node.js requires `'./myclass.js'`.
- You want a drop-in `tsc` replacement that handles the long-standing [TypeScript ESM import extension issue](https://github.com/microsoft/TypeScript/issues/16577) automatically.
- Your package has `"type": "module"` in `package.json` and you are tired of adding `.js` to every local import.

## Install

```bash
pnpm add -D @webda/tsc-esm
```

## Configuration

No extra config needed beyond your existing `tsconfig.json`. The wrapper reads the same config file that `tsc` would use.

## Usage

```json
// package.json — replace "tsc" with "tsc-esm" in your build script
{
  "scripts": {
    "build": "tsc-esm"
  }
}
```

```bash
# Run directly
pnpm exec tsc-esm

# Pass tsconfig options through (same flags as tsc)
pnpm exec tsc-esm --project tsconfig.build.json
```

After compilation, all relative import/export specifiers in the emitted `.js` files will have `.js` extensions appended automatically — no source changes required.

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/tsc-esm/`.
- Source: [`packages/tsc-esm`](https://github.com/loopingz/webda.io/tree/main/packages/tsc-esm)
- Related: [`@webda/ts-plugin`](../ts-plugin) for the ts-patch-based alternative that also generates `webda.module.json`; [`@webda/compiler`](../compiler) for the full `webdac build` pipeline.

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
