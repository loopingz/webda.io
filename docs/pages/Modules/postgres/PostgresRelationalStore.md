# PostgresRelationalStore

`Webda/PostgresRelationalStore` stores models in **typed tables**: one column per field, primary and foreign keys,
junction tables for the link collections, indexes. The schema is generated from the compiled model metadata by
[`@webda/sql-schema`](../sql-schema/README.md); the models, the `Repository<T>` API, WebdaQL and the repository events
are the same as with the JSONB [`PostgresStore`](./PostgresStore.md).

```json
{
  "services": {
    "Registry": { "type": "Webda/PostgresStore", "postgresqlServer": { "host": "localhost", "database": "webda" } },
    "domain": {
      "type": "Webda/PostgresRelationalStore",
      "models": ["MyApp/User", "MyApp/Post", "MyApp/Comment", "MyApp/Tag"],
      "postgresqlServer": { "host": "localhost", "database": "webda" },
      "usePool": true,
      "schemaSync": "alter"
    }
  }
}
```

## JSONB or relational?

|                       | `PostgresStore` (JSONB) | `PostgresRelationalStore`         |
| --------------------- | ----------------------- | --------------------------------- |
| Table layout          | `uuid`, `data jsonb`    | one typed column per field        |
| Schema changes        | none needed             | additive, at `init()` or by hand  |
| Unknown properties    | kept in `data`          | kept in the `_extra` JSONB column |
| Links                 | a key inside `data`     | a column with a foreign key       |
| Link collections      | an array inside `data`  | a junction table                  |
| Can be the `Registry` | yes                     | **no** (`init()` fails)           |
| Models                | listed or fallback      | **listed only**                   |

Keep the JSONB store as `Registry` (it accepts every model, configuration and internal state) and use the relational
store for the domain models whose shape is stable. Both can share one `postgresqlServer` (pools are shared by
configuration).

## Parameters

Those of `PostgresStore` (`postgresqlServer`, `usePool`, `models`, `tables`), plus:

