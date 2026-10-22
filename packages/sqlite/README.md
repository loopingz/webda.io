# @webda/sqlite

`Webda/SQLiteStore`, `Webda/SQLiteQueue` and `Webda/SQLitePubSub` on Node's built-in `node:sqlite`
(Node >= 22.13, no third-party dependency). Without a `persistence` block the database lives in memory and is lost
on `stop()`, like `MemoryStore`; with `persistence.path` it is a single durable file.

| Need | Pick |
| --- | --- |
| Throw-away data in tests, zero setup | `MemoryStore` / `MemoryQueue` |
| A durable single file, WebdaQL pushed to SQL, queue and pub/sub on the same file | `@webda/sqlite` |
| One JSON file per object you can read by hand | `@webda/fs` |
| Several hosts, heavy concurrent traffic | `@webda/postgres` |

## Modes

- **Memory** (no `persistence`): one database per service, or one shared by the services giving the same
  `database.name` (store + queue + pubsub in a test).
- **File** (`persistence.path`, relative to the application directory): WAL journal by default, `synchronous`
  `NORMAL`; every committed write is durable, so there is no `delay` and no flush on `stop()`. Services of one
  process on the same path share one connection; other processes open their own.
- Differences from `MemoryStore.persistence`: no `delay`; `key`, `cipher` and `compressionLevel` are refused at
  `init()` (`node:sqlite` has no encryption or compression), never silently ignored.

## Caveats

- `DatabaseSync` is synchronous: every statement blocks the event loop. Fits development, tests, CLI tools and
  small single-node applications; use PostgreSQL for heavy concurrent traffic.
- `SQLitePubSub` is a message log read through cursors: delivery is at-most-once per subscriber while subscribed,
  a subscriber offline longer than `retention` misses messages (use `SQLiteQueue` for guaranteed delivery), and
  it works inside one host only (in-process wake-up, `PRAGMA data_version` polling for other processes).
- Node 22 prints an `ExperimentalWarning` the first time `node:sqlite` is loaded; Node 24 does not.

## Transactions

`"transaction": "operation"` runs every statement of an operation in one transaction (`BEGIN IMMEDIATE` on its first
statement, `COMMIT` when it succeeds, `ROLLBACK` when it fails), with the same lifecycle, `withTransaction()` helper
and `@Operation({ transaction: false })` opt-out as [`PostgresStore`](../postgres/README.md#transactions).

The services of a database share its single connection, so:

- an open transaction holds the database until its operation ends: the statements of other requests and workers
  wait for it (transactions are serialized, fine for the single-node use cases of SQLite);
- the services of the same database used by the operation (another `SQLiteStore`, a `SQLiteQueue`, a
  `SQLitePubSub`) take part in its transaction: a message sent by a failing operation is rolled back with its rows,
  and `SQLitePubSub` delivers the messages of a transaction once it committed;
- a table created inside a transaction that rolls back is created again on the next statement;
- an operation must not wait for work another async chain does on the same database (e.g. a queue consumer it
  waits for): that work waits for the end of the transaction.

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
