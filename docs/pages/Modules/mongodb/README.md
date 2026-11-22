---
sidebar_label: "@webda/mongodb"
---
# mongodb

> MongoDB-backed Store for Webda — persists any model to MongoDB using the JSONB document model, with full query, pagination, and update-condition support.

## When to use it

- You want a flexible document store for Webda models without a fixed schema (MongoDB's schema-less documents match Webda's JSON models naturally).
- You are deploying on infrastructure that already runs MongoDB (Atlas, self-hosted, DocumentDB).
- You need free-text indexes, geospatial queries, or aggregation pipelines alongside your Webda models.

## Install

```bash
pnpm add @webda/mongo
```

## Configuration

```json
{
  "services": {
    "userStore": {
      "type": "Webda/MongoStore",
      "models": ["MyApp/User"],
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
      "type": "Webda/MongoStore",
      "models": ["MyApp/User"],
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
import { CoreModel } from "@webda/core";

export class User extends CoreModel {
  name: string;
  email: string;
}

// With MongoStore configured, all CoreModel CRUD is automatically backed by MongoDB:
const user = await User.create({ name: "Alice", email: "alice@example.com" }); // inserts into MongoDB

const found = await User.ref(user.uuid).get();   // fetch by UUID
const results = await User.query("name = 'Alice'"); // filtered query
await user.patch({ name: "Alice Smith" });        // partial update
await user.delete();                              // hard delete
```

## Reference

- Source: [`packages/mongodb`](https://github.com/loopingz/webda.io/tree/main/packages/mongodb)
- Related: [`@webda/postgres`](../postgres/README.md) for a SQL-backed alternative; [`@webda/aws`](../aws/README.md) for `DynamoStore`; [Stores](../core/Stores.md) for the store configuration and the model CRUD API.
