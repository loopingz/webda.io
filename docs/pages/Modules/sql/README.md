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

## Relational layer (`src/relational`)

The same package holds the engine-neutral part of the **typed table** stores (`PostgresRelationalStore` today):

- `RelationalDialect extends SQLDialect`: identifier quoting, the DDL type of each `@webda/sql-schema` column type,
  rendering of the additive schema steps (`createTable`, `addColumn`, `createIndex`, `addForeignKey`), introspection
  (`describeSchema`), the schema lock statement, and the JSON operations on a named JSON column.
- `planSchemaChanges(plan, live, mode)`: the additive steps bringing a database to a `RelationalSchemaPlan` and the
  drift it never resolves (no drop, no type change, no `NOT NULL`); `SchemaDriftError` for `validate`.
- `RelationalSchemaManager`: builds the plan from the model metadata, logs its warnings, renders the create DDL, diffs
  and syncs under the dialect lock.
- `TableMapping`: objects to rows (explicit column lists from the model projection, references split for composite
  keys, junction rows, the extra JSON column) and back.
- `SQLColumnComparisonExpression`: a WebdaQL comparison rendered for the column type, keeping the in-memory semantics
  (`n = '1'` matches, `n = 'abc'` does not raise, `!=` is null-safe).
- `RelationalRepository extends SQLRepository`: the hooks `fieldText()`, `typeText()` and `keyColumns()` point the
  shared statements at columns; reads select the table columns and fold the junction rows; writes name their columns
  and replace junction rows in one transaction (`Transact`); foreign key violations become `WebdaError.BadRequest`
  (insert, update) or `WebdaError.Conflict` (delete).
- `runTransaction` / `AsyncMutex`: `BEGIN` / `COMMIT` / `ROLLBACK` on one connection; on a connection that is not
  pooled, the store runs every statement and every transaction through the same mutex.

See [`PostgresRelationalStore`](../postgres/PostgresRelationalStore.md) for the user-facing behavior.
