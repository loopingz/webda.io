---
sidebar_position: 3
---

# Models

The models define your business objects.

They are stored within a `Store`.

They are exposed through an `Expose` annotation. Implemented by `DomainService` like `RESTDomainService` or `GraphQLDomainService`.

They are close to a `POJO` but when attached to a Store, they are not truely POJO, similar to Hibernate.

They also define the relations between different models.

## PrimaryKey, UID and UUID

To allow all options, we are defining the 3 concepts

### PrimaryKey

It can be one field or a composite of several fields.

It is defined with the [WEBDA_PRIMARY_KEY]

```
class User {
  email: string;
  [WEBDA_PRIMARY_KEY] = ["email"] as const;
}
```

```
class ComposedModel {
  id: string;
  timestamp: number;
  [WEBDA_PRIMARY_KEY] = ["id", "timestamp"] as const;
}
```

### UID

The UID is the concatenation of the PrimaryKey with a defined Separator. It is used by the REST API.

- `user@webda.io` would be a UID for our `User` model
- `myid_19082934343` would be a UID for our `ComposedModel`

### UUID

The UUID is a application unique identifier, it contains the model name plus the UID.
`User$user@webda.io` could be a UUID for our `User` model and `ComposedModel$myid_19082934343` for our composed model

You can use our method:

```
async getModelFromUUID(uuid: string)
```

## Attributes

Every attribute starting with a `_` is not modifiable by the HTTP APIs.
If an attribte starts with a double underscore `__`, the attribute will be strip from any HTTP output, this is useful to store
passwords or others server-only attributes.

Another type of readonly attributes is the defined maps.

## Actions

By default if exposed via a `REST` the endpoint to manipulate models are following REST API

```
GET /models/{uuid}       - Retrieve a model
POST /models             - Create a new model
DELETE /models/{uuid}    - Delete a model
PUT /models/{uuid}       - Update a model
PATCH /models/{uuid}     - Patch a model
```

You can define your action by returning a map of `ModelAction` with the `@Action` annotation in front of your method, you control the access to the action by adding the right control within the `canAct` method, by default the action is denied.
Action are using the method `PUT` by default.

```js title="src/mymodel.ts"
class MyModel extends Model {
  @Action()
  export(context: Context) {
    ctx.write("My export");
  }

  canAct(ctx: Context, action: string) {
    if (action === "export") {
      return this;
    }
    return super.canAct(ctx, action);
  }
}
```

## Model schemas

The schema is generated with [ts-json-schema-generator](https://github.com/vega/ts-json-schema-generator)

All servers properties: starting with a `_` will be ignored in the schema generation

### JSDocs Annotation

```
@nullable: allow the attribute to be null
@asType: to override the default type
@example: to show an value example
@minimum: define the minimum value (>=)
@exclusiveMinimum: define the minimum value (>)
@maximum: define the maximum value (<=)
@exclusiveMaximum: define the maximum value (<)
@multipleOf:
@minLength:
@maxLength:
@minProperties:
@maxProperties:
@minItems:
@maxItems:
@uniqueItems:
@propertyNames:
@contains:
@const:
@examples:
@default:
@if:
@then:
@else:
@readOnly:
@writeOnly:
@deprecated:
@title:
@description:
@id:
@format:
@pattern:
@ref:
@comment:
@contentMediaType:
@contentEncoding:
```

Additional needed:

```
@SchemaAdditionalProperties: add a additionalProperties section (useful to avoid wildcarding the server types)
@SchemaIgnore: ignore this property from the schema generation (readOnly is probably a better solution)
```

## Relations

A `Model` represent one type of object within your application, it can be linked to other type of object.

```
1-n: lazy collection   ModelLink <-> ModelLinked
n-m: is not currently handled as several NoSQL databases won't be able to query
denormalized(1-n): denormalized collection ModelLink <-> ModelMap
denormalized(n-m): denormalized collection ModelNLink <-> ModelMap
```

```
ModelMapped: 1:1 mapper
ModelsMapped: 1:n mapper

ModelLinksSimpleArray: n:m relation, can be source of a Mapper, it is an array of uuid of the targeted model
ModelLinksArray: n:m relation, can be source of a Mapper, it is an array of object containing the uuid of the targeted model and some additional data
ModelLinksMap: n:m relation, can be source of a Mapper, it is a map of uuid of the targeted model to some attributes.

ModelLink: 1:n relation, can be source of a Mapper too, this is normally a Foreign Key within a Relational DataBase
ModelParent: used to defined a hierarchy between model, it is a 'special' `ModelLink`

ModelRelated<T>: In a SQL server, it would be querying on the Foreign Key of the table managing the model T
```

Denormalized are managed through a Mapper service that keeps in sync the mapper.

### Mapper

A mapper is a `PartialModel<CoreModel>` that represent a target object.

Relations are resolved at compile time.

### Domain service

The domain service is the service that based on the resolved relationship can automate the creation of the different stores and mapper.

It can also expose the GraphQL API

## CRUD

```
class MyModel extends CoreModel {}

// Create
MyModel.create({...}); // A factory concept exists to allow auto subclassing
// Get
MyModel.get(uuid);
// Get or create
MyModel.get(uuid, {...});
// Patch
MyModel.ref(uuid).patch({...});
// Patch or create
MyModel.ref(uuid).upsert({...});
// Query
MyModel.query();
// Iterate on a query
for await (let model of MyModel.iterate("")) {

}
// For each object
MyModel.forEach(() => {

}, "Query", 3)
// Delete
MyModel.delete(uuid);

// On the instance itself you have
const model = await MyModel.create({...});
model.delete();
model.save();
model.refresh();
// Load data into the object
model.load(...)
// To see
model.setAttribute();
model.incrementAttributes();
model.incrementAttribute();
model.removeAttribute();
model.upsert...
```

## Methods

`toJSON` method is used to serialize the object to JSON.
`toDTO` method is used to serialize the object for external usage
`toProxy` method is used to proxy the object, allowing to have a secure behavior based on context
`deserialize` method is used to deserialize the object from JSON, it is used by the `load` method and autocompleted by the webda compiler.
`fromDTO` method is used to deserialize the object for external usage
