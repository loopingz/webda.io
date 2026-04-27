---
sidebar_position: 3
sidebar_label: Custom Decorators
---

# Writing Custom Decorators

This page walks you through building a custom `@Trace` method decorator end-to-end using `@webda/decorators`. You will learn how to use `createMethodDecorator`, store metadata with `context.metadata`, and retrieve it at runtime.

## Prerequisites

```bash
npm install @webda/decorators
```

Your `tsconfig.json` must **not** set `experimentalDecorators: true` — Webda uses the TC39 stage-3 decorator standard (the default in TypeScript 5.0+ without the legacy flag).

## Step 1 — Define the decorator

```typescript
// src/decorators/trace.ts
import { createMethodDecorator, getMetadata } from "@webda/decorators";
import { useLog } from "@webda/workout";

const log = useLog("Trace");

export interface TraceOptions {
  /** Label shown in the log line. Defaults to the method name. */
  label?: string;
  /** Whether to log method arguments. Default: false */
  args?: boolean;
}

/**
 * @Trace — logs entry and exit of the decorated method, with elapsed time.
 *
 * Usage:
 *   @Trace                      — logs method name, no args
 *   @Trace({ label: "fetch", args: true }) — custom label + log args
 */
export const Trace = createMethodDecorator(
  (method, context, options: TraceOptions = {}) => {
    const label = options.label ?? String(context.name);

    // Store metadata so introspection is possible at runtime
    context.metadata["trace"] ??= [];
    (context.metadata["trace"] as string[]).push(label);

    return function (this: any, ...methodArgs: any[]) {
      const start = Date.now();
      if (options.args) {
        log.info(`→ ${label}`, { args: methodArgs });
      } else {
        log.info(`→ ${label}`);
      }

      let result: any;
      try {
        result = method.apply(this, methodArgs);
      } catch (err) {
        log.error(`✗ ${label} threw after ${Date.now() - start}ms`, { error: err });
        throw err;
      }

      // Handle both sync and async methods
      if (result instanceof Promise) {
        return result
          .then(v => {
            log.info(`← ${label} resolved in ${Date.now() - start}ms`);
            return v;
          })
          .catch(err => {
            log.error(`✗ ${label} rejected after ${Date.now() - start}ms`, { error: err });
            throw err;
          });
      }

      log.info(`← ${label} returned in ${Date.now() - start}ms`);
      return result;
    };
  }
);
```

## Step 2 — Apply the decorator

```typescript
// src/services/post.service.ts
import { Trace } from "./decorators/trace";

class PostService {
  @Trace
  async getBySlug(slug: string): Promise<Post | null> {
    return this.store.get(slug);
  }

  @Trace({ label: "publish-post", args: true })
  async publish(slug: string, destination: "linkedin" | "twitter"): Promise<string> {
    // ... publish logic
    return `published:${slug}:${destination}`;
  }
}
```

When `getBySlug("hello-world")` is called the log output looks like:

```
[Trace] INFO  → getBySlug
[Trace] INFO  ← getBySlug resolved in 3ms
```

And when `publish("hello-world", "twitter")` is called:

```
[Trace] INFO  → publish-post { args: ["hello-world", "twitter"] }
[Trace] INFO  ← publish-post resolved in 12ms
```

## Step 3 — Inspect metadata at runtime

```typescript
import { getMetadata } from "@webda/decorators";
import { PostService } from "./services/post.service";

const meta = getMetadata(PostService);
console.log(meta?.["trace"]);
// Output: ["getBySlug", "publish-post"]
```

## Writing a class decorator

```typescript
import { createClassDecorator } from "@webda/decorators";

export interface DeprecatedOptions {
  since: string;
  replacement?: string;
}

/**
 * @Deprecated — prints a warning when the class is first instantiated.
 */
export const Deprecated = createClassDecorator(
  (cls, context, options: DeprecatedOptions) => {
    const original = cls;
    // Return a replacement class that warns on construction
    return class extends (original as any) {
      constructor(...args: any[]) {
        console.warn(
          `[Deprecated since ${options.since}] ${context.name} is deprecated.` +
            (options.replacement ? ` Use ${options.replacement} instead.` : "")
        );
        super(...args);
      }
    };
  }
);

@Deprecated({ since: "3.0", replacement: "PostV2Service" })
class PostService {}

new PostService();
// Logs: [Deprecated since 3.0] PostService is deprecated. Use PostV2Service instead.
```

## Writing a field decorator

```typescript
import { createPropertyDecorator } from "@webda/decorators";

/**
 * @Readonly — prevents field from being assigned after first set.
 */
export const Readonly = createPropertyDecorator(
  (context: ClassFieldDecoratorContext) => {
    const key = context.name;
    context.metadata["readonly"] ??= [];
    (context.metadata["readonly"] as (string | symbol)[]).push(key);
    // Return an initializer: called when the field is initialized
    // (not a mutation guard — use a Proxy or custom setter for that)
  }
);

class Config {
  @Readonly
  apiUrl: string = "https://api.example.com";
}
```

## Dual-mode usage recap

All decorators created with these factories support **both call styles**:

```typescript
// Without parentheses — no arguments
@Trace
method() {}

// With parentheses — with arguments
@Trace({ label: "my-method", args: true })
method() {}
```

The dispatch logic in `createMethodDecorator` detects which style is in use by checking whether the first two arguments match a TC39 decorator signature.

## Verify

```bash
# Run the decorator spec in the repo to confirm the pattern works
npx vitest run packages/decorators/src/decorator.spec.ts
```

```
✓ packages/decorators/src/decorator.spec.ts (N tests)
```

## See also

- [Decorator Catalog](./Catalog.md) — all public exports from `@webda/decorators`
- [@webda/core README](../core/README.md) — `@Bean`, `@Inject`, `@Route`, `@Operation` decorators
- [@webda/models README](../models/README.md) — `@Expose`, relationship decorators
- [useLog from @webda/workout](../workout/README.md) — recommended logging helper
