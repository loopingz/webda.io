# Build your application

Turn your domain into a working Webda application: define models, add services, expose interfaces,
and configure security.

| Section                             | What you build                                                  |
| ----------------------------------- | --------------------------------------------------------------- |
| [Model](./Model.md)                 | Data structures, relationships, domain actions, and permissions |
| [Service](./Service.md)             | Integrations, shared capabilities, and orchestration            |
| [Expose](../Expose/index.md)        | REST, GraphQL, MCP, CLI, and gRPC interfaces                    |
| [Security](../Security/Security.md) | Authentication, request protection, and secret handling         |

## Start with the domain

Describe the entities and rules your application owns. Use models for entity behavior and reusable behaviors
for capabilities shared by several models. Use services for work that coordinates models or integrates external systems.

If these concepts are new, start with [Learn → Concepts](../Concepts/Concepts.md),
[My First Model](../QuickStart/FirstModel.md), or [My First Service](../QuickStart/FirstService.md).

## Compile, then verify

Run the application's build script after changing its models or services. `webdac build` produces the metadata
and schemas consumed at runtime; see the [compiler build guide](../Modules/compiler/Build.md).

Then [run](../Run/index.md) the application and [test](../Testing.md) its behavior.
Choose a [deployment target](../Deployments/Deployments.md) when it is ready to ship.
