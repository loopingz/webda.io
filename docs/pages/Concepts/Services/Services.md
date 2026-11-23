---
sidebar_position: 2
---

import ServiceLifecycle from "@site/src/components/ServiceLifecycle";

# Services

## Bean

When you create a service with the `@Bean` annotation, the service becomes a Bean: a singleton of your application, it won't be reusable

## Lifecycle

Core creates each service from its configuration, resolves its dependencies, and initializes it before use.
The same instance then handles requests or background work until shutdown.

<ServiceLifecycle />

- **Constructor and `resolve()` are synchronous.** Use `resolve()` to access `@Inject` dependencies and wire references; call `super.resolve()` first. Do not start asynchronous work in either phase.
- **`init()` performs asynchronous startup.** Call `await super.init()` first, then open connections or start background work.
- **`stop()` releases resources.** Finish your own cleanup before `await super.stop()`. Core stops services concurrently, so do not assume another service is still running during cleanup.

See [Service Lifecycle](../../Modules/core/Lifecycle.md) for hook signatures, examples, and initialization ordering.

## Generic Parameters

A Service is a generic class that has at least 2 Parameters:

```
Service<T extends ServiceParameters,E extends Events>

T: Define the class that define and load the parameters from the configuration
E: Define the events and their types that the service emits
```

## Dependencies

### @Inject

You can use @Inject to retrieve another Service

## Predefined Services

Webda have some predefined services that are created by default:

| Name           | Description                                                    | Default Type               |
| -------------- | -------------------------------------------------------------- | -------------------------- |
| Configuration  | Load the configuration from the configuration file             | N/A                        |
| Registry       | The default storage for objects in Webda                       | Webda/MemoryStore          |
| CryptoService  | The service that provide the encryption and decryption of data | Webda/CryptoService        |
| Router         | The service that manage the routing of the application         | Webda/Router               |
| TokenService   | Issues access tokens (JWT) and rotating refresh tokens         | Webda/TokenService         |
| SessionManager | The service that manage the session of the user                | Webda/CookieSessionManager |

## See also

- [Core Services](../../Modules/core/Services.md)
- [Core Service Lifecycle](../../Modules/core/Lifecycle.md)
- [Decorators catalog](../../Modules/decorators/Catalog.md)
