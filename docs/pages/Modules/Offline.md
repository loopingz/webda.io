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

Parameters: `models`, `retention` (default `30d`), `maxScopes` (20), `maxQueryLength` (1024), `pageSize` (500),
`overlap` (`5s`), `watchDebounce` (250 ms) and `watchKeepAlive` (25000 ms): `Sync.Watch` sends a heartbeat
`{ cursor, heartbeat: true }` every `watchKeepAlive` ms so proxies keep the stream open (clients ignore heartbeats).

Map `Webda/SyncChange` to a store like any model. Operations: `Sync.Pull`, `Sync.Snapshot`, `Sync.Push`, `Sync.Watch`
(`POST /sync/pull`, `/sync/snapshot`, `/sync/push`, `/sync/watch`), subject to operation permissions and IAM policies.

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
