---
sidebar_position: 4
sidebar_label: Services
---

# Services

Services are the primary building block of Webda application logic. Every service extends the `Service<P>` base class and participates in the [lifecycle](./Lifecycle.md) managed by `Core`.

## Service base class

```typescript
import { Service, ServiceParameters } from "@webda/core";

// 1. Define typed configuration
interface MyServiceParameters extends ServiceParameters {
  apiUrl: string;
  maxRetries?: number;
}

// 2. Extend Service<P>
export class MyService extends Service<MyServiceParameters> {
  async init(): Promise<this> {
    await super.init();
    this.log.info("Initialized", { url: this.parameters.apiUrl });
    return this;
  }
}
```

`ServiceParameters` base fields:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Service type (set by the framework) |
| `openapi` | `object` | OpenAPI metadata override |

## The `@Bean` decorator

`@Bean` registers a class as an auto-discovered singleton service. The framework instantiates it automatically when the application starts.

```typescript
import { Bean } from "@webda/core";

@Bean
export class NotificationService extends Service {
  async sendAlert(message: string): Promise<void> {
    // ...
  }
}
```

A `@Bean` service is always registered in the application's service map. It does not need to be declared in `webda.config.json`.

## The `@Inject` decorator

`@Inject` performs dependency injection — it sets the decorated field to the named service instance after all services are constructed, during the `resolve()` phase.

```typescript
import { Service, Inject, Store } from "@webda/core";
import { Bean } from "@webda/core";

@Bean
export class OrderService extends Service {
  // Inject by service name
  @Inject("orderStore")
  store: Store<Order>;

  // Inject from configuration parameter value
  @Inject("params:notificationServiceName", "NotificationService")
  notifier: NotificationService;

  // Optional injection (does not throw if service is missing)
  @Inject("CacheService", undefined, true)
  cache?: CacheService;
}
```

`@Inject` signature: `@Inject(name, defaultName?, optional?)`

| Argument | Description |
|----------|-------------|
| `name` | Service name OR `"params:key"` to read from `this.parameters[key]` |
| `defaultName` | Fallback service name if `name` resolves to undefined |
| `optional` | If `true`, silently set to `undefined` when not found |

## The `@Route` decorator

`@Route` registers a service method as an HTTP endpoint:

```typescript
import { Service, Route, WebContext } from "@webda/core";
import { Bean } from "@webda/core";

@Bean
export class StatusService extends Service {
  @Route("/status", ["GET"])
  async getStatus(context: WebContext): Promise<void> {
    context.write({ status: "ok", uptime: process.uptime() });
  }

  @Route("/admin/reset", ["POST"])
  async reset(context: WebContext): Promise<void> {
    await this.resetAllData();
    context.write({ done: true });
  }
}
```

`@Route` signature: `@Route(url, methods, openapi?)`

## `ServiceParameters` typing

Define your service's configuration shape by extending `ServiceParameters`:

```typescript
import { ServiceParameters } from "@webda/core";

export class PublisherParameters extends ServiceParameters {
  platforms: ("linkedin" | "twitter")[];
  maxPostLength?: number;

  load(params: any = {}): this {
    super.load(params);
    this.platforms ??= ["twitter"];
    this.maxPostLength ??= 280;
    return this;
  }
}
```

The `load(params)` method is called during service construction. Use `??=` to set defaults.

## Accessing services at runtime

From anywhere in a request handler or service method:

```typescript
import { useService, useDynamicService } from "@webda/core";

// Typed access
const crypto = useService("CryptoService");

// Dynamic name from config
const storeName = this.parameters.storeName;
const store = useDynamicService<Store>(storeName);
```

## Configuration in `webda.config.json`

Services (other than `@Bean`) must be declared in config:

```json
{
  "services": {
    "orderStore": {
      "type": "Webda/MemoryStore",
      "model": "MyApp/Order"
    },
    "notificationService": {
      "type": "MyApp/NotificationService",
      "notificationServiceName": "notificationService"
    }
  }
}
```

## Logging in services

Use `useLog` from `@webda/workout`:

```typescript
import { useLog } from "@webda/workout";

@Bean
export class MyService extends Service {
  protected log = useLog("MyService");

  async doWork(): Promise<void> {
    this.log.info("Starting work", { key: "value" });
    try {
      await this.run();
      this.log.debug("Work complete");
    } catch (err) {
      this.log.error("Work failed", { error: err });
      throw err;
    }
  }
}
```

## Verify

```bash
cd packages/core
pnpm test
```

```
✓ packages/core — service tests pass
```

## See also

- [Lifecycle](./Lifecycle.md) — `resolve`, `init`, `stop` sequence
- [Architecture](./Architecture.md) — how Core manages services
- [Logging](./Logging.md) — `useLog` and structured logging
- [Routing](./Routing.md) — `@Route` in detail
- [@webda/core README](./README.md) — full hooks API reference
