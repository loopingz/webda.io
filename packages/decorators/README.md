# @webda/decorators module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

## @webda/decorators

Utility factories for authoring TC39-standard decorators that work both with and without parentheses — the dual-mode pattern used throughout the Webda framework.

### When to use it

Use `@webda/decorators` whenever you want to write your own custom TypeScript decorators without boilerplate dispatch logic. It handles the "called directly vs called as factory" ambiguity for you, for class, method, and field (property) decorators.

> **Note**: Ready-made Webda decorators like `@Bean`, `@Inject`, `@Route`, `@Operation`, and `@Expose` ship with `@webda/core` and `@webda/models`. This package provides the **factories** to build new ones.

### Install

```bash
npm install @webda/decorators
```

### Usage

```typescript
import {
  createClassDecorator,
  createMethodDecorator,
  createPropertyDecorator,
  getMetadata
} from "@webda/decorators";

// Class decorator — with or without options
const Singleton = createClassDecorator(
  (cls, context, options?: { eager: boolean }) => {
    context.metadata["singleton"] = options ?? { eager: false };
  }
);

@Singleton                   // direct — no arguments
class ServiceA {}

@Singleton({ eager: true })  // factory — with arguments
class ServiceB {}

// Method decorator
const Log = createMethodDecorator(
  (method, context, prefix?: string) => {
    return function (this: any, ...args: any[]) {
      console.log(`[${prefix ?? String(context.name)}]`, ...args);
      return method.apply(this, args);
    };
  }
);

class Api {
  @Log           getUser() {}
  @Log("fetch")  getOrder() {}
}

// Field decorator
const Expose = createPropertyDecorator(
  (context: ClassFieldDecoratorContext, alias?: string) => {
    context.metadata["expose"] ??= [];
    (context.metadata["expose"] as string[]).push(alias ?? String(context.name));
  }
);

class User {
  @Expose           name: string;
  @Expose("usr_id") id: string;
}

// Read metadata from a class
const meta = getMetadata(User);
console.log(meta["expose"]); // ["name", "usr_id"]
```

### API reference

| Export | Kind | Description |
|--------|------|-------------|
| `createClassDecorator(impl)` | Factory | Creates a dual-mode class decorator |
| `createMethodDecorator(impl)` | Factory | Creates a dual-mode method decorator |
| `createPropertyDecorator(impl)` | Factory | Creates a dual-mode field decorator |
| `getMetadata(Class)` | Helper | Returns `Class[Symbol.metadata]` |
| `AnyCtor` | Type | `abstract new (...args) => T` |
| `AnyMethod` | Type | `(...args) => any` |
| `ClassDecorator` | Type | Return type of `createClassDecorator` |
| `MethodDecorator` | Type | Return type of `createMethodDecorator` |
| `FieldDecorator` | Type | Return type of `createPropertyDecorator` |
| `DecoratorPropertyParameters<T>` | Type utility | Extracts extra arg types from a property decorator |

### See also

- [Catalog of built-in decorators](../../docs/pages/Modules/decorators/Catalog.md)
- [Writing custom decorators](../../docs/pages/Modules/decorators/Custom.md)
- [@webda/core](../core/README.md) — `@Bean`, `@Inject`, `@Route`, `@Operation`
- [@webda/models](../models/README.md) — `@Expose`, `@BelongTo`, `@Contains`

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
