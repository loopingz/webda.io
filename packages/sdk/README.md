# @webda/sdk module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

> A typed frontend SDK generated from the models and operations of a Webda application: TypeScript types, a typed
> operation caller, per-model clients with a normalized cache, relation navigation and model methods shared with the
> frontend (`@Shared`).

- Server: `SdkGenerator` service (`@webda/sdk`): `webdac build` hook, `webda sdk generate`, `webda sdk manifest`, and
  the pure `generateSdk(manifest)`
- Client: `@webda/sdk/client` (browsers, React Native, Electron, Node; no Node.js import): `WebdaClient`,
  `HttpTransport`, `EntityCache`, `SdkModel`, `Link` / `Related`...

## Install

```bash
pnpm add @webda/sdk
```

## Configure

```jsonc
"SdkGenerator": {
  "type": "Webda/SdkGenerator",
  "outDir": "../frontend/src/webda", // default ".webda/sdk"
  "include": ["Task.*", "Tasks.Query", "Auth.*"], // operation id globs, default all
  "exclude": ["*.Delete"],
  "models": true, // emit models.ts (default true)
  "package": { "name": "@myapp/sdk" }, // optional package.json for a workspace package
  "sharedImports": ["@webda/utils"], // modules a @Shared method may import from (also read by the compiler)
  "transports": ["rest"], // exposures to describe, default: every configured transport service
  "types": { "style": "interface" } // json-schema-to-typescript options passthrough
}
```

`webdac build` generates the SDK through the build hook, exactly like `GrpcService` generates its `.proto`;
`webda sdk generate [--outDir dir]` runs it on demand and `webda sdk manifest` prints the manifest the generator works
from.

## Generated output

```
<outDir>/
├── index.ts         createClient(options) → typed client with a property per model; re-exports
├── types.ts         interfaces from every schema (json-schema-to-typescript)
├── operations.ts    interface Operations { "Task.Get": { input: UuidRequest; output: Task } … } + OPERATIONS / MODELS
├── models.ts        class Task extends SdkModel<TaskData> { declare owner: Link<User>; isOverdue() {…} } + TaskClient
├── manifest.json    the SdkManifest (debug, input for third-party generators)
└── package.json     only when `package` is set
```

The generated folder compiles with `tsc --lib ES2022,DOM --types ''` and imports only `@webda/sdk/client` (plus the
allowlisted `sharedImports`).

## Use

```ts
import { createClient } from "./webda"; // outDir

const api = createClient({
  baseUrl: "https://api.example.com", // origin of the server, the REST routes carry their own prefix
  credentials: "include", // cookie session (default), or
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  cache: { ttl: 30_000, staleWhileRevalidate: true }
});

const task = await api.Task.get(uuid); // served from the EntityCache when fresh
task.isOverdue(); // @Shared method, runs in the browser
const owner = await task.owner.get(); // ModelParent<User> → Link<User>, cached
const page = await api.Task.query("status = 'open' ORDER BY due LIMIT 20"); // { results, continuationToken }
for await (const t of api.Task.iterate("status = 'open'")) {
} // follows the continuation tokens
await api.Task.patch(uuid, { status: "done" }); // PATCH, merges the entity, invalidates the Task queries
await api.Task.archive(uuid, { reason: "old" }); // @Action archive → typed method on the model client
const me = await api.call("Auth.Me"); // any operation, typed by `Operations`
for await (const event of api.stream("Audit.Tail", { since })) {
} // server streaming (NDJSON, SSE fallback)
const off = api.Task.on("change", () => rerender()); // per-model change events
```

### Nested models

A model with a `ModelParent` is served under its parent (`/companies/{pid.0}/users/{uuid}`). The parent ids are taken
from the object's data (`create`), from the cached object (`get`, `patch`, `delete` after a query or a get) or given
explicitly: `api.User.get(uuid, { parents: [companyId] })`. A `Related` relation whose target is nested under the
object passes the parent ids itself.

### Cache

- Normalized: one entry per `model + uid` (serialized primary key), query results stored as lists of uids, so a `patch`
  updates every list containing the object.
- Invalidation by model: a mutation (`create`, `update`, `patch`, `delete`, action, behavior) invalidates the queries of
  its model and of its ancestors; a service operation invalidates the models it `tags`;
  `api.cache.invalidate("MyApp/Task")` is the manual escape hatch.
