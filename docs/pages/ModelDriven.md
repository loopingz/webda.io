## Definitions

- Ancestor:

An Ancestor is a Model that is part of the class hierarchy of another model

```
class ClassA extends CoreModel {}
class ClassB extends ClassA {}
class ClassC extends ClassA {}
```

In this example `ClassA` is an ancestor of `ClassB` and `ClassC`, and `CoreModel` is a common ancestor to all. `ClassB` is **NOT** an ancestor of `ClassC`

- Parent

A parent is defined in the class relationship. It is not linked to any of the class hierarchy.

- Store

This is the service that is in-charge of persisting the models somewhere (NoSQL, File, Memory)

Define your model we can:

- create models diagram with entity relationship
- define how it is stored
- define the schema or schemas
- define graphql access

Model have UUID accross the whole framework

- MODEL-UUID

Model define:

- attributes
- methods
- links

CoreModel will always have a Store, default is the Registry.

The relationships between models can be:

- **ModelParent**: Define the parent of current model
- **ModelLink**: Define a 1:1 or 1:n link from current model
- **ModelArrayLinks**: Define a n:1 or n:m link from current model (the ids are defined within an array)
- **ModelMapLinks**: Define a n:1 or n:m link from current model (the ids are the map key, and value is usually a subset of target object with or without additional properties)
- **ModelLinked**: Define a subcollection accessible via query
- **ModelMapped**: Define a collection that is synchronized by `ModelMapper`

These relations will be compiled with additional behavior.
Getter/setter will be added for you at compile time, the source code would also be updated by the build.

- We understand modifying source at build might sound weird, but we need to define the setter for you, to give the best experience, you can disable this behavior by adding a `noEmitModelRelationSetter: true`

The graph of model is deduced from your models:

```
"models": {

},
"modelsGraph": {
    "modelA": {
        "extends": [],
        "parent": {
            "attribute": "",
            "model": ""
        },
        "links": [
            {
                "type": "link",
                "attribute": "category",
                "model": "modelC"
            }, {
                "type": "arraylinks",
                "attribute": "category",
                "model": "modelC"
            }, {
                "type": "maplinks",
                "attribute": "category",
                "model": "modelC"
            }
        ],
        "maps": [],
        "queries": [
            {
                "attribute": "comments",
                "model": "modelC"
            }
        ]
    }
}
```

You can now access directly from your model class:

CoreModel.ref().get() -> CoreModel.store().get()
CoreModel.query() -> CoreModel.store().query()
CoreModel.ref().patch()
CoreModel.ref().delete()

A `StoreResolver` should match from a class the Store

Store(strict): Only handle its model
Store(no-strict): Handle any declared models and their child classes
Store(wildcard): Catch all the model that are not managed by any store
