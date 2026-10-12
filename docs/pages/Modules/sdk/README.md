---
sidebar_label: "@webda/sdk"
---

# sdk

# @webda/sdk

> Generates a typed frontend SDK from the models and operations of a Webda application: TypeScript types, a typed
> operation caller, per-model clients with a normalized cache, relation navigation and model methods shared with the
> frontend (`@Shared`).

## When to use it

- You write a web, React Native or Electron frontend against a Webda API and want the models, operations and routes
  typed from the application itself, regenerated on every `webdac build`.
- You want the model logic that belongs on both sides (formatting, validation, sorting) written once on the model and
  executed in the browser too.
- You want a normalized client cache keyed by Webda's own model ids and primary keys, with invalidation driven by the
  operations.

## Install

```bash
pnpm add @webda/sdk
```

## Configuration

```json
{
  "services": {
    "SdkGenerator": {
      "type": "Webda/SdkGenerator",
      "outDir": "../frontend/src/webda"
    }
  }
}
```

| Parameter       | Type     | Default                          | Description                                                                      |
| --------------- | -------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `outDir`        | string   | `.webda/sdk`                     | Folder the SDK is written to, relative to the application                        |
| `include`       | string[] | every operation                  | Operation id globs to include (`Task.*`, `Tasks.Query`, `Auth.*`)                |
| `exclude`       | string[] |                                  | Operation id globs to exclude (`*.Delete`)                                       |
| `models`        | boolean  | `true`                           | Emit `models.ts` and the model clients                                           |
| `package`       | object   |                                  | `{ name, version }`: write a `package.json` so the folder is a workspace package |
| `sharedImports` | string[] | `["@webda/utils", "@webda/ql"]`  | Modules a `@Shared` method may import from (also read by the compiler)           |
| `transports`    | string[] | every configured transport       | Exposures to describe in the manifest (`rest`, `graphql`, `grpc`)                |
| `offline`       | boolean  | `true` when a `SyncService` runs | Describe the `SyncService` in the manifest                                       |
| `types`         | object   |                                  | `json-schema-to-typescript` options passthrough                                  |

## Commands

- `webdac build` runs the generator through the build hook (`@BuildCommand`), like `GrpcService` generates its
  `.proto`.
- `webda sdk generate [--outDir dir]` generates on demand.
- `webda sdk manifest` prints the `SdkManifest`: every operation with every way the server exposes it (REST route read
  from the router, so nested models, custom primary keys, `queryMethod` and `nameTransformer` are honoured), the
  models with their relations, ancestors and `@Shared` methods, the schemas, and what the application serves.

Programmatically: `generateSdk(manifest, options)` returns `{ "index.ts": ..., "types.ts": ..., ... }`.

## Generated output

```
<outDir>/
├── index.ts         createClient(options) → typed client with a property per model; re-exports
├── types.ts         interfaces from every schema
├── operations.ts    interface Operations { "Task.Get": { input: UuidRequest; output: Task } … } + OPERATIONS / MODELS
├── models.ts        class Task extends SdkModel<TaskData> { declare owner: Link<User>; isOverdue() {…} } + TaskClient
├── manifest.json    the SdkManifest
└── package.json     only when `package` is set
```

Naming: `MyApp/Task` → `Task`, `MyApp/Task.queryResult` → `TaskQueryResult`, `MyApp/Task.archive.input` →
`TaskArchiveInput`; a short name used by several namespaces keeps its namespace (`MyAppTask`). An action named like a
`ModelClient` method (`action`, `get`, `query`...) is exposed as `<name>Action`.

## Usage

```ts
import { createClient } from "./webda";

const api = createClient({
  baseUrl: "https://api.example.com",
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  cache: { ttl: 30_000, staleWhileRevalidate: true }
});

const task = await api.Task.get(uuid); // cached when fresh
task.isOverdue(); // @Shared, runs in the browser
const owner = await task.owner.get(); // Link<User>
const page = await api.Task.query("status = 'open' ORDER BY due LIMIT 20");
await api.Task.patch(uuid, { status: "done" }); // merges the entity, invalidates the Task queries, emits change
await api.Task.archive(uuid, { reason: "old" }); // typed custom action
const me = await api.call("Auth.Me"); // typed by Operations; api.call("Unknown") is a type error
for await (const event of api.stream("Audit.Tail", { since })) {
} // NDJSON, SSE fallback
api.Task.on("change", rerender);
```

### Models

| Relation                            | Generated attribute                                   | Backed by                                             |
| ----------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `ModelParent`, `ModelLink`          | `Link<Target>` (`get()`, `toJSON()`)                  | `api.Target.get(uid)`, cached                         |
| `ModelLinksSimpleArray`             | `Links<Target>`                                       | idem                                                  |
| `ModelLinksArray` / `ModelLinksMap` | `LinksArray` / `LinksMap` keeping the embedded fields | idem                                                  |
| `ModelRelated`                      | `Related<Target>` (`query()`, `iterate()`)            | `api.Target.query("<attribute> = '<uid>' AND (...)")` |
| `Date` attributes                   | `Date`                                                | revived from `format: date-time`                      |

`SdkModel` offers `getUUID()`, `getPrimaryKey()`, `toJSON()`, `save()` (PUT), `patch()`, `refresh()` and `delete()`.
A nested model (`/companies/{pid.0}/users/{uuid}`) takes its parent ids from the data, from the cached object or from
`{ parents: [...] }`.

### Cache

Entities are stored once per `model + uid`, query results as lists of uids. A mutation invalidates the queries of its
model and ancestors; `api.cache.invalidate("MyApp/Task")` does it by hand. Per-call modes follow the `fetch`
vocabulary: `default`, `no-store`, `force-cache`, `reload`. `ttl: 0` revalidates every time but deduplicates concurrent
identical requests. `MemoryCacheStorage` is the default, `WebStorageCacheStorage(localStorage)` persists across
reloads. `api.Task.keys.*` and `api.Task.queryFn.*` are the stable keys and functions for TanStack Query-style
libraries.

### Transports and errors

The client takes an ordered list of transports and uses the first whose `supports(op)` is true. `HttpTransport` (REST)
is the default; a `client`-streaming operation cannot be carried by HTTP and raises a clear `SdkError`. Every failure is
an `SdkError { status, code?, message, body, transport }`, `status: 0` when the server is unreachable. GraphQL, gRPC and
offline-first backends plug into the `Transport` and `ModelBackend` interfaces.

## `@Shared` methods

A method marked `@Shared()` on a model is copied into the generated class, so it executes identically in Node and in the
browser. The compiler enforces its purity at build time: the body may only use its parameters, `this.<attribute>`,
`this.<other @Shared method>`, `Model.<static @Shared>`, the standard globals and identifiers imported from the
`sharedImports` allowlist; `useContext`, `this.save()`, a service import or a local helper fail `webdac build` with
`Task.isOverdue is @Shared but references 'useContext' from "@webda/core"`. A `@Shared` method of an abstract model is
inherited by the generated subclasses.

## See also

- [Operations](../../Concepts/Operations.md)
- [Models](../../Concepts/Models/Models.md)
- [grpc](../grpc/README.md) and [graphql](../graphql/README.md): the other exposures of the same operations
