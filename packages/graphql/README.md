# @webda/graphql module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@webda/graphql)](https://www.npmjs.com/package/@webda/graphql)

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
| `Posts(query)` | Query | List / filter with a WebdaQL query (`LIMIT`, `OFFSET` included) |
| `createPost(Post: PostInput)` | Mutation | Create new instance |
| `updatePost(uuid, Post: PostInput)` | Mutation | Replace by primary key |
| `deletePost(uuid)` | Mutation | Delete by primary key |
| `PostsEvents` | Subscription | Stream events for all posts |
| `PostEvents(slug)` | Subscription | Stream events for a specific post (takes the primary key) |

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
  PostsEvents {
    Created
    Updated
    Deleted
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
| WebdaQL `query` and `filter` arguments | Not sanitized: the query is parsed, and its string literals are sanitized per attribute, like on the other transports (see the model documentation, Text sanitization, Queries) |
| Anything else: keys (`uuid`), the arguments of a field another service adds | As text: tags removed, `&`, `<`, `>` escaped |

The keys that reach a prototype (`__proto__`, `constructor`, `prototype`) are removed from every argument. A field added through the `Webda.GraphQL.Schema` event gets the same treatment without doing anything: no argument reaches a resolver unsanitized. A resolver that must sanitize an argument itself names it in the field `extensions` (`webdaRawArgs: ["name"]`).

The endpoint executes documents sent by `POST` (one per request, no batching) and over the WebSocket protocol; a `GET` only serves GraphiQL.

### GraphiQL

`exposeGraphiQL` defaults to `useCore().isDebug()` (`true` in debug mode, `false` otherwise). Set `exposeGraphiQL: true` to always enable the in-browser GraphiQL IDE at `/graphql` for development and introspection.

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `url` | `/graphql` | HTTP endpoint path |
| `exposeGraphiQL` | `useCore().isDebug()` | Serve the GraphiQL explorer UI |
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

[<img src="https://webda.io/img/sponsors/arize.svg" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://webda.io/img/sponsors/loopingz.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://webda.io/img/sponsors/tellae.svg" width="200">](https://tellae.fr)
