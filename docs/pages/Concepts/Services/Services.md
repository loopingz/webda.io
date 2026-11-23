---
sidebar_position: 2
---

import ServiceLifecycle from "@site/src/components/ServiceLifecycle";

# Services

Services hold integrations, background tasks, and behavior that spans multiple models. Webda creates and manages each service through a shared lifecycle.

## When to use a service

Use a service for work that does not belong to one model. For a complete implementation, follow [My First Service](../../QuickStart/FirstService.md).

## Bean

A service decorated with `@Bean` is an application singleton. It starts without an explicit service entry when it belongs to the main application.

## Lifecycle

Core creates each service from its configuration, resolves its dependencies, and initializes it before use.
The same instance then handles requests or background work until shutdown.

<ServiceLifecycle />

- **Constructor and `resolve()` are synchronous.** Use `resolve()` to access `@Inject` dependencies and wire references; call `super.resolve()` first. Do not start asynchronous work in either phase.
- **`init()` performs asynchronous startup.** Call `await super.init()` first, then open connections or start background work.
- **`stop()` releases resources.** Finish your own cleanup before `await super.stop()`. Core stops services concurrently, so do not assume another service is still running during cleanup.

See [Service Lifecycle](../../Modules/core/Lifecycle.md) for hook signatures, examples, and initialization ordering.

## Generic Parameters

A service can declare its parameter class and the events it emits:

```typescript title="Service type parameters"
Service<T extends ServiceParameters, E extends Events>
```

- `T` defines and loads configuration parameters.
- `E` defines event names and payload types.

## Dependencies

### @Inject

Use `@Inject` to declare a service dependency. Access injected dependencies during `resolve()` or later.

## Predefined Services

Webda provides these built-in services:

| Name           | Description                                            | Default Type               |
| -------------- | ------------------------------------------------------ | -------------------------- |
| Configuration  | Load the configuration from the configuration file     | N/A                        |
| Registry       | The default storage for objects in Webda               | Webda/MemoryStore          |
| CryptoService  | Encrypts and decrypts data                             | Webda/CryptoService        |
| Router         | Routes application requests                            | Webda/Router               |
| TokenService   | Issues access tokens (JWT) and rotating refresh tokens | Webda/TokenService         |
| SessionManager | Manages user sessions                                  | Webda/CookieSessionManager |

## Next steps

- [Core Services](../../Modules/core/Services.md)
- [Core Service Lifecycle](../../Modules/core/Lifecycle.md)
- [Decorators catalog](../../Modules/decorators/Catalog.md)
