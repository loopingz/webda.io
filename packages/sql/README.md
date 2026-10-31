# @webda/sql

Engine-neutral "one JSON document per row" store for Webda: a `uuid` key column and a `data` JSON column per
table, CRUD and conditional writes, WebdaQL translated to SQL, class filtering through the stored `__type`,
bulk `deleteMany` / `updateMany`, native aggregations and the raw access used by the migration commands.

The package carries no database driver. An engine provides a `SQLDialect` (the syntax of every JSON fragment:
placeholders, JSON paths, type tests, merges, DDL) and a `SQLStore` subclass holding the connection:
see `@webda/postgres` (`PostgresDialect`, JSONB) and `@webda/sqlite` (`SQLiteDialect`, JSON1 on `node:sqlite`).

It also holds the engine-neutral part of the **typed table** stores (`src/relational`): `RelationalDialect`,
the additive schema sync planner and `RelationalSchemaManager`, `TableMapping` (objects to typed rows and junction
rows), `SQLColumnComparisonExpression`, `RelationalRepository` and `RelationalStoreSupport`, consumed by
`PostgresRelationalStore` (`@webda/postgres`) and `SQLiteRelationalStore` (`@webda/sqlite`) on top of the
`RelationalSchemaPlan` of `@webda/sql-schema`, and the multi-version registry those stores use to share one database
between several application versions: the `Webda/SchemaVersion` model (stored by the `Registry`),
`SchemaVersionRegistry` (live versions, compatibility check, heartbeat, retire), `SchemaIncompatibleError`, the
contract planner (`planContract`) and the `schema check | contract | retire | backfill` commands.
