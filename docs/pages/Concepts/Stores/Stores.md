---
sidebar_position: 4
---

# Stores

The store services allow you to store object in a NoSQL database it handles for you mapping between objects. Objects are mapped to a model to allow security policy and schema verification.

We have currently File, DynamoDB and MongoDB storage

:::warning

If you run several instances of your application, you should have a pub/sub to notify the other instances of the changes or disable cache by setting `disableCache` to `true`

:::

## Expose REST API

Inside the configuration you can add a block for expose the store as a REST API

```js title="webda.config.json"
{
  ...
  "expose": {
     "url": "/storeurl", // By default the URL is the store name in lower case
     "restrict": {
       "update": true, // Prevent the creation of an object the PUT method wont be exposed
       "delete": false // Allow delete for the object
     }
  }
  ...
}
```

The above configuration will end up creating the following routes:

- `POST /storeurl`
- `GET /storeurl/{uuid}`
- `DELETE /storeurl/{uuid}`

You can see that by default, once the store exposed all the methods are available unless you restrict them.

## Configuring Mapping

As an example we will use the Users / Idents stores used by the Authentication module.

A User has several Idents so in NoSQL we need to deduplicate a part of the Ident object inside an array inside the User object

The following is the Idents store configuration

```js title="webda.config.json"
{
  ...
  "map": {
     "Users": { // Target store
        "key": "user", // Property inside Ident Object
        "target": "idents", // Property on the User Object
        "fields": "type", // Fields from the Ident Object ( uuid is added by default )
        "cascade": true // If User object is delete then delete all the linked Idents
     }
  }
```

So if you have a user like

```javascript
{
  ...
  "uuid": "user_01"
}
```

Then you save a new Ident object like

```javascript
{
  ...
  "uuid": "ident_01",
  "user": "user_01",
  "type": "Google"
}
```

Once the Ident saved, the User object will look like

```javascript
{
  ...
  "uuid": "user_01",
  "idents": [{"uuid":"ident_01","type":"Google"}]
  ...
}
```

Then if you update the field type on your Ident object the User object will reflect the change, as well as if you delete the ident object it will be removed from the User object.

If cascade = true, then if you delete the User object, all attached Idents will be delete aswell.

## Events

The Stores emit events to let you implement some auto completion of the object if needed or taking any others action even deny the action by throwing an exception

The store event looks like

```javascript
{
  'object': object,
  'store': this
}
```

Store.Save: Before saving the object
Store.Saved: After saving the object
Store.Update: Before updating the object
Store.Updated: After updating the object
Store.Delete: Before deleting the object
Store.Deleted: After deleting the object
Store.Get: When getting the object

### Owner Policy

POST: Add the current user in the user field of the object
PUT: Verify the current user is the user inside the user field
GET: Verify the current user is the user inside the user field, or a public=true field exists on the object
DELETE: Verify the current user is the user inside the user field

### Void policy

No verification, not recommended at all

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
