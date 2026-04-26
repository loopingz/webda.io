---
sidebar_label: "@webda/core"
---
# core

The runtime engine of the [webda.io](https://webda.io) framework. It manages the full lifecycle of a Webda application: loading configuration, instantiating services, routing HTTP requests, managing sessions, and providing cross-cutting concerns like logging, metrics, and caching.

## Architecture

![Architecture](https://excalidraw.com/#json=ZknRJYOBPPNyJpoI-Ua_a,iPuhkC-OplOnesHiMJaY9A)

The framework is organized into six layers:

### Application Layer

Responsible for discovering modules, loading configuration, and bootstrapping the runtime.

- **Application** -- Scans the project, parses `webda.config.json`, discovers installed Moddas (service types) and Models, and caches everything for fast startup.
- **UnpackedApplication** -- Development-oriented variant that auto-discovers `webda.module.json` files and creates default services (Router, Registry, CryptoService, SessionManager) when missing.
- **Configuration** -- Defines the `UnpackedConfiguration` schema (version 4) with service definitions, global parameters, and application settings.
- **Runner** -- Orchestrates startup: creates Core from Application, initializes all services, and registers SIGINT for graceful shutdown.
- **Application Hooks** -- `useApplication()`, `useModel()`, `useModelId()`, `useParameters()` for accessing application state from anywhere in the call stack.

### Core Runtime

The central orchestrator that manages the service lifecycle and dependency graph.

- **Core** -- Creates and initializes services with dependency tracking, maps Models to Stores and BinaryServices, manages the operation registry. Lifecycle: `initial` -> `loading` -> `initializing` -> `ready` -> `stopping` -> `stopped`.
- **InstanceStorage** -- `AsyncLocalStorage`-based context that holds the current Core, Application, Router, and request context. Enables the hooks pattern without passing references through every function call.
- **Core Hooks** -- `useCore()`, `useService()`, `useDynamicService()`, `useModelStore()`, `useModelRepository()`, `getMachineId()`.
- **Events** -- Async event system with lifecycle events: `Webda.Init`, `Webda.Request`, `Webda.Result`, `Webda.404`, `Webda.OperationSuccess`, `Webda.Configuration.Applied`, etc.
- **Errors** -- Typed HTTP errors: `Unauthorized` (401), `Forbidden` (403), `NotFound` (404), `BadRequest` (400), `Conflict` (409), `TooManyRequests` (429), `Redirect` (302), and more.

### Services Layer

All application logic lives in services. Every service extends `Service` which provides logging, metrics, dependency injection, and event emission.

- **Service** -- Base class for all application services. Provides `@Inject` decorator for DI, `@Route` for HTTP endpoints, logger per instance, metrics support, and lifecycle hooks (`init()`, `resolve()`, `stop()`).
- **ServiceParameters** -- Base configuration class with change watching support. Services declare their config shape by extending this class.
- **CryptoService** -- Encryption, JWT signing/verification, key management with rotation support. Pluggable encrypters.
- **BinaryService** -- Abstract file/binary storage with metadata, integrity challenges, and model-attribute mapping.
- **ConfigurationService** -- Dynamic configuration with hot-reload from external sources (files, Kubernetes ConfigMaps, other services).

### Data Layer

Persistent storage abstraction with query support.

- **Store** -- Abstract storage with CRUD, query (via WebdaQL), conditional updates, and event emission (`Created`, `Updated`, `Deleted`). Automatically maps to Models via scoring.
- **MemoryStore** -- In-memory implementation with optional file persistence. Used as the default Registry.
- **Registry** -- Key-value store for framework internals (crypto keys, service state). Backed by any Store implementation.

### HTTP / Request Layer

Handles incoming HTTP requests and manages user sessions.

- **Router** -- Routes HTTP requests to service methods, manages OpenAPI spec generation, request/CORS filters, and model REST endpoints.
- **OperationContext** -- Typed request/response context with generic `<Input, Parameters, Output>`. Provides session access, parameter parsing, header management, and streaming.
- **SessionManager** -- Abstract session load/save. Default implementation uses JWT tokens in secure cookies with optional backend storage.

### Cross-Cutting Concerns

Shared infrastructure available to all services.

- **Logger** -- Structured logging with per-service context. Backed by `@webda/workout`.
- **Metrics** -- Prometheus integration via `prom-client`. `useMetric()` creates Counters, Gauges, and Histograms with automatic service labels.
- **Cache** -- Decorator-based caching at four scopes: `@ProcessCache()` (global), `@InstanceCache()` (per Core), `@SessionCache()` (per user), `@ContextCache()` (per request).
- **Queue** -- Message queue consumer pattern with configurable parallelism, retry backoff, and metrics. Extend for SQS, AMQP, etc.
- **Models** -- Model registry with built-in types: `CoreModel`, `User`, `Ident`, `ACLModel`, `OwnerModel`, `RegistryEntry`.
- **Execution Context** -- `AsyncLocalStorage`-based context for `useContext()`, `useCurrentUser()`, `runAsSystem()`, `runWithContext()`.

## Request Flow

```
HTTP Request
    |
    v
HttpContext (parse headers, cookies, body)
    |
    v
OperationContext / WebContext (typed I/O)
    |
    v
SessionManager.load() (JWT from cookie)
    |
    v
Router.execute() (match route, run filters)
    |
    v
Service method (business logic)
    |
    v
SessionManager.save() (persist if dirty)
    |
    v
HTTP Response
```

## Hooks API

The hooks pattern provides access to framework singletons from any point in the call stack, powered by `AsyncLocalStorage`:

| Hook | Returns | Use case |
|------|---------|----------|
| `useCore()` | `Core` | Access the runtime engine |
| `useApplication()` | `Application` | Access project metadata and configuration |
| `useService(name)` | Typed service | Get a named service (`"Registry"`, `"CryptoService"`, etc.) |
| `useDynamicService(name)` | `Service` | Get a service by arbitrary name |
| `useModel(name)` | `ModelDefinition` | Get a model class with metadata |
| `useModelId(object)` | `string` | Get the model identifier for an instance |
| `useModelStore(name)` | `IStore` | Get the store assigned to a model |
| `useModelRepository(name)` | `Repository` | Get the repository for a model |
| `useContext()` | `Context` | Get the current request context |
| `useCurrentUser()` | `User` | Get the authenticated user |
| `useCurrentUserId()` | `string` | Get the user ID or `"system"` |
| `useLogger(class)` | `Logger` | Get a logger with class context |
| `useMetric(type, config)` | Counter/Gauge/Histogram | Create a prometheus metric |
| `useParameters()` | `Configuration["parameters"]` | Get global configuration parameters |
| `getMachineId()` | `string` | Get a stable machine identifier |

## Dependency Injection

Services declare dependencies with the `@Inject` decorator:

```typescript
import { Service, Inject } from "@webda/core";

class MyService extends Service {
  // Inject by service name
  @Inject("CryptoService")
  crypto: CryptoService;

  // Inject from a parameter value
  @Inject("params:storeName", "Registry")
  store: Store;

  // Optional injection
  @Inject("NotificationService", undefined, true)
  notifications?: NotificationService;
}
```

## Configuration

Applications are configured via `webda.config.json` (version 4):

```json
{
  "version": 4,
  "parameters": {
    "routePrefix": "/api",
    "metrics": { "prefix": "myapp_" }
  },
  "services": {
    "MyStore": {
      "type": "MemoryStore",
      "model": "MyApp/MyModel"
    },
    "MyService": {
      "type": "MyApp/MyService",
      "storeName": "MyStore"
    }
  }
}
```

## Events

Services emit typed async events. Subscribe with `on()`:

```typescript
// Core lifecycle events
useCoreEvents("Webda.Init", () => { /* framework ready */ });
useCoreEvents("Webda.Request", ({ context }) => { /* new request */ });

// Store events
myStore.on("Store.Created", ({ object }) => { /* model created */ });
myStore.on("Store.Updated", ({ object }) => { /* model updated */ });
myStore.on("Store.Deleted", ({ object }) => { /* model deleted */ });
```

## Error Handling

Throw typed HTTP errors from services:

```typescript
import * as WebdaError from "@webda/core";

throw new WebdaError.NotFound("User not found");
throw new WebdaError.Forbidden("Insufficient permissions");
throw new WebdaError.BadRequest("Invalid input", "VALIDATION_ERROR");
throw new WebdaError.Redirect("https://example.com/new-location");
```

## Ecosystem

`@webda/core` is the foundation. The full framework includes:

| Package | Purpose |
|---------|---------|
| `@webda/models` | Model base classes, relations, repositories |
| `@webda/compiler` | TypeScript compiler with schema generation |
| `@webda/tsc-esm` | ESM-aware TypeScript compiler, decorators |
| `@webda/utils` | Utilities (debounce, dirty tracking, state machines) |
| `@webda/workout` | Logging infrastructure |
| `@webda/test` | Multi-framework test decorators (vitest, jest, mocha, bun) |
| `@webda/ql` | WebdaQL query language |
| `@webda/cloudevents` | CloudEvents filtering |
| `@webda/cache` | Caching decorators |
| `@webda/serialize` | Serialization framework |
| `@webda/schema` | JSON Schema generator |
