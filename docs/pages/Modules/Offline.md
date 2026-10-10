---
sidebar_label: "@webda/offline"
---

# Offline sync

`@webda/offline` lets API clients keep a local replica of part of your data, work on it offline and sync it back.

## Concepts

- **Scopes**: a client syncs `{ model, query }` sets, e.g. `{ model: "MyApp/Task", query: "owner = 'me'" }`. Every
  object is filtered by the model read permission (`canAct(ctx, "get")`).
- **Revisions**: synced models carry `_rev`, incremented by the `SyncService` on every write.
- **Change log**: the `SyncChange` model records each write; clients pull the changes after their cursor. Entries older
  than `retention` are pruned, a client with an older cursor resyncs its scopes.
- **Conflicts**: a push carries the revision the change was made on. When the server moved on, the client merges with
  `@webda/versioning`'s `merge3`: edits of different fields merge automatically, edits of the same field are conflicts.

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

```jsonc
"sync": {
  "type": "Webda/SyncService",
  "models": ["MyApp/Task"],
  "retention": "30d"
}
```

Parameters: `models`, `retention` (default `30d`), `maxScopes` (20), `maxQueryLength` (1024), `pageSize` (500, change-log
entries or objects per `Sync.Pull` / `Sync.Snapshot` page), `maxMutations` (100, mutations accepted per `Sync.Push`;
keep it at least the clients' `pushBatchSize`), `overlap` (`5s`), `watchDebounce` (250 ms) and `watchKeepAlive`
(25000 ms): `Sync.Watch` sends a heartbeat `{ cursor, heartbeat: true }` every `watchKeepAlive` ms so proxies keep the
stream open (clients ignore heartbeats).

Map `Webda/SyncChange` to a store like any model. Operations: `Sync.Pull`, `Sync.Snapshot`, `Sync.Push`, `Sync.Watch`
(`POST /sync/pull`, `/sync/snapshot`, `/sync/push`, `/sync/watch`), subject to operation permissions and IAM policies.

### Production notes

- Index `SyncChange.seq` (every pull is a range query on it) and `SyncChange.mutationId` (every push looks its mutation
  up to answer a replay) in the store backing `Webda/SyncChange`.
- Each write to a synced model costs one `SyncChange` insert; each update or patch also costs an extra read to compute the
  next `_rev` (patches made by `Sync.Push` excepted).
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

Options: `storage`, `transport`, `scopes`, `onConflict`, `syncInterval` (30000 ms, 0 disables the timer),
`primaryKeys` (per model, `["uuid"]` by default), `versioning` (`@webda/versioning` config), `retry`
(`{ base: 1000, max: 60000 }` ms, the backoff of failed syncs and of watch reconnections) and `pushBatchSize` (100
mutations per push request, at most the server `maxMutations`).

### Lifecycle

- `client.start()` syncs once, then on the `syncInterval` timer, on the browser `online` event and on every
  `Sync.Watch` hint. A failed sync is retried with an exponential backoff. The watch stream reconnects with the same
  backoff (reset once a connection delivered an event); a `401`, `403` or `404` stops it and is emitted as `error`
  (polling goes on).
- `client.stop()` clears the timers, aborts the watch stream and removes the `online` listener.
- `client.sync()` pushes then pulls; concurrent calls share one run. When the server refuses the push (any non-network
  status, e.g. `403` for a read-only user) the pull still runs, then the push error is thrown.
- `client.status` is `idle`, `syncing`, `offline` (network failure) or `error` (server refusal); every change is
  emitted as `status`, every failure as `error`. An `error` status recovers by itself on the next successful sync:
  fix the cause (sign in again, grant the permission...) and call `client.sync()` or wait for the retry.
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
over guessable ones.

`client.discard(ref)` drops the local changes of an object (typically in `error` or `conflict` state) and goes back to
the last server value. A local create is forgotten, unless it was already sent: the server may hold it, so the next
sync deletes it there.

### Conflicts

`onConflict` is `"manual"` (default), `"server-wins"`, `"client-wins"` or a function returning resolutions. Manual
conflicts are listed by `client.conflicts()` and settled with `client.resolve(ref, resolutions)`:

```ts
for (const conflict of await client.conflicts()) {
  // conflict.result.conflicts: [{ path: "/title", kind: "value", base, ours, theirs }]
  await client.resolve(conflict.ref, new Map([["/title", { choose: "ours" }]]));
}
```

A whole-object conflict (deleted on one side, edited on the other) has the path `""`: `{ choose: "ours" }` keeps the
local version (re-creating or re-deleting it), `{ choose: "theirs" }` accepts the server side. For text fields,
`toGitMarkers` from `@webda/versioning` renders a conflict for editing.

### Push errors

A rejected mutation carries one of these codes: `NOT_SYNCED` (model not handled by the service), `INVALID` (malformed
mutation or unknown op), `INVALID_KEY`, `KEY_IN_USE` (create on an existing key the user cannot read), `NOT_FOUND`
(missing or unreadable object), `FORBIDDEN`, `VALIDATION` (model validation failed) and `INTERNAL`.

## Limitations

- `_rev` is strictly checked only on `Sync.Push` writes. Concurrent non-push server writes may produce a duplicate
  revision number; data is not lost, as pull compares content and push applies deltas onto the current server object.
- Removing an attribute offline is applied by patching it to `undefined`. This is verified on the memory store only:
  other stores may handle `undefined` in a patch differently.
- Offline creates keep their client-generated key.
- `deleteMany` / `updateMany` emit no per-object event: call `syncService.touch(model, keys)` or clients only see those
  changes after a resync.
- `Sync.Watch` hints only cover writes on the same server instance (heartbeats are sent every `watchKeepAlive` ms);
  polling keeps clients correct.
- No relation following, binary attachments or cross-object transactions.
