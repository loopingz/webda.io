---
sidebar_position: 2
sidebar_label: Decorator Catalog
---

# Built-in Decorator Catalog

This page lists every public export from `@webda/decorators`, covering factory functions, helper utilities, and TypeScript types. For Webda's domain-specific decorators (`@Bean`, `@Inject`, `@Route`, `@Operation`, `@Expose`) see the `@webda/core` and `@webda/models` package documentation.

## Factory Functions

### `createClassDecorator(impl)`

Creates a **dual-mode class decorator**: one that works both with and without parentheses.

```typescript
import { createClassDecorator } from "@webda/decorators";

/**
 * Marks a class as a singleton and records eager-load preference.
 * Can be applied as @Singleton or @Singleton({ eager: true })
 */
const Singleton = createClassDecorator(
  (cls, context, options?: { eager?: boolean }) => {
    context.metadata["singleton"] = { eager: options?.eager ?? false };
  }
);

@Singleton
class CacheService {}

@Singleton({ eager: true })
class DatabaseService {}
```

**Signature:**

```typescript
function createClassDecorator<TArgs extends any[]>(
  impl: <C extends AnyCtor>(
    value: C,
    context: ClassDecoratorContext,
    ...args: TArgs
  ) => C | void
): {
  <C extends AnyCtor>(value: C, context: ClassDecoratorContext): C | void;
  (...args: TArgs): <C extends AnyCtor>(value: C, context: ClassDecoratorContext) => C | void;
}
```

Detection: direct use vs. factory use is determined by checking `context.kind === "class"` on the second argument.

---

### `createMethodDecorator(implementation)`

Creates a **dual-mode method decorator** that can intercept, wrap, or replace the decorated method.

```typescript
import { createMethodDecorator } from "@webda/decorators";

/**
 * Times a method call and logs the elapsed milliseconds.
 * Can be applied as @Timer or @Timer("my-label")
 */
const Timer = createMethodDecorator(
  (method, context, label?: string) => {
    const name = label ?? String(context.name);
    return function (this: any, ...args: any[]) {
      const start = Date.now();
      const result = method.apply(this, args);
      Promise.resolve(result).finally(() => {
        console.log(`[${name}] took ${Date.now() - start}ms`);
      });
      return result;
    };
  }
);

class ReportService {
  @Timer
  async generate(): Promise<void> { /* ... */ }

  @Timer("heavy-query")
  async fetchAll(): Promise<any[]> { /* ... */ }
}
```

**Signature:**

```typescript
function createMethodDecorator<T extends AnyMethod, C extends ClassMethodDecoratorContext, TArgs extends any[]>(
  implementation: (value: T, context: C, ...args: TArgs) => T | void
): {
  (value: T, context: C): T | void;
  (...args: TArgs): (value: T, context: C) => T | void;
}
```

Detection: direct use vs. factory use is determined by checking `typeof all[0] === "function" && typeof all[1] === "object"`.

---

### `createPropertyDecorator(impl)`

Creates a **dual-mode field (property) decorator**. The implementation only receives `(context, ...args)` — the initial field value (`undefined`) is not forwarded.

```typescript
import { createPropertyDecorator } from "@webda/decorators";

/**
 * Records a field as requiring validation, optionally with a custom alias.
 * Can be applied as @Validated or @Validated("email_field")
 */
const Validated = createPropertyDecorator(
  (context: ClassFieldDecoratorContext, alias?: string) => {
    context.metadata["validated"] ??= [];
    (context.metadata["validated"] as string[]).push(alias ?? String(context.name));
  }
);

class UserInput {
  @Validated          username: string;
  @Validated("email") emailAddress: string;
}
```

**Signature:**

```typescript
function createPropertyDecorator<TArgs extends any[], C extends ClassFieldDecoratorContext>(
  impl: (context: C, ...args: TArgs) => ((target: undefined, context: C) => void) | void
): {
  (initialValue: undefined, context: C): void;
  (...args: TArgs): (initialValue: undefined, context: C) => void;
}
```

Detection: direct vs. factory is determined by `context.kind === "field"` on the second argument.

---

## Helper Functions

### `getMetadata(Class)`

Returns the TC39 decorator metadata object (`Class[Symbol.metadata]`) for a class, or `undefined` if no decorator has written metadata to it.

```typescript
import { getMetadata, createPropertyDecorator } from "@webda/decorators";

const Tag = createPropertyDecorator(
  (context: ClassFieldDecoratorContext, label?: string) => {
    context.metadata["tags"] ??= [];
    (context.metadata["tags"] as string[]).push(label ?? String(context.name));
  }
);

class Product {
  @Tag("product_name") name: string;
  @Tag               price: number;
}

const meta = getMetadata(Product);
console.log(meta?.["tags"]); // ["product_name", "price"]
```

---

## TypeScript Types

| Type | Description |
|------|-------------|
| `AnyMethod` | `(...args: any[]) => any` — constraint for method decorator targets |
| `AnyCtor<T>` | `abstract new (...args: any[]) => T` — constraint for class decorator targets |
| `ClassDecorator` | Inferred return type of `createClassDecorator` |
| `MethodDecorator` | Inferred return type of `createMethodDecorator` |
| `FieldDecorator` | Inferred return type of `createPropertyDecorator` |
| `DecoratorPropertyParameters<T>` | Extracts the extra argument types from a property decorator factory (everything after the mandatory `context` param) |

### `DecoratorPropertyParameters<T>` example

```typescript
import { createPropertyDecorator, DecoratorPropertyParameters } from "@webda/decorators";

const MyDeco = createPropertyDecorator(
  (context: ClassFieldDecoratorContext, ttl: number, label?: string) => {}
);

// Extracts [ttl: number, label?: string]
type Params = DecoratorPropertyParameters<typeof MyDeco>;
```

---

## `Symbol.metadata` polyfill

`@webda/decorators` installs a one-time polyfill for `Symbol.metadata` at module load:

```typescript
(Symbol as any).metadata ??= Symbol.for("Symbol.metadata");
```

This ensures decorator metadata works correctly in Node.js 22+ even if the runtime does not yet expose `Symbol.metadata` natively. It uses `Symbol.for(...)` so multiple copies of this module in the same process share the same symbol.

---

## Verify

```bash
# Run the decorators test suite
cd /Users/rcattiau/Git/loopingz/webda.io
npx vitest run packages/decorators/src/decorator.spec.ts
```

Expected: all tests pass (the spec covers direct and factory usage for all three decorator kinds).

## See also

- [Writing Custom Decorators](./Custom.md) — build your own `@Trace` decorator end-to-end
- [@webda/core README](../core/README.md) — `@Bean`, `@Inject`, `@Route`, `@Operation`
- [@webda/models README](../models/README.md) — `@Expose`, `@BelongTo`, `@Contains`, `@ManyToMany`
