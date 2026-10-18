# @webda/sql

Engine-neutral "one JSON document per row" store for Webda: a `uuid` key column and a `data` JSON column per
table, CRUD and conditional writes, WebdaQL translated to SQL, class filtering through the stored `__type`,
bulk `deleteMany` / `updateMany`, native aggregations and the raw access used by the migration commands.

The package carries no database driver. An engine provides a `SQLDialect` (the syntax of every JSON fragment:
placeholders, JSON paths, type tests, merges, DDL) and a `SQLStore` subclass holding the connection:
see `@webda/postgres` (`PostgresDialect`, JSONB) and `@webda/sqlite` (`SQLiteDialect`, JSON1 on `node:sqlite`).
