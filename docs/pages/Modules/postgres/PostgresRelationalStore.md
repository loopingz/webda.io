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

| Parameter           | Default      | Description                                                                                                                                                                                                          |
| ------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaSync`        | `"create"`   | `none`, `create` (missing tables, with their indexes and foreign keys), `alter` (`create` plus the missing columns, indexes and foreign keys of existing tables), `validate` (write nothing, fail on any difference) |
| `columnNaming`      | `"preserve"` | `preserve` keeps the field names (quoted camelCase), `snake_case` converts them                                                                                                                                      |
| `extraColumn`       | `"_extra"`   | JSONB column of the properties the model schema does not declare, `false` to refuse them                                                                                                                             |
| `foreignKeys`       | `true`       | create the foreign key constraints                                                                                                                                                                                   |
| `numericAsDecimal`  | `false`      | map JSON `number` to `NUMERIC` instead of `DOUBLE PRECISION`                                                                                                                                                         |
| `appVersion`        | package.json | the application version recorded in the `Webda/SchemaVersion` registry                                                                                                                                               |
| `allowIncompatible` | `[]`         | elements (`<table>`, `<table>.<column>`, `<model>`, `<model>.<attribute>`) whose blocking changes against a live version are accepted (`BLOCK` becomes `WARN`, recorded in `forced`)                                 |
| `versionHeartbeat`  | `60`         | seconds between two heartbeats of the version in the registry, `0` for none                                                                                                                                          |
| `versionTtl`        | `600`        | seconds after its last heartbeat a version still counts as live                                                                                                                                                      |

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

At `init()` the store builds the plan, takes an advisory lock (`pg_advisory_xact_lock` on the store name) in a
transaction, describes the database under it, reads the live application versions from the registry (see
[below](#several-app-versions-on-the-same-database)), refuses an incompatible plan, applies `schemaSync`, records its
own version and commits. It is **never destructive**: no `DROP`, no type change, no `SET NOT NULL`, no rename. What
`alter` cannot resolve (a column of another type, a column no version knows) is logged at `WARN`; `validate` throws
`SchemaDriftError` (`SCHEMA_DRIFT`) for the same differences and for anything missing. The columns of the other live
versions are never drift.

On a table that already has rows and traffic, `alter` keeps the heavy work out of the DDL transaction: an index is
built `CONCURRENTLY` after it (a failed build, duplicates under a new unique index for example, is logged and the
index dropped), a foreign key is added `NOT VALID` in the transaction and validated after it, so no `ACCESS EXCLUSIVE`
lock outlives the catalog update.

```bash
webda postgres schema show           # one line per table with its columns
webda postgres schema show --sql     # the CREATE statements of the whole plan
webda postgres schema show --diff    # connect, print what `alter` would run, then `-- ` lines for the drift (exit 1)
webda postgres schema show --json    # the plan
webda postgres schema check          # compare the plan with the live versions (exit 1 on a BLOCK)
webda postgres schema contract --dry-run
webda postgres schema retire --version 1.4.0
webda postgres schema backfill --table post --from title --to headline
```

Teams with their own migration pipeline run `schemaSync: "none"` or `"validate"` and apply `--sql` / `--diff` with
their tooling; the registry and `schema check` still protect them.

## Several app versions on the same database

Blue/green, canary and rolling deployments run **several versions of the application at the same time** against the
same tables. The store makes that safe with the expand/contract pattern: the physical schema is the **union** of
every live version, each version only reads and writes its own **projection**.

- Every statement names its columns from the plan of its version (never `SELECT *`), `update()` only replaces the
  columns of its own projection, `_extra` is merged (`_extra || $n`) so the keys of another version survive, unknown
  columns are ignored on read and a `__type` only the newer version knows is skipped by the class filter.
- A new `required` field is created **nullable**: `NOT NULL` waits for the contract phase, the application validates
  until then.
- **Registry.** Each running version is a `Webda/SchemaVersion` entry (`uuid` = `<store>:<appVersion>:<planHash>`,
  the full plan, `status` `LIVE` | `RETIRED`, `firstSeen`, `lastHeartbeat`, the `instances` map, `forced`). Nobody
  claims the model, so it lands in the `Registry` catch-all (JSONB, memory, Mongo...), never in a relational table.
  Each instance heartbeats with a partial `patch()` every `versionHeartbeat` seconds; a version silent for longer
  than `versionTtl` no longer counts. The flow at `init()` is lock → read live versions → check → DDL → upsert own
  version → unlock. If the registry cannot be read or written, `init()` fails closed (`SCHEMA_REGISTRY_UNAVAILABLE`,
  fatal, no DDL). A `MemoryStore` registry only knows the versions of its own process: a `WARN` says the checks are
  limited to the process.
- **Compatibility check**, on every startup whatever `schemaSync`: the plan is compared field by field with the plan
  of every live version by `compareSchemaPlans` (`@webda/sql-schema`, a pure function). Additions, widenings, a field
  becoming required or removed are `SAFE`; added enum values, a rename (remove + add) and a new unique index are
  `WARN`; a property type change, a narrowing, removed enum values, a field becoming optional while the live version
  requires it, a relation kind or target change, a delete policy change, a primary key, hierarchy or layout option
  change are `BLOCK`. A `BLOCK` refuses to start with `SchemaIncompatibleError` (HTTP 409, `SCHEMA_INCOMPATIBLE_ERROR`,
  wrapped in a `FatalInitError`) naming the table or column, the live version and the expand/contract recipe; the
  database is untouched and the refused version is not registered. `allowIncompatible` (or
  `schema check --force-incompatible`) downgrades a change you accept to a forced `WARN`, recorded in the version.
- **`webda postgres schema check [--against <version>] [--json]`** prints the same table for CI (exit 1 on a `BLOCK`,
  2 when `--against` matches nothing), so a pull request changing a property type fails before the deploy, not at
  the canary's startup. Run it against the production registry, read-only.
- **Contract phase**, never run by `init()`: `webda postgres schema contract [--dry-run]` computes the union of the
  versions still live and proposes what is now safe: drop the columns and tables no live version uses (only what a
  retired or expired version planned: a DBA's column is left alone), `SET NOT NULL` where every live version requires
  the field (skipped when a row is null), validate the foreign keys still `NOT VALID`. `webda postgres schema retire
