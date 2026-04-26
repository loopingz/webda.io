---
sidebar_label: "@webda/decorators"
---
# decorators

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

- [Catalog of built-in decorators](_media/Catalog.md)
- [Writing custom decorators](_media/Custom.md)
- [@webda/core](_media/README.md) — `@Bean`, `@Inject`, `@Route`, `@Operation`
- [@webda/models](_media/README-1.md) — `@Expose`, `@BelongTo`, `@Contains`