- Policies: `{ ttl, staleWhileRevalidate, maxEntries }` on the client, `{ cache: "default" | "no-store" | "force-cache"
| "reload" }` per call. `ttl: 0` (default) always revalidates but still deduplicates concurrent identical requests.
- Storage: `MemoryCacheStorage` (default) or `WebStorageCacheStorage(localStorage)` to survive reloads.
- `api.Task.keys.get(uuid)` → `["MyApp/Task", "get", uuid]`, `api.Task.keys.query(q)` and `api.Task.queryFn.*` are
  the stable integration point for TanStack Query-style libraries; `client.on("change", { model })` is what
  `invalidateQueries` hooks on.

### Transports

`createClient({ transports: [...] })` takes an ordered list of `Transport`s; each call uses the first whose
`supports(op)` is true. `HttpTransport` (REST, default) carries unary calls, server streams (`Accept:
application/x-ndjson`, SSE fallback) and bidirectional operations over a WebSocket. Every failure is an
`SdkError { status, code?, message, body, transport }`; `status` is `0` when the server cannot be reached.

| Entry                       | Transport          | Unary            | Server stream        | Client / bidi       |
| --------------------------- | ------------------ | ---------------- | -------------------- | ------------------- |
| `@webda/sdk/client`         | `HttpTransport`    | REST route       | NDJSON, SSE fallback | bidi over WebSocket |
| `@webda/sdk/client/graphql` | `GraphQLTransport` | query / mutation | subscription         | not exposed         |
| `@webda/sdk/client/grpc`    | `GrpcTransport`    | rpc              | native               | native              |

#### GraphQL

```ts
import { createClient, HttpTransport } from "./webda";
import { GraphQLTransport } from "@webda/sdk/client/graphql";

const api = createClient({
  transports: [
    new GraphQLTransport({ url: "https://api.example.com/graphql" }),
    new HttpTransport({ baseUrl: "https://api.example.com" }) // for the operations GraphQL does not expose
  ]
});
const user = await api.User.get(uuid, { select: ["name", "company.name"] }); // one round-trip
user.company.name; // the projected fields are readable on the Link
```

The manifest records, for each operation the `GraphQLService` exposes, its root field (the `graphqlPlacement()` of the
service operations, `task` / `tasks` / `createTask` / `updateTask` / `deleteTask` for the CRUD), its arguments and the
selection set of its result, read from the generated GraphQL schema. Relations are selected as their target's primary
key and reshaped into the uids the REST API sends, so the results normalize into the cache the same way. `select`
narrows the selection to a projection (dotted paths go through relations); a projected object refreshes an entity
already cached but is never cached as a whole one. Server-streaming operations are subscriptions over `graphql-ws` (an
optional peer dependency, imported on the first subscription). An operation with `graphql: false` has no GraphQL
exposure: list `HttpTransport` after `GraphQLTransport` to fall back to REST. `PATCH` and `PUT` both map to
`update<Type>`, which merges the attributes. GraphQL error codes map to HTTP-like statuses (`NOT_FOUND` → 404,
`PERMISSION_DENIED` → 403, `BAD_USER_INPUT` → 400...).

#### gRPC (Node only)

```ts
import { createClient } from "./webda";
import { GrpcTransport } from "@webda/sdk/client/grpc";

const api = createClient({
  transports: [new GrpcTransport({ address: "api.internal:18080", protoFile: ".webda/app.proto" })]
});
await api.call("Echo.Say", { text: "hi" }); // unary
for await (const tick of api.stream("Clock.Ticks", { n: 3 })) console.log(tick); // server stream
await api.call("Stats.Sum", [{ value: 1 }, { value: 2 }]); // client stream: an (async) iterable of messages
const chat = api.connect("Chat.Connect"); // bidirectional: send(), close(), for await, closed
```

`GrpcService` serves `application/grpc` over h2c, which browsers cannot speak: this entry targets Node, React Native,
Electron and service-to-service calls. The manifest names each rpc as `generateProto()` does (`<Prefix>Service` /
`<Rest>`) for the operations the `GrpcService` serves; the `.proto` it generated is loaded with `@grpc/proto-loader`
(`keepCase`, absent fields stay absent) and calls go through `@grpc/grpc-js`, both optional peer dependencies imported
on the first call. Pass `package` when `GrpcService.packageName` is not `webda`. The call `headers` become metadata;
gRPC statuses map to HTTP-like statuses (`NOT_FOUND` → 404, `UNAVAILABLE` → 0, i.e. offline...). `GrpcService` decodes
requests with proto defaults: a required attribute left out arrives as `""` / `0`.

### Web tracing

