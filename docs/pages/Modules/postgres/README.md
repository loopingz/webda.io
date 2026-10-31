---
sidebar_label: "@webda/postgres"
---

# postgres

Two stores on PostgreSQL:

- [`PostgresStore`](./PostgresStore.md): built on [`@webda/sql`](../sql/README.md), a `SQLStore` bound to the JSONB
  `PostgresDialect`. One `uuid`, `data jsonb` table per model, no schema to maintain. The recommended `Registry`.
- [`PostgresRelationalStore`](./PostgresRelationalStore.md): typed tables, primary and foreign keys, junction tables
  and indexes generated from the model metadata by `@webda/sql-schema`, additive schema sync at `init()` and the
  `webda postgres schema show` command. For the domain models you list explicitly.

Plus `PostgresQueue` and `PostgresPubSub`.
