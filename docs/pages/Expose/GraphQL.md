# GraphQL

Use GraphQL when clients need to select fields, traverse model relationships, or subscribe to changes.
`@webda/graphql` generates its schema from the Webda model metadata and exposes queries, mutations, and subscriptions.

## Enable GraphQL

Install `@webda/graphql` and configure `Webda/GraphQLService` with your endpoint URL.
Follow the [module setup](../Modules/graphql/README.md) for the configuration and GraphiQL options.

## Shape the API

- [Schema generation](../Modules/graphql/Schema-Generation.md) explains how model metadata becomes GraphQL types.
- [Queries and mutations](../Modules/graphql/Queries-And-Mutations.md) covers reading and changing data.
- [Subscriptions](../Modules/graphql/Subscriptions.md) covers live updates.

For a complete example, follow the [blog GraphQL tutorial](../QuickStart/Tutorial-BlogSystem/09-GraphQL.md).
