# @webda/debug — API Backend + Debug Command

## Problem

During development, there's no built-in way to introspect a running Webda application — its models, services, operations, routes, configuration, or live request traffic. Developers must manually read config files, grep for decorators, or add temporary logging.

## Solution

A new `@webda/debug` package providing a debug server on a separate port (18181) with REST API endpoints for introspection and a WebSocket for live event streaming. A `webda debug` command starts both the application server and the debug server.

This is sub-project 1 of 3 (API backend). Sub-projects 2 (Web UI) and 3 (TUI) consume this API.

## Package Structure

New package: `packages/debug` (`@webda/debug`)

```
packages/debug/
├── src/
│   ├── debugservice.ts      # Main service: HTTP+WS server, API routing, @Command
│   ├── introspection.ts     # Pure functions to collect models, services, ops, config, routes
│   ├── requestlog.ts        # Ring buffer for live request/response tracking
│   └── index.ts             # Exports
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Dependencies

- `@webda/core` (peer)
- `ws` (WebSocket server, 0 transitive deps)

## Command

```
webda debug [--port 18181] [--serve-port 18080]
```

- Boots Core with same capability requirements as `serve` (router + rest-domain)
- Starts the app server via HttpServer's `serve()` on `--serve-port` (default 18080)
- Starts the debug HTTP+WS server on `--port` (default 18181)
- Global `--watch` flag applies (recompiles and restarts Core, debug server stays alive)

### DebugService

Extends `Service`. Declares:

```typescript
@Command("debug", {
  description: "Start dev server with debug dashboard",
  requires: ["router", "rest-domain"]
})
async debug(
  /** @alias p @description Debug server port */
  port: number = 18181,
  /** @description Application server port */
  servePort: number = 18080
)
```

Lifecycle:
- `resolve()`: subscribes to core events for request log
- `debug()`: calls HttpServer.serve(servePort), starts debug server
- `stop()`: closes debug server and WebSocket connections

### Watch Mode Behavior

When `--watch` is active:
- Debug server stays alive across Core restarts (decoupled lifecycle)
- On Core restart, pushes `{ type: "restart" }` to WebSocket clients
- Introspection functions re-read from current `useApplication()`/`useInstanceStorage()` on each API call, always reflecting latest state
- Request log ring buffer survives restarts, gets fresh event subscriptions from new Core

## REST API

All endpoints served on the debug port (default 18181).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/models` | List all models with metadata, schemas, relations, actions |
| `GET` | `/api/models/:id` | Single model detail (full schema, relations, actions) |
| `GET` | `/api/services` | List all services with state, config, capabilities |
| `GET` | `/api/operations` | List all registered operations with input/output schemas |
| `GET` | `/api/routes` | List all routes with methods, executor, OpenAPI info |
| `GET` | `/api/config` | Resolved application configuration tree |
| `GET` | `/api/openapi` | Full OpenAPI 3.0.3 document (JSON) |
| `GET` | `/api/requests` | Recent request log entries from ring buffer |

Responses are JSON. CORS is open (dev-only tool, no auth).

## WebSocket

Single endpoint: `ws://localhost:18181/ws`

Pushes JSON messages with a `type` discriminator:

```typescript
// On Webda.Request
{ type: "request", id: string, method: string, url: string, timestamp: number }

// On Webda.Result
{ type: "result", id: string, statusCode: number, duration: number }

// On Webda.404
{ type: "404", id: string, method: string, url: string }

// On Webda.OperationSuccess / Webda.OperationFailure
{ type: "operation", id: string, operationId: string, status: "success" | "failure", duration: number }

// On Core restart (watch mode)
{ type: "restart" }
```

## Introspection Functions

Pure functions in `introspection.ts` — no side effects, just read from hooks:

```typescript
/** List all models with metadata */
function getModels(): ModelInfo[]

/** Get a single model by identifier */
function getModel(id: string): ModelInfo | undefined

/** List all services with state and config */
function getServices(): ServiceInfo[]

/** List all registered operations */
function getOperations(): OperationInfo[]

/** List all routes */
function getRoutes(): RouteInfo[]

/** Get resolved configuration */
function getConfig(): Record<string, any>
```

Each function wraps existing hooks:
- `useApplication().getModels()` + `useModelMetadata()` for models
- `useCore().getServices()` for services (reads state, parameters, capabilities)
- `listOperations()` for operations
- `useRouter().getRoutes()` for routes
- `useApplication().getConfiguration()` for config

## Request Log

`RequestLog` class in `requestlog.ts`:

- Fixed-size ring buffer (default 1000 entries)
- Entry type: `{ id, timestamp, method, url, statusCode?, duration?, error? }`
- `subscribe(core)`: subscribes to `Webda.Request`, `Webda.Result`, `Webda.404` events on the core
- `unsubscribe()`: removes event listeners (called on Core restart before re-subscribing)
- `getEntries()`: returns entries for REST API
- `onEvent(callback)`: registers a callback for WebSocket push

On `Webda.Request`: creates entry with id, method, url, timestamp.
On `Webda.Result`: completes entry with statusCode, duration.
On `Webda.404`: marks entry as 404.

## Testing

### Unit Tests

- **introspection.ts**: Mock Application/Core, verify each function returns correct structure
- **requestlog.ts**: Test ring buffer (add, overflow, getEntries), event-to-entry mapping, subscriber notification

### Integration Tests

- **debugservice.ts**: Boot a test Core, start debug server, hit each REST endpoint with `fetch`, verify JSON responses match expected structure
- **WebSocket**: Connect to `/ws`, trigger a request on the app, verify WebSocket receives the event

## Out of Scope

- Web UI frontend (sub-project 2)
- TUI frontend (sub-project 3)
- Static file serving (placeholder for Web UI, not implemented here)
- Authentication on debug endpoints (dev-only tool)
- GraphQL/gRPC introspection (v2)
