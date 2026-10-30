# SQLiteRelationalStore

`Webda/SQLiteRelationalStore` stores models in **typed SQLite tables**: one column per field, primary and foreign
keys, junction tables for the link collections, indexes. It is the SQLite rendering of the relational layer of
[`@webda/sql`](../sql/README.md) used by [`PostgresRelationalStore`](../postgres/PostgresRelationalStore.md): same
plan ([`@webda/sql-schema`](../sql-schema/README.md)), same repository, same WebdaQL translation, same tests. Read
the Postgres page for the mapping, the read and write semantics, the errors and the limitations; this page lists what
SQLite changes.

```json
{
  "services": {
    "Registry": { "type": "Webda/SQLiteStore", "persistence": { "path": "./data/app.sqlite" } },
    "domain": {
      "type": "Webda/SQLiteRelationalStore",
      "models": ["MyApp/User", "MyApp/Post", "MyApp/Comment", "MyApp/Tag"],
      "persistence": { "path": "./data/app.sqlite" },
      "schemaSync": "alter"
    }
  }
}
```

Both stores can share one database file (one handle per file, reference counted): keep the JSON `SQLiteStore` as
`Registry` and list the domain models in the relational store.

## Parameters

Those of `SQLiteStore` (`persistence`, `database`, `busyTimeout`, `pragmas`, `models`, `tables`), plus the relational
ones: `schemaSync` (`none` | `create` | `alter` | `validate`, default `create`), `columnNaming`, `extraColumn`,
`foreignKeys`, `numericAsDecimal`. `table` is refused and a `tables` override must be a lowercase identifier.

## SQLite specifics

- **Declared types** are the plan types, so `PRAGMA table_info` gives them back: `TEXT`, `VARCHAR(n)`, `TIMESTAMPTZ`,
  `DATE`, `BIGINT`, `REAL`, `DECIMAL`, `BOOLEAN`, `JSON`. Dates and timestamps are stored as ISO 8601 text (which
  sorts and compares correctly), booleans as `0`/`1` and read back as booleans, JSON as text.
- **Foreign keys are inline** in `CREATE TABLE` (`DEFERRABLE INITIALLY DEFERRED`, so self references and cycles insert
  in one transaction) and `PRAGMA foreign_keys = ON` is set on the database handle at `init()`. SQLite cannot add a
  constraint to an existing table: a foreign key missing from a live table is reported by `alter` (`WARN`) and refused
  by `validate` ("recreate the table"), never applied.
- **`alter`** adds columns (`ALTER TABLE ... ADD COLUMN`, always nullable) and indexes (`IF NOT EXISTS`). Nothing is
  ever dropped or retyped.
- **One writer.** There is no schema lock; every statement and every transaction of a database handle goes through one
  mutex, shared by all the stores on that handle, so a plain write never runs inside another caller's transaction.
- **Foreign key violations carry no constraint name**: the `WebdaError.BadRequest` (insert, update) or
  `WebdaError.Conflict` (delete) says "a foreign key".
- `webda sqlite schema [--sql | --diff | --json]` prints the plan, its DDL or the differences with the database file.

## Other engines

MySQL / MariaDB ([#1010](https://github.com/loopingz/webda.io/issues/1010)) and SQL Server
([#1011](https://github.com/loopingz/webda.io/issues/1011)) are not implemented: each is one `RelationalDialect` and one
store on the same layer. Please upvote and comment on those issues if you need them.
