# PostgresSQL Store

We use the `JSONB` type and use postgres as a NoSQL store for now.
More optimizations will come

The Store requires the database and table to be created before

## Create table

To create the table simply run

```sql
CREATE TABLE IF NOT EXISTS ${tableName}
(
	uuid uuid NOT NULL,
    data jsonb,
    CONSTRAINT ${tableName}_pkey PRIMARY KEY (uuid)
);
```

Webda do not enforce strong constraint on the uuid, to allow business type uuid like for idents

```sql
CREATE TABLE IF NOT EXISTS ${tableName}
(
	uuid varchar(300) NOT NULL,
    data jsonb,
    CONSTRAINT ${tableName}_pkey PRIMARY KEY (uuid)
);
```

## Tips

To check how many types of objects are stored in a Store you can run

```sql
select count(data->>'__type'),data->>'__type' from registry group by data->>'__type';
```


## Model types and upgrading

Each row stores its model identifier in `data.__type` (read back as a non-enumerable property). Queries, `deleteMany` and `updateMany` keep to the repository model and its subclasses, which matters when a parent and its subclasses share one table.

- Rows written by earlier releases have no `__type`. They belong to the model the table was declared for (the configured model of a single-model `table`, otherwise the model owning the table): its repository and its ancestors see them, a subclass repository does not.
- After upgrading, stamp them once (idempotent):

  ```typescript
  await useService<PostgresStore>("postgres").backfillTypes();
  ```

  or in SQL: `UPDATE <table> SET data = data || jsonb_build_object('__type', '<Model/Identifier>') WHERE data->>'__type' IS NULL;`
- `update()` with plain data (`ModelRef.update`) keeps the stored `__type`; writing an instance stores the type it was read with, or its class.
- **Rollback:** an earlier release does not strip `__type` when reading, so rows written by this release load with an enumerable `__type` field there (sent in outputs and saved back). Roll back only together with removing the key (`UPDATE <table> SET data = data - '__type'`).
- Comparisons follow the in-memory semantics (see [Statements](../ql/Statements.md#comparison-semantics-across-stores)): a missing field or another type never matches a number or boolean comparison, `!=` matches missing fields, `CONTAINS` only matches arrays.
