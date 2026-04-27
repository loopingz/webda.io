---
sidebar_position: 7
sidebar_label: "07 — Service Layer"
---

# 07 — Service Layer

**Goal:** Add a `Publisher` service that wraps cross-cutting business logic, expose its methods over HTTP with `@Operation`, and wire it into the application without manual instantiation.

**Files touched:** `src/services/Publisher.ts`, `webda.config.json` (add `Publisher`).

**Concepts:** `@Bean` decorator, `Service.Parameters`, `@Operation` on instance methods, `useLog` for structured logging, service lifecycle (`resolve` → `init` → `stop`).

## Walkthrough

### 1. Create `src/services/Publisher.ts`

```typescript title="src/services/Publisher.ts"
import { Operation, Service, useLog } from "@webda/core";

export class PublisherParameters extends Service.Parameters {}

/**
 * Publisher service — demonstrates a minimal @Bean service with @Operation.
 *
 * @WebdaModda
 */
export class Publisher<
  T extends PublisherParameters = PublisherParameters
> extends Service<T> {
  static Parameters = PublisherParameters;

  /**
   * Publish a raw message to an external channel.
   *
   * Exposed as: PUT /publisher/publish  { "message": "..." }
   */
  @Operation()
  publish(message: string): string {
    useLog("INFO", "Publishing message:", message);
    return "customid";
  }

  /**
   * Publish a blog post to an external channel.
   *
   * Exposed as: PUT /publisher/publishpost  { "postId": "..." }
   */
  @Operation()
  async publishPost(postId: string): Promise<{ postId: string; status: string }> {
    useLog("INFO", "Publishing post with ID:", postId);
    return { postId, status: "published" };
  }
}
```

#### Key concepts

**`@Bean` is not needed here — `@WebdaModda` is the JSDoc alternative**

The sample app uses `@WebdaModda` in the JSDoc comment instead of the `@Bean` decorator directly on the class. Both work identically — the compiler picks up whichever convention you use. `@Bean` is the decorator form; `@WebdaModda` is the legacy JSDoc form supported for compatibility.

**`Service.Parameters`**

Every service has a typed `Parameters` class. Extending `Service.Parameters` means your config block in `webda.config.json` will be validated against this schema. If you add a `channel: string` field to `PublisherParameters`, it becomes required in the config — the framework enforces it before `init()` is called.

**`@Operation()`**

Decorating an instance method (or static method) with `@Operation()` makes it callable over REST (`PUT /<service-name-lowercase>/<method-name-lowercase>`) and gRPC (`<ServiceName>Service/<MethodName>`). The framework reads parameter types from the compiled TypeScript to generate the request/response schema.

**`useLog`**

Always use `useLog` from `@webda/core` (or `@webda/workout`) instead of `console.log`. It attaches the current request context (trace ID, user ID) and routes output to the configured logging sink.

### 2. Wire the service in `webda.config.json`

Add a `Publisher` entry. The `type` key uses the class name — the framework looks it up in `webda.module.json` under the `MyBlog` namespace:

```json title="webda.config.json (new entry)"
{
  "Publisher": {
    "type": "Publisher"
  }
}
```

:::note Namespace resolution
`"type": "Publisher"` resolves to `"MyBlog/Publisher"` because the namespace is `"MyBlog"` (set in `package.json`). You can also write `"type": "MyBlog/Publisher"` for explicitness.
:::

### 3. Rebuild and restart

```bash
pnpm exec webdac build
# restart webda debug
```

### 4. Call the service operations via REST

```bash
# PUT /publisher/publish
curl -sk -X PUT https://localhost:18080/publisher/publish \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello from REST"}' | jq
```

```json
"customid"
```

```bash
# PUT /publisher/publishpost
curl -sk -X PUT https://localhost:18080/publisher/publishpost \
  -H "Content-Type: application/json" \
  -d '{"postId":"hello-world"}' | jq
```

```json
{"postId":"hello-world","status":"published"}
```

### 5. Adding lifecycle hooks (optional extension)

If the `Publisher` needs to connect to an external message broker, use the lifecycle hooks:

```typescript
resolve(): this {
  super.resolve();
  // Validate config — throw here if required fields are missing.
  // resolve() is synchronous; defer any async work to init().
  return this;
}

async init(): Promise<this> {
  await super.init();
  // Establish connections — async work goes here.
  return this;
}

async stop(): Promise<void> {
  // Graceful shutdown — close connections, flush buffers
  await super.stop();
}
```

The framework calls these in order: `resolve()` (sync) → `init()` (async) → (running) → `stop()` (async). Never bypass the chain — always call `super`.

### 6. The TestBean service (reference implementation)

The reference implementation in `sample-apps/blog-system/src/services/bean.ts` includes a `TestBean` service with additional scenario methods and a `GET /version` operation. It shows:

- `@InstanceCache` for memoizing expensive computations
- `@Operation<RestParameters>({ id: "Version.Get", rest: { method: "get", path: "/version" } })` for custom route paths
- Dependency injection via standard TypeScript field injection
- Working with model repositories directly in a service context

Browse [sample-apps/blog-system/src/services/bean.ts](https://github.com/loopingz/webda.io/blob/main/sample-apps/blog-system/src/services/bean.ts) for the full implementation.

## Verify

:::warning Could not fully verify locally
The server was not started during doc generation. The curl commands above match assertions from `rest.sh`. To verify:

```bash
cd sample-apps/blog-system
pnpm exec webda debug &
curl -sk -X PUT https://localhost:18080/publisher/publish \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello from REST"}' | jq
# Expected: "customid"
```
:::

## What's next

→ [08 — REST API Tour](./08-REST-API.md)
