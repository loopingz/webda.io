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

### See also

- [Schema Generation](_media/Schema-Generation.md)
- [Queries and Mutations](_media/Queries-And-Mutations.md)
- [Subscriptions](_media/Subscriptions.md)
- [@webda/core DomainService](_media/README.md) — base class for model-serving services
