---
sidebar_label: "@webda/graphql"
---
# graphql

## @webda/graphql

Auto-generates a fully functional GraphQL API — queries, mutations, **and subscriptions** — from your Webda domain models. Zero hand-written SDL required.

### When to use it

Add `@webda/graphql` when you want a GraphQL endpoint alongside (or instead of) the REST endpoint. It reads your model graph from `@webda/compiler`'s model manifest and builds the GraphQL schema dynamically. Subscriptions over WebSocket (`graphql-ws`) are enabled by default.

### Install

```bash
npm install @webda/graphql
```

### Configuration

Add the `GraphQLService` to your `webda.config.json`:

```json
{
  "services": {
    "GraphQLService": {
      "type": "Webda/GraphQLService",
      "url": "/graphql",
      "exposeGraphiQL": true,
      "globalSubscription": true
    }
  }
}
```

### Auto-generated operations

For every exposed model (e.g. `Post`) the service generates:

| Operation | Type | Description |
|-----------|------|-------------|
| `Post(uuid)` | Query | Fetch one by primary key |
| `Posts(query, limit, offset)` | Query | List / filter all |
| `createPost(Post: PostInput)` | Mutation | Create new instance |
| `updatePost(uuid, Post: PostInput)` | Mutation | Replace by primary key |
| `deletePost(uuid)` | Mutation | Delete by primary key |
| `PostEvents` | Subscription | Stream events for all posts |
| `PostEvent(uuid)` | Subscription | Stream events for a specific post |

Custom `@Operation()` methods on the model become additional mutations or queries automatically.

### Quick usage

```graphql
# Query all published posts
{ Posts { results { slug title status viewCount } } }

# Create a post
mutation {
  createPost(Post: {
    title: "Hello World"
    slug: "hello-world"
    content: "My first post content with enough text."
    status: "draft"
    viewCount: 0
  }) {
    slug
    title
  }
}
```

### Subscriptions (graphql-ws)

```graphql
subscription {
  PostEvents {
    Created { object { slug title } }
    Updated { object { slug title } }
    Deleted { object_id }
  }
}
```

The subscription server uses `graphql-ws` over WebSocket (same port as the HTTP server when TLS is enabled via `autoTls`).

### Model mutations are the model operations

`create<Model>`, `update<Model>` and `delete<Model>` call the operation a `DomainService` registers for the model (`<Model>.Create`, `.Update`, `.Delete`), the one REST, gRPC and MCP call. So a mutation gets the same permission checks in the same order, the same sanitization, the same validation against the model schema (`@pattern`, `@minLength`, `@maximum`, `@format`, enums...), the same events (the audit log sees it) and the same transaction. A refused input is a `BAD_USER_INPUT` error whose message is the REST one and whose `extensions.details.errors` holds the validation errors:

```json
{
  "message": "Product.Create InvalidInput: /name must match pattern \"^[A-Z][A-Za-z &]*$\"",
  "extensions": { "code": "BAD_USER_INPUT", "details": { "errors": [{ "instancePath": "/name", "keyword": "pattern" }] } }
}
```

A model no `DomainService` exposes has no such operation: its mutations are applied by the GraphQL service, with the same sanitization and the same schema validation, but without the operation events.

### Input sanitization

The request is not sanitized as a whole: every **argument** is, once GraphQL has read it, so a value sent as a variable and the same value written in the document are treated the same way, over HTTP and over WebSocket.

| Argument | Sanitized |
| --- | --- |
| The input of a model mutation (`createPost(Post: ...)`, `updatePost`) | With the `@sanitize` modes of the model, like the body of the same REST operation: an attribute stores the same value on every transport |
| The arguments of an operation (service operations, model and behavior actions, subscriptions on a streamed operation) | From the operation input schema, like the body of the same REST operation |
| Anything else: keys (`uuid`), WebdaQL `query` and `filter` arguments, the arguments of a field another service adds | As text: tags removed, `&`, `<`, `>` escaped. In a WebdaQL query `<` and `>` are restored afterwards, so comparisons work |

The keys that reach a prototype (`__proto__`, `constructor`, `prototype`) are removed from every argument. A field added through the `Webda.GraphQL.Schema` event gets the same treatment without doing anything: no argument reaches a resolver unsanitized. A resolver that must sanitize an argument itself names it in the field `extensions` (`webdaRawArgs: ["name"]`).

The endpoint executes documents sent by `POST` (one per request, no batching) and over the WebSocket protocol; a `GET` only serves GraphiQL.

### GraphiQL

Set `exposeGraphiQL: true` (the default) to enable the in-browser GraphiQL IDE at `/graphql`. Useful for development and introspection.

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `url` | `/graphql` | HTTP endpoint path |
| `exposeGraphiQL` | `true` | Serve the GraphiQL explorer UI |
| `exposeMe` | `true` | Expose `{ me { ... } }` query for current user |
| `globalSubscription` | `true` | Expose aggregate `AggregateSubscriptions` subscription |
| `userModel` | `User` | Short name of the User model for `me` query |
| `exposeOperations` | `["*"]` | Operations exposed as Query, Mutation or Subscription fields (`!` excludes). `[]` exposes none |

### See also

- [Schema Generation](_media/Schema-Generation.md)
- [Queries and Mutations](_media/Queries-And-Mutations.md)
- [Subscriptions](_media/Subscriptions.md)
- [@webda/core DomainService](_media/README.md) — base class for model-serving services
