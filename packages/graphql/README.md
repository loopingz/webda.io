# @webda/graphql module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

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

- [Schema Generation](../../docs/pages/Modules/graphql/Schema-Generation.md)
- [Queries and Mutations](../../docs/pages/Modules/graphql/Queries-And-Mutations.md)
- [Subscriptions](../../docs/pages/Modules/graphql/Subscriptions.md)
- [@webda/core DomainService](../core/README.md) — base class for model-serving services

<!-- README_FOOTER -->
## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
