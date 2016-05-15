# Store

The store services allow you to store object in a NoSQL database it handles for you mapping between objects, have a security policy and check the object with JSON Schema

We have currently File, DynamoDB and MongoDB storage

## Expose REST API

Inside the configuration you can add a block for expose the store as a REST API

````javascript
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

POST /storeurl
GET /storeurl/{uuid}
DELETE /storeurl/{uuid}

You can see that by default, once the store exposed all the methods are available unless you restrict them.

## Configuring Mapping

As an example we will use the Users / Idents stores used by the Authentication module.

A User has several Idents so in NoSQL we need to deduplicate a part of the Ident object inside an array inside the User object

The following is the Idents store configuration
```javascript
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

## Security Policy

The security policy will be called on any REST API called from the Store, the internal method to access the objects are not secured with it yet, we might later on add this feature.
The security policy could also be implemented by a Service that listen on Store event this way you can enforce the security even internally

```javascript
{
  ...
  "security": "OwnerPolicy" // This is the default SecurityPolicy
  ...
}

If not specified the Store will pick the Owner policy as default.
Policies are implicit service, so you can get them with a getService("OwnerPolicy"), but don't appear by default in the configuration file. That also means you can override a Policy if you want or create your own to implement your business model

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

## Polymer

You have a behovior defined for you, once added to your component you have the model property and a save/get/update/delete method for you to communicate with the API