Ask the server to trace what this client does (operation `Otel.EnableWebTracing`, needs `@webda/otel`). While enabled,
every call on every transport carries `X-Webda-Trace`, `baggage: session.id=...` and a `traceparent`; headers given in
the call options win. The state is in memory only and ends at `expiresAt` or on `disableWebTracing()`.

```ts
const { sessionId, expiresAt } = await client.enableWebTracing("rec-1");
client.isWebTracing(); // false once expired
client.disableWebTracing();
```

The server only answers cross-origin calls with CORS headers when one of its CORS filters accepts the page origin
(a service with the `cors-filter` capability, or `useRouter().registerCORSFilter()` checking the `Origin` header
against an allow-list).

`expiresAt` is the server clock: the client compares it with its own clock, so a skewed client clock ends the tracing
early or late (the server rejects an expired token anyway).

Without more, each call gets a random trace id. To make a user action and its requests one trace, give the client the
active span of your browser OpenTelemetry setup (`@webda/sdk/client` does not depend on `@opentelemetry/api`):

```ts
import { trace } from "@opentelemetry/api";

await client.enableWebTracing("rec-1", {
  activeSpanContext: () => {
    const ctx = trace.getActiveSpan()?.spanContext();
    return ctx && { traceId: ctx.traceId, spanId: ctx.spanId };
  }
});
```

### Offline

```ts
import { createClient } from "./webda";
import { offline } from "@webda/sdk/client/offline";
import { IndexedDBStorage } from "@webda/offline/client";

const api = createClient({
  baseUrl,
  offline: offline({
    storage: new IndexedDBStorage("myapp"),
    scopes: [{ model: "MyApp/Task", query: "owner = 'me'" }], // default: one unfiltered scope per synced model
    onConflict: "manual"
  })
});

await api.Task.patch(uuid, { status: "done" }); // written locally, pushed by the OfflineClient
api.Task.on("change", rerender); // fires on local writes and on pulled server changes
await api.offline.conflicts(); // OfflineClient surface re-exposed
```

When the application has a `Webda/SyncService` (`manifest.offline`, the generated `SERVER.offline`), `offline()` serves
the models it syncs from a local replica of `@webda/offline/client` (an optional peer dependency, imported when the
client is created); every other model keeps going through the transports.

- `ModelClient` delegates its CRUD and queries to a `ModelBackend`: `OfflineBackend` for the synced models,
  `RemoteBackend` (transports and cache) for the others; the hydration is the same.
- Reads and writes of a synced model are local and succeed while the server is down; an object the replica does not
  hold is read from the server. Queries evaluate their filter locally, then apply `ORDER BY`, `LIMIT` and `OFFSET`.
- `SyncTransportAdapter` implements the offline client's `Transport` with the `Sync.*` operations, through the SDK
  transports: the same headers and authentication, and the protocol works over REST, GraphQL or gRPC.
- The sync loop starts with the client (`start: false` to drive it with `api.offline.sync()`). `api.offline` exposes
  `sync()`, `start()`, `stop()`, `status`, `conflicts()`, `resolve()`, `discard()` and the `change` / `status` /
  `conflict` / `error` events; `createClient()` types it as the extension given.
- An object with an open conflict cannot be written (`SdkError` 409) until it is resolved or discarded. Custom actions
  and behaviors still need the server.

## `@Shared` methods

```ts
import { CoreModel, Shared } from "@webda/core";

export class Task extends CoreModel {
  @Shared()
  isOverdue(now: Date = new Date()): boolean {
    return this.status === "open" && this.due < now;
  }

  @Shared()
  static sortByDue(tasks: Pick<Task, "due">[]): Pick<Task, "due">[] {
    return [...tasks].sort((a, b) => a.due.getTime() - b.due.getTime());
  }
}
```

The compiler copies the method into `ModelMetadata.Shared` and enforces its purity at build time: the body may only
reference its parameters, `this.<attribute>`, `this.<other @Shared method>`, `Task.<static @Shared>`, the standard
globals (`Date`, `Math`, `JSON`, `Intl`, `Array`...) and identifiers imported from the `sharedImports` allowlist
(`@webda/utils` and `@webda/ql` by default). Anything else fails the build:
`Task.isOverdue is @Shared but references 'useContext' from "@webda/core"`. A `@Shared` method of an abstract model is
inherited by the generated subclasses. `Date` attributes are revived from the schema (`format: date-time`) and
relations wrapped as `Link` / `Related`, so a shared method sees the same shapes on both sides.

<!-- README_FOOTER -->
