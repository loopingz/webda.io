# @webda/offline

> Offline replicas of Webda models: clients sync query-scoped sets of objects, edit them offline and push them back.
> Conflicts are detected with a per-object revision (`_rev`) and merged client-side with `@webda/versioning`.

- Server: `SyncService` (`@webda/offline`)
- Client: `OfflineClient` (`@webda/offline/client`, runs in browsers, React Native, Electron and Node)

## Install

```bash
pnpm add @webda/offline
```

## Concepts

- **Scopes**: a client syncs `{ model, query }` sets, e.g. `{ model: "MyApp/Task", query: "owner = 'me'" }`. Every
  object is filtered by the model read permission (`canAct(ctx, "get")`).
- **Revisions**: synced models carry `_rev`, incremented by the `SyncService` on every write.
- **Change log**: the `SyncChange` model records each write; clients pull the changes after their cursor. Entries older
  than `retention` are pruned, a client with an older cursor resyncs its scopes.
- **Conflicts**: a push carries the revision the change was made on. When the server moved on, the client merges with
  `@webda/versioning`'s `merge3`: edits of different fields merge automatically, edits of the same value are conflicts.
  Multi-line strings merge line by line: only overlapping line edits conflict (`kind: "line"`).

## Server

```ts
import type { Syncable } from "@webda/offline";

/** @WebdaModel */
export class Task extends CoreModel implements Syncable {
  title: string;
  owner: string;
  _rev?: number;
}
```

`SyncService.init` fails when a listed model has no `_rev` attribute: implement `Syncable` on every synced model.

```jsonc
"sync": {
  "type": "Webda/SyncService",
  "models": ["MyApp/Task"],
  "retention": "30d"
}
```

| Parameter        | Default | Description                                                                                   |
| ---------------- | ------- | --------------------------------------------------------------------------------------------- |
| `models`         |         | Models to sync, each must implement `Syncable`                                                |
| `retention`      | `30d`   | Age of the pruned change-log entries                                                          |
| `maxScopes`      | `20`    | Scopes accepted per request                                                                   |
| `maxQueryLength` | `1024`  | Length of a scope query                                                                       |
| `pageSize`       | `500`   | Change-log entries or objects per `Sync.Pull` / `Sync.Snapshot` page (caps the `limit` asked) |
| `maxMutations`   | `100`   | Mutations accepted per `Sync.Push`: keep it at least the clients' `pushBatchSize`             |
| `overlap`        | `5s`    | Window re-read by the next pull, covering clock skew between servers                          |
| `watchDebounce`  | `250`   | Debounce of the `Sync.Watch` hints, in ms                                                     |
| `watchKeepAlive` | `25000` | Heartbeat interval of an idle `Sync.Watch`, in ms (`0` disables them)                         |

Durations (`retention`, `overlap`) are `<integer><unit>` with the unit `ms`, `s`, `m`, `h` or `d` (`parseDuration`).
The `Sync.Watch` heartbeats (`{ cursor, heartbeat: true }`, ignored by clients) let the transport notice a closed client
and release its watcher; keeping the stream open through proxies is the REST transport's own keep-alive.

Map `Webda/SyncChange` to a store like any model. Operations: `Sync.Pull`, `Sync.Snapshot`, `Sync.Push`, `Sync.Watch`
(`POST /sync/pull`, `/sync/snapshot`, `/sync/push`, `/sync/watch`), subject to operation permissions and IAM policies.
The routes are relative to the REST transport `url`: with `"url": "/api/"`, they are `/api/sync/...` and the client
`baseUrl` must end with `/api`.

### Scope queries

A scope query is a WebdaQL filter, empty to sync the whole model. Requests are rejected with a `400` when there is no
scope, more than `maxScopes`, a model the service does not sync, a query longer than `maxQueryLength`, a syntax error,
a `DELETE` / `UPDATE` statement or a field list, a private field, or a `LIMIT`, `OFFSET` or `ORDER BY`.

### Production notes

- Index `SyncChange.seq` (every pull is a range query on it) and `SyncChange.mutationId` (every push looks its mutation
  up to answer a replay) in the store backing `Webda/SyncChange`.
