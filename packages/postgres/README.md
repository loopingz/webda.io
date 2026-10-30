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

| Parameter              | Type                           | Default            | Required | Description                                                                                |
| ---------------------- | ------------------------------ | ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `postgresqlServer`     | `ClientConfig` \| `PoolConfig` | libpq env vars     | No       | PostgreSQL connection config (host, port, database, user, password)                        |
| `usePool`              | boolean                        | `false`            | No       | Use a connection pool (`pg.Pool`) instead of a single client, required by `transaction`    |
| `table`                | string                         | —                  | No       | Table of every model of the store (subclasses and fallback models included), as in Webda 3 |
| `tables`               | object                         | `{}`               | No       | Per-model table overrides: `{ "MyApp/Model": "my_table" }`                                 |
| `autoCreateTable`      | boolean                        | `true`             | No       | Automatically create the JSONB table if it does not exist                                  |
| `viewPrefix`           | string                         | `""`               | No       | Prefix for auto-generated SQL views                                                        |
| `views`                | string[]                       | `["regex:.*"]`     | No       | Regexp list of model names to generate views for                                           |
| `transaction`          | `"none"` \| `"operation"`      | `"none"`           | No       | One transaction per operation, see [Transactions](#transactions)                           |
| `transactionIsolation` | string                         | `"READ COMMITTED"` | No       | Isolation level of the transactions                                                        |

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

## Transactions

With `"transaction": "operation"`, every statement of an operation runs in **one PostgreSQL transaction**: committed
when the operation succeeds, rolled back when it throws. An operation writing several objects (a `create`, the
`patch` of a parent, a counter increment) never leaves them half-written.

```json
{
  "services": {
    "postStore": {
      "type": "PostgresStore",
      "usePool": true,
      "transaction": "operation",
      "transactionIsolation": "READ COMMITTED"
    }
  }
}
```

| Parameter              | Type                                                          | Default            | Description                                                                                           |
| ---------------------- | ------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `transaction`          | `"none"` \| `"operation"`                                     | `"none"`           | `"none"`: autocommit per statement (unchanged behavior). `"operation"`: one transaction per operation |
| `transactionIsolation` | `"READ COMMITTED"` \| `"REPEATABLE READ"` \| `"SERIALIZABLE"` | `"READ COMMITTED"` | Isolation level of `BEGIN`                                                                            |

- **A pool is required**: a transaction needs a connection of its own. `"transaction": "operation"` with
  `"usePool": false` fails at `init()` with the `POSTGRES_TRANSACTION_REQUIRES_POOL` error.
- **Lazy**: the store takes part in every operation, but checks a connection out of the pool (and runs `BEGIN`) only
  on the first statement. An operation that never uses the store costs nothing.
- **Lifecycle**: `COMMIT` runs once the method resolved (a streamed result fully written) and before
  `Webda.OperationSuccess`; `ROLLBACK` runs before `Webda.OperationFailure`. The connection is always released; a
  connection whose `COMMIT` or `ROLLBACK` failed is destroyed rather than given back to the pool. See the
  [operation lifecycle](https://docs.webda.io/pages/Concepts/Operations#operation-lifecycle-and-transactions).
- **Scope**: the transaction follows the async call chain of the operation: code running under `runAsSystem` or in a
  nested `callOperation` takes part in it (nested operations join the outermost one, no savepoints). Code outside
  the operation (another request, a queue worker) does not see the uncommitted writes.
- **A failed statement aborts the transaction** (PostgreSQL refuses any further statement): the next statements and
  the commit fail with `SQL_TRANSACTION_ABORTED`, even when the operation caught the first error.
- **Opting out**: `@Operation({ transaction: false })` keeps an operation in autocommit, e.g. a long streaming read
  that should not hold a connection for its whole duration.
- **Outside operations** (CLI, queue workers, tests): `store.withTransaction(async () => { ... })` commits when the
  function resolves and rolls back when it throws, or joins the current transaction. It works whatever `transaction`
  is set to.
- Table creation (`autoCreateTable`) and `createViews()` always run on the pool, never in a transaction.
- Concurrent statements of one operation (`Promise.all`) are safe: they are queued on its connection.
- **Not atomic across stores**: each store commits on its own, in registration order; when the commit of a second
  store fails after the first one committed, the first one stays committed.
- **Events before commit**: repository events (`Created`, `Updated`...) are emitted when the statement runs, before
  the commit: a listener may see data that is later rolled back.

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
