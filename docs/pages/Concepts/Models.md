# Models

The models define your business objects.
They are stored and exposed through API by Stores.

They are close to a `POJO` but when attached to a Store, they are not truely POJO, similar to Hibernate.

Their schema is build with the `webda build` command.

The `toJSON` method filters the attached store and context.

## Attributes

Every attribute starting with a `_` is not modifiable by the HTTP APIs.
If an attribte starts with a double underscore `__`, the attribute will be strip from any HTTP output, this is useful to store 
passwords or others server-only attributes.

Another type of readonly attributes is the defined maps.

## Actions

By default if exposed via a `Store` the endpoint to manipulate models are following REST API

```
GET /models/{uuid}       - Retrieve a model
POST /models             - Create a new model
DELETE /models/{uuid}    - Delete a model
PUT /models/{uuid}       - Update a model
PATCH /models/{uuid}     - Patch a model
```

You can define your action by returning a map of `ModelAction` with the `getActions` method, you control the access to the action by adding the right control within the `canAct` method, by default the action is denied

```
class MyModel extends CoreModel {
	static getActions(): { [key: string]: ModelAction } {
    return {
      ...super.getActions(),
      export: {
        methods: ["GET"],
        global: false
      }
    };
  }

  _export(context: Context) {
  	ctx.write("My export");
  }

  canAct(ctx: Context, action: string) {
  	if (action === "export") {
  		return this;
  	}
  	return super.canAct(ctx,action);
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