| Parameter          | Default      | Description                                                                                                                                                                                                          |
| ------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaSync`       | `"create"`   | `none`, `create` (missing tables, with their indexes and foreign keys), `alter` (`create` plus the missing columns, indexes and foreign keys of existing tables), `validate` (write nothing, fail on any difference) |
| `columnNaming`     | `"preserve"` | `preserve` keeps the field names (quoted camelCase), `snake_case` converts them                                                                                                                                      |
| `extraColumn`      | `"_extra"`   | JSONB column of the properties the model schema does not declare, `false` to refuse them                                                                                                                             |
| `foreignKeys`      | `true`       | create the foreign key constraints                                                                                                                                                                                   |
| `numericAsDecimal` | `false`      | map JSON `number` to `NUMERIC` instead of `DOUBLE PRECISION`                                                                                                                                                         |

`table` (one shared table) is refused, `autoCreateTable` is replaced by `schemaSync`, `views` and `viewPrefix` do
nothing (the tables are already typed). A `tables` override must be a lowercase identifier (`[a-z_][a-z0-9_]*`).

## Mapping

| Model                                                    | Table                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `string` (`maxLength`, `format`)                         | `TEXT`, `VARCHAR(n)`, `TIMESTAMPTZ` (`date-time` or `Date`), `DATE`; `enum` adds a `CHECK`                                |
| `integer` / `number` / `boolean`                         | `BIGINT` / `DOUBLE PRECISION` / `BOOLEAN`                                                                                 |
| objects, arrays, unions, untyped                         | `JSONB`; nested paths stay queryable (`meta.a = 1`)                                                                       |
| primary key                                              | `TEXT` column(s) and the primary key constraint (composite keys supported)                                                |
| `ModelParent` / `BelongTo`                               | key column(s) + `FOREIGN KEY ... ON DELETE CASCADE`                                                                       |
| `ModelLink` / `ManyToOne` / `OneToOne`                   | key column(s) + `FOREIGN KEY ... ON DELETE NO ACTION`, indexed (`OneToOne`: unique)                                       |
| `ModelLinksSimpleArray` / `ManyToMany` / `ModelLinksMap` | junction table `<table>_<attribute>` (owner key, target key, `_position` or `key`, link attributes or `attributes` JSONB) |
| `ModelRelated` / `OneToMany` / `ModelsMapped`            | no storage (`ModelsMapped` stays empty: do not attach a `ModelMapper` to these models)                                    |
| a link to a model of another store                       | column + index, no foreign key, one `WARN` at init                                                                        |
| subclasses                                               | the table of their closest listed ancestor, with an indexed `__type` column; `useRepository(Dog).query("")` filters on it |
| unknown properties                                       | the `_extra` JSONB column, merged under the typed columns on read                                                         |

Every column is created **nullable** (the model schema validates `required`); foreign keys are `DEFERRABLE INITIALLY
DEFERRED`, so self references and cycles insert in one transaction.

## Schema lifecycle

At `init()` the store builds the plan, takes an advisory lock (`pg_advisory_xact_lock` on the store name) and applies
`schemaSync` in one transaction. It is **never destructive**: no `DROP`, no type change, no `SET NOT NULL`, no rename.
What `alter` cannot resolve (a column of another type, a column the plan does not know) is logged at `WARN`; `validate`
throws `SchemaDriftError` (`SCHEMA_DRIFT`) for the same differences and for anything missing.

```bash
webda postgres schema            # one line per table with its columns
webda postgres schema --sql      # the CREATE statements of the whole plan
webda postgres schema --diff     # connect, print what `alter` would run, then `-- ` lines for the drift (exit 1)
webda postgres schema --json     # the plan
```

Teams with their own migration pipeline run `schemaSync: "none"` or `"validate"` and apply `--sql` / `--diff` with
their tooling.

## Reads and writes

- Every statement names its columns from the plan: a row written by an older application version keeps the columns
  this version does not know, `update()` only replaces the columns of its own projection and merges `_extra`.
- Junction rows are written in the same transaction as the owner row and read with one statement per junction per
  page. With `usePool` each transaction takes its own connection; on a single client every statement of the store
  goes through one lock, so a plain write never runs inside another caller's transaction.
- WebdaQL: `=, !=, <, <=, >, >=, LIKE, IN, IS NULL, IS NOT NULL, ORDER BY, LIMIT/OFFSET` on columns and JSONB paths,
  `CONTAINS` on JSONB arrays, with the in-memory semantics (`views = '1'` matches a `BIGINT`, `views = 'abc'` matches
  nothing, `!=` matches `NULL`). `NULL` sorts first ascending, last descending.
- `incrementAttributes` works on numeric columns; `upsertItemToCollection` / `deleteItemFromCollection` work on JSONB
  arrays and on simple link arrays (by position); `updateMany` assigns columns and JSONB paths (one assignment per
  JSONB column); `deleteMany` is one `DELETE`.
- Aggregations and `count` run in SQL (`native: true`).

### Errors

| Situation                                                                                                                                                                                     | Error                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| duplicate primary key on `create`                                                                                                                                                             | `Error("Already exists: <key>")`                       |
| foreign key violation on insert or update (unknown link target)                                                                                                                               | `WebdaError.BadRequest` naming the relation            |
| delete of a row still referenced (`NO ACTION`)                                                                                                                                                | `WebdaError.Conflict`                                  |
| duplicate key appended to a simple link array                                                                                                                                                 | `WebdaError.Conflict`                                  |
| filter or `ORDER BY` on a junction attribute, on a composite reference, on an unknown field without `_extra`; collection operation on a scalar; `incrementAttributes` on a non-numeric column | `WebdaError.BadRequest`                                |
| service named `Registry`                                                                                                                                                                      | `WebdaError.CodeError("RELATIONAL_STORE_AS_REGISTRY")` |
| `table` parameter                                                                                                                                                                             | `WebdaError.CodeError("RELATIONAL_SHARED_TABLE")`      |
| repository of a model not listed                                                                                                                                                              | `WebdaError.CodeError("MODEL_NOT_PLANNED")`            |
| `schemaSync: "validate"` with a difference                                                                                                                                                    | `SchemaDriftError` (`SCHEMA_DRIFT`)                    |

## Limitations

- No filter on a junction attribute (`tags CONTAINS 't1'`): query the target model, or keep the collection in a JSONB
  field.
- No filter on a reference to a composite key.
- `ModelsMapped` attributes are not filled.
- No `MigratableStore` raw access (there are no Webda 3 JSON rows in a typed table).
- A JSON `null` stored in a JSONB column reads as an absent field.

Follow-ups tracked in [#838](https://github.com/loopingz/webda.io/issues/838): the multi-version registry
(`Webda/SchemaVersion`, `webda postgres schema check | contract | retire`), `importFromJsonb` from a JSONB store,
`foreignKeysToJsonb`, `@Index` / `@Unique` tags and operation-scoped transactions (#839).

## Other engines

The same layer renders on SQLite with [`SQLiteRelationalStore`](../sqlite/SQLiteRelationalStore.md). MySQL / MariaDB
([#1010](https://github.com/loopingz/webda.io/issues/1010)) and SQL Server
([#1011](https://github.com/loopingz/webda.io/issues/1011)) are not implemented: each is one `RelationalDialect` and one
store. Please upvote and comment on those issues if you need them.
