# Build a model

A model describes an entity's data and behavior. Start with its identity and fields, then add relationships,
actions, and access rules.

## Define identity and fields

Follow [Defining Models](../Modules/models/Defining-Models.md) to choose a base class, declare a primary key,
and describe fields and validation. For a first walkthrough, use [My First Model](../QuickStart/FirstModel.md).

## Connect models

Use [Relationships](../Modules/models/Relationships.md) for references, collections, and join models.
Choose the relationship that represents your domain before deciding how a client will navigate it.

## Implement behavior and permissions

Put entity-specific operations in [actions](../Modules/models/Actions.md), and define who can execute them with
[permissions](../Modules/models/Permissions.md). Share capabilities between model classes using
[behaviors](../Concepts/Models/Behaviors.md).

## Handle persistence and lifecycle

The [model lifecycle](../Modules/models/Lifecycle.md) explains hooks around creation, updates, and deletion.
[Repositories](../Concepts/Stores/Repositories.md) connect models to storage implementations.

## Expose and test the model

Choose the [interfaces](../Expose/index.md) your clients need, then [test](../Testing.md) both domain behavior
and permissions. The [blog tutorial](../QuickStart/Tutorial-BlogSystem/00-Overview.md) combines these steps
in a complete application.
