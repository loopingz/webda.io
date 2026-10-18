---
sidebar_label: "@webda/sql"
---

# sql

`@webda/sql` is the engine-neutral "one JSON document per row" store shared by `@webda/postgres` and
`@webda/sqlite`: a `uuid` key column and a `data` JSON column per table.

It holds everything that does not depend on the engine:

- `SQLRepository`: CRUD and conditional writes, WebdaQL translated to SQL, the class filter on the stored `__type`
  (Webda 3 forms included), bulk `deleteMany` / `updateMany`, native aggregations, `backfillTypes()`.
- `SQLStore`: table resolution (`table`, `tables`, per-model default), table creation (`autoCreateTable`),
  repositories wrapped in `EventRepository`, and the raw access of the `migrate` command (`rawPages`, `rawPatch`,
  `countStoredTypes`).
- `SQLDialect`: the contract an engine implements. Every engine-specific fragment is a method: placeholders
  (`$1` / `?1`), JSON paths, type tests, typed comparisons, `!=`, `CONTAINS`, `LIKE`, DDL, unique violation
  detection, shallow merge, counters, collection items, bulk assignments.

The package has no database driver.

## Adding an engine

1. Implement `SQLDialect` (see `PostgresDialect` in `@webda/postgres` and `SQLiteDialect` in `@webda/sqlite`).
2. Extend `SQLStore`: `createDialect()`, `getClient()` (a `SQLClient`: `query(sql, values)` returning
   `{ rows, rowCount }`), `init()` / `stop()` for the connection, and declare `implements MigratableStore` with the
   `migrate` command on the class itself (the compiler reads the capability from the class own heritage clause).
3. Run the shared fixtures of `@webda/sql/lib/test` (`PARITY_ROWS`, `PARITY_QUERIES`) against `MemoryRepository`,
   plus `checkAggregation` and `checkCreateWithoutPrimaryKey` from `@webda/core/lib/test`.
