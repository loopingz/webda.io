# @webda/postgres module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

> PostgreSQL-backed Store for Webda — persists model instances as JSONB rows in Postgres with automatic table creation, view generation, and full WebdaQL query support.

## When to use it

- You want a relational database backing store for Webda models with ACID guarantees.
- You are already running PostgreSQL and want Webda models to live alongside existing tables.
- You need to query across models using familiar SQL tooling while keeping the Webda model API.

## Install

```bash
pnpm add @webda/postgres
```

## Configuration

```json
{
  "services": {
    "postStore": {
      "type": "PostgresStore",
      "model": "MyApp/Post",
      "postgresqlServer": {
        "host": "localhost",
        "port": 5432,
        "database": "myapp",
        "user": "webda",
        "password": "${POSTGRES_PASSWORD}"
      },
      "autoCreateTable": true
    }
  }
}
```

Or rely on libpq environment variables (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`):

```json
{
  "services": {
    "postStore": {
      "type": "PostgresStore",
      "model": "MyApp/Post",
      "autoCreateTable": true
    }
  }
}
```

| Parameter          | Type                           | Default        | Required | Description                                                                                |
| ------------------ | ------------------------------ | -------------- | -------- | ------------------------------------------------------------------------------------------ |
| `postgresqlServer` | `ClientConfig` \| `PoolConfig` | libpq env vars | No       | PostgreSQL connection config (host, port, database, user, password)                        |
| `usePool`          | boolean                        | `false`        | No       | Use a connection pool (`pg.Pool`) instead of a single client                               |
| `table`            | string                         | —              | No       | Table of every model of the store (subclasses and fallback models included), as in Webda 3 |
| `tables`           | object                         | `{}`           | No       | Per-model table overrides: `{ "MyApp/Model": "my_table" }`                                 |
| `autoCreateTable`  | boolean                        | `true`         | No       | Automatically create the JSONB table if it does not exist                                  |
| `viewPrefix`       | string                         | `""`           | No       | Prefix for auto-generated SQL views                                                        |
| `views`            | string[]                       | `["regex:.*"]` | No       | Regexp list of model names to generate views for                                           |

## Relational store

`Webda/PostgresRelationalStore` stores the models you list in **typed tables** (one column per field, primary and
foreign keys, junction tables, indexes) generated from the model metadata by `@webda/sql-schema`, with the same model
API. It is never the `Registry` and only stores listed models.

```json
{
  "services": {
    "domain": {
      "type": "Webda/PostgresRelationalStore",
      "models": ["MyApp/User", "MyApp/Post", "MyApp/Comment"],
      "postgresqlServer": { "host": "localhost", "database": "myapp" },
      "schemaSync": "alter"
    }
  }
}
```

| Parameter          | Type                                        | Default    | Description                                                                                                                                                                         |
| ------------------ | ------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaSync`       | `none` \| `create` \| `alter` \| `validate` | `create`   | What `init()` does with the schema: nothing, create the missing tables, also add the missing columns / indexes / foreign keys of existing tables (never destructive), or only check |
| `columnNaming`     | `preserve` \| `snake_case`                  | `preserve` | Column names from the field names                                                                                                                                                   |
| `extraColumn`      | string \| `false`                           | `_extra`   | JSONB column of the properties the schema does not declare                                                                                                                          |
| `foreignKeys`      | boolean                                     | `true`     | Create the foreign key constraints                                                                                                                                                  |
| `numericAsDecimal` | boolean                                     | `false`    | `NUMERIC` instead of `DOUBLE PRECISION` for JSON `number`                                                                                                                           |

`webda postgres schema [--sql | --diff | --json]` prints the plan, its DDL or the differences with the database. See
[the documentation](https://webda.io/docs/Modules/postgres/PostgresRelationalStore) for the mapping, the schema
lifecycle and the limitations.

## Usage

```typescript
import { CoreModel, Model, Expose } from "@webda/core";

@Model()
export class Post extends CoreModel {
  @Expose() title: string;
  @Expose() content: string;
  @Expose() publishedAt: Date;
}

// With PostgresStore configured, the standard Webda model API is backed by Postgres:
const post = new Post();
post.title = "Hello Postgres";
await post.save(); // INSERT INTO posts ...

const found = await Post.ref(post.uuid).get(); // SELECT ... WHERE uuid = ?
const results = await Post.query("title CONTAINS 'Hello'"); // filtered query

// The table schema uses JSONB:
//   CREATE TABLE IF NOT EXISTS posts (
//     uuid TEXT PRIMARY KEY,
//     data JSONB NOT NULL
//   );
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/postgres/`.
- Source: [`packages/postgres`](https://github.com/loopingz/webda.io/tree/main/packages/postgres)
- Related: [`@webda/mongodb`](../mongodb) for a document-store alternative; [`@webda/aws`](../aws) for `DynamoStore`; [`@webda/core`](../core) for the `Store` base class.

<!-- README_FOOTER -->

## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://webda.io/img/sponsors/arize.svg" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://webda.io/img/sponsors/loopingz.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://webda.io/img/sponsors/tellae.svg" width="200">](https://tellae.fr)
