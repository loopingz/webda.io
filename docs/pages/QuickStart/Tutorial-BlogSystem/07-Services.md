---
sidebar_position: 7
sidebar_label: "07 — Service Layer"
---

# 07 — Service Layer

**Goal:** Add behaviour that does not belong to one model: a configurable `Publisher` service and an auto-instantiated `@Bean`, both exposing methods with `@Operation`.

**Files touched:** `src/services/publisher.service.ts`, `src/services/bean.service.ts`, `webda.config.json`.

**Concepts:** `Service.Parameters`, `@WebdaModda`, `@Bean`, `@Operation` on service methods, custom REST routes, `useLog`, service lifecycle.

## Walkthrough

### 1. Create `src/services/publisher.service.ts`

```typescript title="src/services/publisher.service.ts"
import { Operation, Service, useLog } from "@webda/core";

export class PublisherParameters extends Service.Parameters {}

/**
 * @WebdaModda
 */
export class Publisher<T extends PublisherParameters = PublisherParameters> extends Service<T> {
  static Parameters = PublisherParameters;

  @Operation()
  publish(message: string): string {
    useLog("INFO", "Publishing message:", message);
    return "customid";
  }

  @Operation()
  async publishPost(postId: string): Promise<{ postId: string; status: string }> {
    useLog("INFO", "Publishing post with ID:", postId);
    return { postId, status: "published" };
  }
}
```

- **File name** — services live in `*.service.ts` files; the build fails on a service file without that suffix.
- **`@WebdaModda`** — this JSDoc tag registers the class in `webda.module.json` as `MyBlog/Publisher`, so `webda.config.json` can instantiate it.
- **`Service.Parameters`** — the typed parameters of the service. Each field becomes part of the configuration schema (`.webda/config.schema.json`) and is read as `this.parameters.<field>`. Use JSDoc tags for validation and a default value for optional fields, e.g. `delayHours: number = 24;`.
- **`@Operation()`** — the operation id is the configured service name, capitalized, then the method name: `Publisher.Publish`, `Publisher.PublishPost`. REST exposes it as `PUT /publisher/publish` with the parameters read from the body; GraphQL and gRPC transports read the same operations.
- **`useLog`** — log through Webda's logger, never `console.log`.

### 2. Enable it in `webda.config.json`

```json title="webda.config.json (services excerpt)"
{
  "services": {
    "Publisher": {
      "type": "Publisher"
    }
  }
}
```

`"type": "Publisher"` resolves to `MyBlog/Publisher`: types of your own application can omit the namespace. Services are always created by the framework from this configuration; never `new Publisher(...)` them yourself. Another service reaches it with `useService("Publisher")`.

### 3. A `@Bean` with a custom route

A `@Bean` is a service of the application that is instantiated automatically, without a configuration entry:

```typescript title="src/services/bean.service.ts"
import { Bean, Operation, RestParameters, Service, useApplication, useLog } from "@webda/core";

@Bean
export class TestBean extends Service {
  /**
   * Get the version of the application
   * @returns version of the application
   */
  @Operation<RestParameters>({
    id: "Version.Get",
    rest: { method: "get", path: "/version" },
    description: "Get the version of the application"
  })
  async version(): Promise<string> {
    return useApplication().getPackageDescription().name;
  }

  @Operation()
  async testOperation(counter: number): Promise<string> {
    useLog("INFO", `Test operation called with counter: ${counter}`);
    return counter.toString(16);
  }
}
```

`@Operation` options override the defaults: `id` renames the operation (`Version.Get` instead of `TestBean.Version`), and `rest` sets the HTTP method and path. Without options, `testOperation` is exposed as `PUT /testbean/testoperation`.

The sample's `TestBean` also memoizes `getVersion()` with `@InstanceCache` and has a `demonstrateTypeSafety` operation; see `sample-apps/blog-system/src/services/bean.service.ts`.

### 4. Lifecycle hooks (when you need them)

A service connecting to an external system uses the lifecycle hooks:

```typescript
resolve(): this {
  super.resolve();
  // Synchronous: read and check the configuration, resolve dependencies
  return this;
}

async init(): Promise<this> {
  await super.init();
  // Asynchronous: open connections, start timers
  return this;
}

async stop(): Promise<void> {
  // Release what init created
  await super.stop();
}
```

The framework calls them in order: constructor → `resolve()` → `init()` → running → `stop()`. Always call `super`.

### 5. Rebuild and restart

```bash
npm run debug   # or npm run serve
```

## Verify

```bash
curl -s -X PUT http://localhost:18080/publisher/publish \
  -H "Content-Type: application/json" -d '{"message":"Hello from REST"}'
# → customid

curl -s -X PUT http://localhost:18080/publisher/publishpost \
  -H "Content-Type: application/json" -d '{"postId":"hello-world"}'
# → {"postId":"hello-world","status":"published"}

curl -s http://localhost:18080/version
# → my-blog   (the "name" of package.json)

curl -s -X PUT http://localhost:18080/testbean/testoperation \
  -H "Content-Type: application/json" -d '{"counter":42}'
# → 2a
```

Service operations have no model, so no `canAct` applies: they are open to every caller. Check `useContext().getCurrentUserId()` inside the method when an operation must be restricted.

## What's next

→ [08 — REST API Tour](./08-REST-API.md)
