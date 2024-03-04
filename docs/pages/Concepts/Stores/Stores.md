---
sidebar_position: 4
---

# Stores

The store services allow you to store object in a database it handles for you mapping between objects. Objects are mapped to a model to allow security policy and schema verification.

Available stores are:

- MemoryStore
- FileStore
- [DynamoDB](./DynamoDB.md)
- [MongoDB](./MongoDB.md)
- [PostgresStore](./PostgresStore.md)

Stores are managing one or several models.

Example of a Store managing the model `MyModel`

```mermaid

```

The configuration would look like

```javascript title="webda.config.json"
{
  ...
  "stores": {
    "mystore": {
      "model": "mymodel",
    }
  }
  ...
}
```

:::warning

If you run several instances of your application, you should have a pub/sub to notify the other instances of the changes or disable cache by setting `disableCache` to `true`

:::

## Validation

To ensure that the input is correct, you can setup a JSON schema this way any update or creation will verify that the object is correct.

```javascript
{
  ...
  "validator": "schema"
  ...
}
```

All the input of POST or PUT will then be validate against it.

## DynamoDB configuration

The DynamoDB stores requires at least accessKeyId, secretAccessKey and table

For more information on DynamoDB : [AWS DynamoDB](https://aws.amazon.com/dynamodb/)

## MongoDB configuration

The MongoDB configuration requires a collection and a mongo parameter where mongo is the MongoDB url

## FileDB configuration

The FileDB only requires a folder where to store the datas. It creates it if not exists

## Model Actions

When defining a model for a store, you can define action on the model, it will be by default a new endpoint

For non-global action, they apply to an object

```
/store/{uuid}/{actionName}
```

If the action is global

```
/store/{actionName}
```
