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