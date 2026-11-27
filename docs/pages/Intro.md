# Webda

Build TypeScript applications around your domain models. Webda provides services, storage integrations, authentication, and transports such as REST, GraphQL, and gRPC.

## Choose your path

| I want to…                       | Start here                                                              |
| -------------------------------- | ----------------------------------------------------------------------- |
| Run my first application         | [Quick Start](./QuickStart/QuickStart.mdx)                               |
| Learn through a complete example | [Blog System Tutorial](./QuickStart/Tutorial-BlogSystem/00-Overview.md) |
| Understand the architecture      | [Core concepts](./Concepts/Concepts.md)                                 |
| Add application behavior         | [My First Service](./QuickStart/FirstService.md)                        |
| Configure Kubernetes             | [ConfigMaps and Secrets](./Deployments/Kubernetes/ConfigMap.md)         |
| Find a term                      | [Glossary](./Glossary.md)                                               |

## Four building blocks

- **Application:** configuration and the components that run together.
- **Model:** data, permissions, and behavior for a domain entity.
- **Service:** integrations and behavior that spans models.
- **Operation:** an action exposed through a configured transport.

:::tip Start with a model
Keep business behavior close to the data it acts on. Add services for integrations and work that does not belong to one model.
:::