--version <id | appVersion | planHash>` retires a version first.
- **Renames and type changes** are expand / backfill / contract: add the new field (`headline`, `statusCode`),
  `webda postgres schema backfill --table post --from title --to headline [--batch 1000]` copies the column by
  batches where the target is null, switch the reads, retire the old version, contract.

Per-version views, `schemaPerVersion` and the dual-write trigger of the design are not implemented.

## Reads and writes

- Every statement names its columns from the plan: a row written by an older application version keeps the columns
  this version does not know, `update()` only replaces the columns of its own projection and merges `_extra`.
- Junction rows are written in the same transaction as the owner row and read with one statement per junction per
  page. With `usePool` each transaction takes its own connection; on a single client every statement of the store
  goes through one lock, so a plain write never runs inside another caller's transaction.
- With `"transaction": "operation"` (see [PostgresStore](./PostgresStore.md#transactions)), every statement of an
  operation runs in the operation transaction: the owner row and its junctions join it instead of opening their own.
- WebdaQL: `=, !=, <, <=, >, >=, LIKE, IN, IS NULL, IS NOT NULL, ORDER BY, LIMIT/OFFSET` on columns and JSONB paths,
  `CONTAINS` on JSONB arrays, with the in-memory semantics (`views = '1'` matches a `BIGINT`, `views = 'abc'` matches
  nothing, `!=` matches `NULL`). `NULL` sorts first ascending, last descending.
- `incrementAttributes` works on numeric columns; `upsertItemToCollection` / `deleteItemFromCollection` work on JSONB
  arrays and on simple link arrays (by position); `updateMany` assigns columns and JSONB paths (one assignment per
  JSONB column); `deleteMany` is one `DELETE`.
- Aggregations and `count` run in SQL (`native: true`).

### Errors

| Situation                                                                                                                                                                                     | Error                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| duplicate primary key on `create`                                                                                                                                                             | `Error("Already exists: <key>")`                             |
| foreign key violation on insert or update (unknown link target)                                                                                                                               | `WebdaError.BadRequest` naming the relation                  |
| delete of a row still referenced (`NO ACTION`)                                                                                                                                                | `WebdaError.Conflict`                                        |
| duplicate key appended to a simple link array                                                                                                                                                 | `WebdaError.Conflict`                                        |
| filter or `ORDER BY` on a junction attribute, on a composite reference, on an unknown field without `_extra`; collection operation on a scalar; `incrementAttributes` on a non-numeric column | `WebdaError.BadRequest`                                      |
| service named `Registry`                                                                                                                                                                      | `WebdaError.CodeError("RELATIONAL_STORE_AS_REGISTRY")`       |
| `table` parameter                                                                                                                                                                             | `WebdaError.CodeError("RELATIONAL_SHARED_TABLE")`            |
| repository of a model not listed                                                                                                                                                              | `WebdaError.CodeError("MODEL_NOT_PLANNED")`                  |
| `schemaSync: "validate"` with a difference                                                                                                                                                    | `SchemaDriftError` (`SCHEMA_DRIFT`)                          |
| plan incompatible with a live application version                                                                                                                                             | `SchemaIncompatibleError` (409, fatal at `init()`)           |
| `Registry` unreachable at `init()`                                                                                                                                                            | `SchemaRegistryError` (`SCHEMA_REGISTRY_UNAVAILABLE`, fatal) |
| `Webda/SchemaVersion` listed in the store models                                                                                                                                              | `WebdaError.CodeError("RELATIONAL_SCHEMA_VERSION_MODEL")`    |

## Limitations

- No filter on a junction attribute (`tags CONTAINS 't1'`): query the target model, or keep the collection in a JSONB
  field.
- No filter on a reference to a composite key.
- `ModelsMapped` attributes are not filled.
- No `MigratableStore` raw access (there are no Webda 3 JSON rows in a typed table).
- A JSON `null` stored in a JSONB column reads as an absent field.

Follow-ups tracked in [#838](https://github.com/loopingz/webda.io/issues/838): `importFromJsonb` from a JSONB store,
`foreignKeysToJsonb`, `@Index` / `@Unique` tags (#1017), per-version views and `schemaPerVersion` (#1016).

## Other engines

The same layer renders on SQLite with [`SQLiteRelationalStore`](../sqlite/SQLiteRelationalStore.md). MySQL / MariaDB
([#1010](https://github.com/loopingz/webda.io/issues/1010)) and SQL Server
([#1011](https://github.com/loopingz/webda.io/issues/1011)) are not implemented: each is one `RelationalDialect` and one
store. Please upvote and comment on those issues if you need them.
