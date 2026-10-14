---
sidebar_label: "@webda/sqlite"
---

# sqlite

`Webda/SQLiteStore`, `Webda/SQLiteQueue` and `Webda/SQLitePubSub` on Node's built-in `node:sqlite`
(Node >= 22.13, no third-party dependency), built on [`@webda/sql`](../sql/README.md).

Without a `persistence` block the database lives **in memory** and is lost on `stop()`, like `MemoryStore`.
With `persistence.path` it is a **single durable file**: one switch turns the same services into a throw-away
backend for tests and development, or a durable backend for CLI tools, single-node and edge deployments.

## When to use it

| Need | Pick |
| --- | --- |
| Throw-away data in tests, zero setup, fastest | `MemoryStore` / `MemoryQueue` (`@webda/core`) |
| A durable single file, WebdaQL pushed to SQL, queue and pub/sub on the same file | `@webda/sqlite` |
| One JSON file per object you can read by hand | `@webda/fs` |
| Several hosts, heavy concurrent traffic | `@webda/postgres` |

## Modes

- **Memory** (no `persistence`): one database per service, or one shared by the services giving the same
  `database.name` (for example a store, a queue and a pub/sub in one test).
- **File** (`persistence.path`, relative to the application directory, parent directories created):
  WAL journal by default (`wal: false` to disable), `synchronous` `NORMAL` with WAL and `FULL` otherwise,
  `readOnly` to refuse writes. The services of one process using the same path share one connection; other
  processes open their own.
- **Shared connection parameters** (all three services): `database`, `busyTimeout` (ms, default 5000), `pragmas`
  (extra `PRAGMA`s run on open, e.g. `{ "cache_size": -64000 }`).

Differences from `MemoryStore.persistence`:

- no `delay`: every committed write is durable, nothing is flushed on `stop()`;
- `key`, `cipher` and `compressionLevel` are refused at `init()` with `SQLITE_UNSUPPORTED_PERSISTENCE`:
  `node:sqlite` has no encryption or compression, so the options are never silently ignored.

## Services

### SQLiteStore

Parameters of `SQLStore` (`models`, `table`, `tables`, `autoCreateTable`) plus the connection parameters.
Each row is `uuid TEXT PRIMARY KEY, data TEXT CHECK (json_valid(data))`; queries use the JSON1 functions.

Semantics to know:

- comparisons follow the in-memory rules (a number or boolean only matches a JSON number or boolean, `!=` matches
  missing fields, `CONTAINS` only matches arrays); `LIKE` is case-sensitive (translated to `GLOB`);
- in paths, a numeric segment indexes an array (`tags.0`, `list.1.v`), as the in-memory store does;
- `patch` replaces top-level keys (one `json_set` per key); attribute names must match `[A-Za-z0-9_]+`;
- a collection item set at an index beyond the end is appended (as on PostgreSQL); an `UPDATE ... SET list.5.v`
  through an index beyond the end of an existing array is not applied (SQLite `json_set` ignores the path);
- two services sharing a `database.name` must ask for the same file (or memory) and the same `readOnly`,
  otherwise `init()` fails with `SQLITE_CONFLICTING_DATABASE`;
- the `migrate` command (Webda 3 types) is available, like on `PostgresStore`.

### SQLiteQueue

| Parameter | Default | Role |
| --- | --- | --- |
| `table` | `webda_queue` | table, created on init |
| `visibilityTimeout` | 30 | seconds a received but not deleted message stays invisible |
| `batchSize` | 10 | messages per receive |
| `waitTime` | 1 | seconds an empty receive waits (long polling); a send of the same process ends the wait at once |

A receive locks a batch with one `UPDATE ... RETURNING`; delete acks; an expired visibility timeout makes the
message visible again. In file mode, messages survive restarts and are shared by the processes of one host.

### SQLitePubSub

| Parameter | Default | Role |
| --- | --- | --- |
| `channel` | service name lowercased | channel |
| `table` | `webda_pubsub` | message log, created on init |
| `pollInterval` | 100 | ms between `PRAGMA data_version` checks for other processes |
| `retention` | 60 | seconds a message is kept for slow consumers |
| `batchSize` | 100 | messages fetched per poll |

SQLite has no LISTEN/NOTIFY: messages are appended to a log and read through a per-subscriber cursor. Delivery is
at-most-once per subscriber while subscribed; a subscriber only gets messages published after it subscribed, and
one offline longer than `retention` misses messages (use `SQLiteQueue` for guaranteed delivery). It works inside
one process in memory, inside one host with a file. It is not a network bus. There is no payload size limit.

## Caveats

- `DatabaseSync` is synchronous: every statement blocks the event loop. Fits development, tests, CLI tools and
  small single-node applications; use PostgreSQL for heavy concurrent traffic.
- Node 22 prints an `ExperimentalWarning` the first time `node:sqlite` is loaded (the module is loaded lazily on
  `init()`, importing the package never warns); Node 24 does not.

## Configuration

```jsonc
{
  "services": {
    "sqlite": {
      "type": "Webda/SQLiteStore",
      "persistence": { "path": "./.webda/app.sqlite" },
      "models": ["MyApp/Post", "MyApp/Comment"],
      "tables": { "MyApp/Comment": "comments" }
    },
    "jobs": { "type": "Webda/SQLiteQueue", "persistence": { "path": "./.webda/app.sqlite" } },
    "events": { "type": "Webda/SQLitePubSub", "persistence": { "path": "./.webda/app.sqlite" } },
    // tests / dev: same services, in memory, sharing one database
    "testStore": { "type": "Webda/SQLiteStore", "database": { "name": "test" } }
  }
}
```

`npm create webda -- --store sqlite` scaffolds an application on it.
