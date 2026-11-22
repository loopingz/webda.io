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
- **ModelLinksSimpleArray**: Define a n:1 or n:m link from current model (the ids are defined within an array)
- **ModelLinksArray**: Define a n:1 or n:m link from current model (an array of objects containing the id of the target and additional properties)
- **ModelRelated**: Define a subcollection accessible via query
- **ModelsMapped**: Define a collection that is synchronized by `ModelMapper`

These relations will be compiled with additional behavior.
Getter/setter will be added for you at compile time, the source code would also be updated by the build.

The graph of model is deduced from your models and stored in the `Relations` of each model metadata in `webda.module.json`:

```
"Relations": {
    "parent": {
        "attribute": "",
        "model": ""
    },
    "links": [
        {
            "type": "LINK",
            "attribute": "category",
            "model": "modelC"
        }, {
            "type": "LINKS_ARRAY",
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
```

You can now access directly from your model class:

CoreModel.ref(uuid).get() -> useRepository(CoreModel).ref(uuid).get()
CoreModel.query() -> useRepository(CoreModel).query()
CoreModel.ref(uuid).patch()
CoreModel.ref(uuid).delete()

The Store listing the model (or its closest ancestor) in its `models` serves it, otherwise the `Registry` does

Store(strict): Only handle its model
Store(no-strict): Handle any declared models and their child classes
