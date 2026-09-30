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

> Shared TypeScript utility types and decorator helpers used across the Webda packages.

This package used to ship a `tsc-esm` binary that appended `.js` to relative imports after
`tsc` emitted them. That binary is gone: Webda packages now build with plain `tsc` under
`"module": "nodenext"` and write `.js` extensions in their sources. What remains is the library.

## Install

```bash
pnpm add @webda/tsc-esm
```

## Usage

```typescript
import type { Attributes, DeepPartial, FilterAttributes, Merge } from "@webda/tsc-esm";
import { NotEnumerable, isMainModule } from "@webda/tsc-esm";

class Session {
  // Kept out of enumeration, so it is skipped by JSON serialisation and Object.keys
  @NotEnumerable
  dirty: boolean;
}

type SessionAttributes = Attributes<Session>; // every non-method key
```

It provides:

- **Type utilities** — `Attributes`, `Methods`, `FilterAttributes`, `FilterOutAttributes`,
  `PickByType`, `OmitByType`, `OmitByTypeRecursive`, `DeepPartial`, `Merge`, `SetOptional`,
  `ReadonlyKeys`, `IsUnion`, `ArrayElement` and the `Constructor` family.
- **Decorator helpers** — `createClassDecorator`, `createPropertyDecorator` and
  `createMethodDecorator` (re-exported from `@webda/decorators`), and `NotEnumerable`.
- **Runtime helpers** — `isMainModule`, `getFileName`, `assertUnreachable`, `StaticInterface`.

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/tsc-esm/`.
- Source: [`packages/tsc-esm`](https://github.com/loopingz/webda.io/tree/main/packages/tsc-esm)
- Related: [`@webda/content-mapper`](../content-mapper), which generates accessors, behaviours and `webda.module.json` on TypeScript 7.1; [`@webda/compiler`](../compiler) for the full `webdac build` pipeline.

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
