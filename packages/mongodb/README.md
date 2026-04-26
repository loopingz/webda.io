# @webda/mongo module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/mongodb

> MongoDB-backed Store for Webda — persists any model to MongoDB using the JSONB document model, with full query, pagination, and update-condition support.

## When to use it

- You want a flexible document store for Webda models without a fixed schema (MongoDB's schema-less documents match Webda's JSON models naturally).
- You are deploying on infrastructure that already runs MongoDB (Atlas, self-hosted, DocumentDB).
- You need free-text indexes, geospatial queries, or aggregation pipelines alongside your Webda models.

## Install

```bash
pnpm add @webda/mongodb
```

## Configuration

```json
{
  "services": {
    "userStore": {
      "type": "MongoStore",
      "model": "MyApp/User",
      "collection": "users",
      "database": "my-app"
    }
  }
}
```

Set the connection URL via the `WEBDA_MONGO_URL` environment variable (recommended) or inline:

```json
{
  "services": {
    "userStore": {
      "type": "MongoStore",
      "mongoUrl": "mongodb+srv://user:pass@cluster.mongodb.net",
      "collection": "users",
      "database": "my-app"
    }
  }
}
```

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `mongoUrl` | string | `$WEBDA_MONGO_URL` | Yes | MongoDB connection string (falls back to `WEBDA_MONGO_URL` env variable) |
| `collection` | string | — | Yes | MongoDB collection name to store model documents in |
| `database` | string | — | No | MongoDB database name (uses default from connection string if omitted) |
| `options` | object | `{}` | No | Additional `MongoClientOptions` passed to the driver |
| `databaseOptions` | object | — | No | `DbOptions` passed to `client.db()` |

## Usage

```typescript
import { CoreModel, Model, Expose } from "@webda/core";
import { Bean, Inject } from "@webda/core";
import { Store } from "@webda/core";

@Model()
export class User extends CoreModel {
  @Expose() name: string;
  @Expose() email: string;
}

// With MongoStore configured, all CoreModel CRUD is automatically backed by MongoDB:
const user = new User();
user.name = "Alice";
user.email = "alice@example.com";
await user.save();                          // inserts into MongoDB

const found = await User.ref(user.uuid).get();   // fetch by UUID
const results = await User.query("name = 'Alice'"); // filtered query
await user.patch({ name: "Alice Smith" });        // partial update
await user.delete();                              // hard delete
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/mongodb/`.
- Source: [`packages/mongodb`](https://github.com/loopingz/webda.io/tree/main/packages/mongodb)
- Related: [`@webda/postgres`](../postgres) for a SQL-backed alternative; [`@webda/aws`](../aws) for `DynamoStore`; [`@webda/core`](../core) for the `Store` base class and model CRUD API.

<!-- README_FOOTER -->
## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
