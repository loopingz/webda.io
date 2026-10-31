# @webda/sql-schema module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)

<!-- README_HEADER -->

## @webda/sql-schema — relational schema plans

A pure, driver-free function from compiled Webda model metadata (`Schemas.Stored`, `Relations`, `Reflection`,
`PrimaryKey`, `Ancestors`) to a **`RelationalSchemaPlan`**: tables, typed columns, primary keys, foreign keys, junction
tables and indexes. Relational stores render the same plan in their own dialect (#838 `PostgresRelationalStore`, #841
`SequelizeStore`).

It has no runtime dependency: no database, no logging, no Webda core. Warnings are returned in the plan.

```ts
import { blockingChanges, buildSchemaPlan, compareSchemaPlans, planHash } from "@webda/sql-schema";

const plan = buildSchemaPlan(
  models.map(m => m.Metadata),
  {
    tables: { "MyApp/Post": "posts" },
    knownModels: allModels.map(m => m.Metadata) // resolve references to models of other stores
  }
);

// Before migrating a database shared by several running versions
const changes = compareSchemaPlans([{ version: "1.2.0", plan: livePlan }], plan);
if (blockingChanges(changes).length) {
  // refuse to start
}
```

### Mapping

| Model                                           | Plan                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `string` (`maxLength`, `format`, `enum`)        | `text`, `varchar(n)`, `timestamptz` (`date-time` or `Date`), `date`, `uuid`, enum values                                           |
| `integer` / `number` / `boolean`                | `bigint` / `double` (`decimal` with `numericAsDecimal`) / `boolean`                                                                |
| objects, arrays, unions, `$ref`, untyped        | `json`                                                                                                                             |
| not in `required`                               | nullable                                                                                                                           |
| subclasses                                      | the table of their closest planned ancestor (`__type` column), unless `tables` names their own                                     |
| `ModelParent` / `BelongTo`                      | key column(s) + foreign key `ON DELETE CASCADE`                                                                                    |
| `ModelLink` / `RelateTo` / `ManyToOne`          | key column(s) + foreign key `ON DELETE NO ACTION`; `OneToOne` adds a unique index                                                  |
| `ModelLinksSimpleArray`                         | junction `<table>_<attribute>` (owner key, target key, `_position`)                                                                |
| `ModelLinksArray` / `ManyToMany` / `Contains`   | same junction + one column per link attribute (`attributes` json when none is declared)                                            |
| `ModelLinksMap`                                 | junction keyed by (owner key, `key`)                                                                                               |
| `ModelRelated` / `OneToMany` / `ModelsMapped`   | no storage                                                                                                                         |
| reference to a model outside the plan           | column + index, no foreign key, `CROSS_STORE_REFERENCE` warning; a foreign key to the table `referencedTables` names for the model |
| `@Index` / `@Unique` tags (`Relations.indexes`) | an index (unique with `@Unique`) on the attribute's column(s); attributes sharing a group name form one composite index            |
| unknown properties                              | `_extra` json column (`extraColumn: false` to disable)                                                                             |

Composite primary keys are supported; a reference to a composite key gets one column per key part
(`<attribute>_<key>`). Constraint and index names are cut with a hash suffix to fit 63 characters.

`compareSchemaPlans` classifies every difference with the plans of the live versions as `SAFE` (additive or relaxing),
`WARN` or `BLOCK` (type change, narrowing, removed enum value, field becoming optional, relation kind/target/delete
policy change, primary key change, hierarchy change, layout option change). `allowIncompatible` downgrades a `BLOCK` of
a table, column, model or attribute to a forced `WARN`.

The plan is consumed by `@webda/sql` (`RelationalRepository`, `RelationalSchemaManager`) and rendered by
`PostgresRelationalStore` in `@webda/postgres`.
