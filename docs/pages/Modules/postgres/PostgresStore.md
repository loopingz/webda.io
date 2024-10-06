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
