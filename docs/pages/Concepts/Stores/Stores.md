---
sidebar_position: 5
---

# Stores (storage backends — advanced)

:::note

`Store` is the **internal infrastructure** that owns a backend instance (a DB
connection or pool, a bucket) and produces [Repositories](./Repositories.md).
**Application code uses [Repositories](./Repositories.md)** —
`Model.create()` / `Model.ref(uuid).get()` / `Model.query()` or
`useRepository(Model)` — and never references a Store by name. This page is for
store-package authors and power-user paths. The `Store` class and
`StoreParameters` are tagged `@internal`.

:::

The store services allow you to store object in a database. Objects are mapped to a model to allow security policy and schema verification.

We have currently Memory, File, DynamoDB, MongoDB, PostgreSQL, SQLite, Firestore, CosmosDB and Kubernetes storage

## Events

Application code listens to the typed [Repository events](./Repositories.md#events) (`Created`, `Updated`, `Patched`, `Deleted`, `PartialUpdated`...) with `useRepository(Model).on(...)`. The aggregate `Store.*` events are internal.

## DynamoDB configuration

The DynamoDB stores requires at least a table, the credentials default to the AWS environment

For more information on DynamoDB : [AWS DynamoDB](https://aws.amazon.com/dynamodb/)

## MongoDB configuration

The MongoDB configuration requires a collection and a mongoUrl parameter (or the `WEBDA_MONGO_URL` environment variable) where mongoUrl is the MongoDB url

## FileDB configuration

The FileDB only requires a folder where to store the datas. It creates it if not exists

## See also

- [Core Stores](../../Modules/core/Stores.md)
- [fs store](../../Modules/fs/README.md)
- [mongodb store](../../Modules/mongodb/README.md)
- [postgres store](../../Modules/postgres/README.md)
- [aws (DynamoStore)](../../Modules/aws/README.md)
