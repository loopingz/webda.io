# @webda/sqlite

`Webda/SQLiteStore`, `Webda/SQLiteQueue` and `Webda/SQLitePubSub` on Node's built-in `node:sqlite`
(Node >= 22.13, no third-party dependency). Without a `persistence` block the database lives in memory and is lost
on `stop()`, like `MemoryStore`; with `persistence.path` it is a single durable file.

| Need                                                                             | Pick                          |
| -------------------------------------------------------------------------------- | ----------------------------- |
| Throw-away data in tests, zero setup                                             | `MemoryStore` / `MemoryQueue` |
| A durable single file, WebdaQL pushed to SQL, queue and pub/sub on the same file | `@webda/sqlite`               |
| One JSON file per object you can read by hand                                    | `@webda/fs`                   |
| Several hosts, heavy concurrent traffic                                          | `@webda/postgres`             |

## Modes

- **Memory** (no `persistence`): one database per service, or one shared by the services giving the same
  `database.name` (store + queue + pubsub in a test).
- **File** (`persistence.path`, relative to the application directory): WAL journal by default, `synchronous`
  `NORMAL`; every committed write is durable, so there is no `delay` and no flush on `stop()`. Services of one
  process on the same path share one connection; other processes open their own.
- Differences from `MemoryStore.persistence`: no `delay`; `key`, `cipher` and `compressionLevel` are refused at
  `init()` (`node:sqlite` has no encryption or compression), never silently ignored.

## Relational store

`Webda/SQLiteRelationalStore` keeps the models you list in **typed tables** (one column per field, primary and foreign
keys, junction tables, indexes) generated from the model metadata by `@webda/sql-schema`, on the relational layer of
`@webda/sql` shared with `PostgresRelationalStore`. Foreign keys are inline and enforced (`PRAGMA foreign_keys`),
`schemaSync` (`none` | `create` | `alter` | `validate`) is additive only, `webda sqlite schema [--sql | --diff | --json]`
prints the plan. It is never the `Registry` and only stores listed models. See
[the documentation](https://webda.io/docs/Modules/sqlite/SQLiteRelationalStore).

## Caveats

- `DatabaseSync` is synchronous: every statement blocks the event loop. Fits development, tests, CLI tools and
  small single-node applications; use PostgreSQL for heavy concurrent traffic.
- `SQLitePubSub` is a message log read through cursors: delivery is at-most-once per subscriber while subscribed,
  a subscriber offline longer than `retention` misses messages (use `SQLiteQueue` for guaranteed delivery), and
  it works inside one host only (in-process wake-up, `PRAGMA data_version` polling for other processes).
- Node 22 prints an `ExperimentalWarning` the first time `node:sqlite` is loaded; Node 24 does not.

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