- Each write to a synced model costs one `SyncChange` insert. Each update or patch also costs an extra read to compute
  the next `_rev` (patches made by `Sync.Push` excepted), and each partial update without an increment (e.g.
  `setAttribute`) an extra `incrementAttributes` write to bump it.
- `_rev` restarts at 1 when a key is deleted and created again: clients always load the object a pull or snapshot
  returns, whatever its revision.
- Retention is computed from the clock at every pull: a cursor older than `retention` resyncs on every instance, whichever
  of them pruned. A failing prune is logged and retried hourly.

## Client

```ts
import { OfflineClient, IndexedDBStorage, HttpTransport } from "@webda/offline/client";

const client = new OfflineClient({
  storage: new IndexedDBStorage("myapp"),
  transport: new HttpTransport({ baseUrl: "https://api.example.com", headers: async () => ({ Authorization: token }) }),
  scopes: [{ model: "MyApp/Task", query: "owner = 'me'" }],
  onConflict: "manual"
});
await client.start();

const tasks = client.collection<Task>("MyApp/Task");
await tasks.create({ title: "Write docs" });
tasks.on("change", evt => render());
```

| Option          | Default                      | Description                                                         |
| --------------- | ---------------------------- | ------------------------------------------------------------------- |
| `storage`       |                              | Local storage, see [Storage and transport](#storage-and-transport)  |
| `transport`     |                              | Server access, see [Storage and transport](#storage-and-transport)  |
| `scopes`        |                              | Scopes to sync, see [Scopes](#scopes)                               |
| `onConflict`    | `"manual"`                   | See [Conflicts](#conflicts)                                         |
| `syncInterval`  | `30000`                      | Milliseconds between automatic syncs, `0` disables the timer        |
| `primaryKeys`   | `["uuid"]` per model         | Key fields per model                                                |
| `versioning`    | `{}`                         | `@webda/versioning` config (array identity, string strategies)      |
| `retry`         | `{ base: 1000, max: 60000 }` | Exponential backoff (ms) of failed syncs and of watch reconnections |
| `pushBatchSize` | `100`                        | Mutations per push request, at most the server `maxMutations`       |

### Collections

`client.collection<T>(model)` reads and writes the local replica; every write is pushed on the next sync.

- `create(data)` adds an object, generating a `uuid` key unless you provide the key fields. It throws when the key
  already exists; re-creating an object deleted locally is an update.
- `patch(key, data)` merges fields. It throws when the object is missing or has an open conflict.
- `delete(key)`, `get(key)` (`undefined` when missing or deleted) and `query(filter)`, a WebdaQL filter evaluated on the
  local objects (every object when empty).
- `on("change", fn)` listens to this model's changes and returns an unsubscribe function. The event is
  `{ ref, object, origin }`, `object` being `null` on deletion and `origin` `"local"` or `"remote"`.

The client itself emits `change` (every model), `status`, `conflict` (a conflict left open) and `error`.

### Lifecycle

- `client.start()` syncs once, then on the `syncInterval` timer, on the browser `online` event and on every
  `Sync.Watch` hint. A failed sync is retried with an exponential backoff. The watch stream reconnects with the same
  backoff (reset once a connection delivered an event); a `401`, `403` or `404` stops it and is emitted as `error`
  (polling goes on).
- `client.stop()` clears the timers, aborts the watch stream and removes the `online` listener.
- `client.sync()` pushes then pulls; concurrent calls share one run. When the server refuses the push (any non-network
  status, e.g. `403` for a read-only user) the pull still runs, then the push error is thrown.
- `client.status` is `idle`, `syncing`, `offline` or `error`; every change is emitted as `status`, every failure as
  `error`. `offline` is set for errors without a status (network failures, but also a failing local storage), `error`
  for server refusals. An `error` status recovers by itself on the next successful sync: fix the cause (sign in again,
  grant the permission...) and call `client.sync()` or wait for the retry.
- A pull resyncs at most once: a server whose resync cursor is itself too old (a retention shorter than its own
  overlap, a broken proxy...) makes the sync fail with a `ResyncLoopError` (status `500`, reported as `error`) after
  one snapshot pass instead of snapshotting every scope forever.

### Scopes

`client.setScopes(scopes)` replaces the scopes: the cursor is reset, the next sync resyncs every scope, and synced
records of models no scope covers any more are dropped (local changes are kept). Explicit scopes are persisted and win
over the constructor `scopes` across restarts, until the app is started with different constructor scopes: those then
replace them. Any change of the effective scopes, including a new app version shipping new constructor scopes, runs
the same resync.

### Records and keys

Local creates generate a `uuid` key on the client (or use the key fields you provide). The server keeps that key: a
create on a key already used by an object the user cannot read is rejected with `KEY_IN_USE`, so prefer random keys
over guessable ones. On a key used by a readable object, the create is a conflict.

Each local record has a state: `synced`, `created`, `dirty`, `deleted`, `conflict` or `error`. A mutation rejected by
the server (see [Push errors](#push-errors)) leaves the record in `error` with its `{ code, message }`; it is not pushed
again until it is edited (back to `dirty`) or discarded.

`client.discard(ref)` drops the local changes of an object (typically in `error` or `conflict` state) and goes back to
the last server value. A local create is forgotten, unless it was already sent: the server may hold it, so the next
sync deletes it there.

### Conflicts

`onConflict` is `"manual"` (default), `"server-wins"`, `"client-wins"` or an async function receiving the conflict and
returning the resolutions (a `Map`), or `"defer"` to leave it open. Open conflicts are emitted as `conflict`, listed by
`client.conflicts()` and settled with `client.resolve(ref, resolutions)`:

```ts
for (const conflict of await client.conflicts()) {
  // conflict.result.conflicts: [{ path: "/title", kind: "value", base, ours, theirs }]
  await client.resolve(conflict.ref, new Map([["/title", { choose: "ours" }]]));
}
```

A conflict `kind` is `value`, `line` (multi-line string), `array-item` or `delete-modify`. A resolution is
`{ choose: "ours" | "theirs" | "base" }`, `{ value }` or `{ text }` (the edited text of a `line` conflict, e.g. rendered
with `toGitMarkers` from `@webda/versioning`). `resolve()` throws unless every conflict path has a resolution.

A whole-object conflict (`delete-modify`: deleted on one side, edited on the other) has the path `""`:
`{ choose: "ours" }` keeps the local version (re-creating or re-deleting it), `{ choose: "theirs" }` accepts the server
side. Editing an object that no longer exists on the server is such a conflict; deleting it succeeds.

### Push errors

A rejected mutation carries one of these codes: `NOT_SYNCED` (model not handled by the service), `INVALID` (malformed
mutation or unknown op), `INVALID_KEY`, `KEY_IN_USE` (create on an existing key the user cannot read), `NOT_FOUND`
(an object the user cannot read: indistinguishable from a missing one), `FORBIDDEN`, `VALIDATION` (model validation
failed) and `INTERNAL`.

### Storage and transport

- `IndexedDBStorage(name, factory = globalThis.indexedDB)` persists the replica in an IndexedDB database (pass a
  `factory` where `indexedDB` is not global). `MemoryStorage` keeps it in memory only, for tests or ephemeral clients.
- `HttpTransport({ baseUrl, headers, fetch, paths })` calls the REST operations: `headers` is a sync or async function
  returning extra headers, `fetch` a custom `fetch` implementation and `paths` overrides the `pull`, `push`, `snapshot`
  or `watch` routes. `Sync.Watch` is read as a server-sent event stream.
- Other backends implement the exported `StorageAdapter` (records and metadata, `putRecords` must be atomic) and
  `Transport` (`pull`, `push`, `snapshot` and an optional `watch`) interfaces. A transport throws a
  `TransportError(status, message)`, with status `0` for network errors.

## Limitations

- `_rev` is strictly checked only on `Sync.Push` writes. Concurrent non-push server writes may produce a duplicate
  revision number; data is not lost, as pull compares content and push applies deltas onto the current server object.
- Removing an attribute offline is applied by patching it to `undefined`. This is verified on the memory store only:
  other stores may handle `undefined` in a patch differently.
- Offline creates keep their client-generated key.
- `deleteMany` / `updateMany` emit no per-object event: call `syncService.touch(model, keys)` or clients only see those
  changes after a resync.
- `Sync.Watch` hints only cover writes on the same server instance; polling keeps clients correct.
- No relation following, binary attachments or cross-object transactions.
