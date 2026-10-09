---
sidebar_position: 9
sidebar_label: "09 — GraphQL"
---

# 09 — GraphQL

**Goal:** Add `@webda/graphql`, configure the `GraphQLService`, and query the blog domain with GraphQL.

**Files touched:** `package.json` (add `@webda/graphql`), `webda.config.json` (add `GraphQLService`).

**Concepts:** schema generated from the models, query and mutation naming, the same permissions as REST.

## Walkthrough

### 1. Install `@webda/graphql`

```bash
npm install @webda/graphql
```

### 2. Add the `GraphQLService` to `webda.config.json`

```json title="webda.config.json (services excerpt)"
{
  "services": {
    "GraphQLService": {
      "type": "Webda/GraphQLService"
    }
  }
}
```

The service serves `/graphql` on the existing `HttpServer` and builds its schema from every model `DomainService` exposes. No other configuration is needed. (`npm create @webda my-blog -- --transports rest,graphql` adds the same entry.)

### 3. Rebuild and restart

```bash
npm run debug   # or npm run serve
```

With `npm run debug`, open `http://localhost:18080/graphql` in a browser for the GraphiQL explorer (`exposeGraphiQL` defaults to on in debug mode).

### 4. What the schema contains

For each model, with `Post` as the example:

| GraphQL                                                            | Kind         | Same as REST      |
| ------------------------------------------------------------------ | ------------ | ----------------- |
| `Post(slug: String)`                                               | query        | `Post.Get`        |
| `Posts(query: String)` → `PostQueryResult`                         | query        | `Posts.Query`     |
| `createPost(Post: PostInput)`                                      | mutation     | `Post.Create`     |
| `updatePost(uuid: String, Post: PostInput)`                        | mutation     | `Post.Update`     |
| `deletePost(uuid: String)` → `{ success }`                         | mutation     | `Post.Delete`     |
| `Post(slug:)`, `Posts(query:)`, `PostEvents(slug:)`, `PostsEvents` | subscription | repository events |

- The single-object query takes the primary key field (`Post(slug:)`, `User(uuid:)`); the `update`/`delete` mutations name the key argument `uuid`, whatever the key is.
- `Posts(query:)` takes a WebdaQL query, like `PUT /posts`, and returns `results` and `continuationToken`.
- `Me` returns the logged-in user.
- The root types are named `Query`, `Mutations` and `Subscription`.
- Model and service `@Operation`s (`register`, `login`, `publish`, `Publisher.*`) are not part of the GraphQL schema: call them over REST or gRPC.

## Verify

**Introspect the root types:**

```bash
curl -s -X POST http://localhost:18080/graphql -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { queryType { name } mutationType { name } subscriptionType { name } } }"}' | jq -c
```

```json
{
  "data": {
    "__schema": {
      "queryType": { "name": "Query" },
      "mutationType": { "name": "Mutations" },
      "subscriptionType": { "name": "Subscription" }
    }
  }
}
```

**List users** (public profiles, as over REST):

```bash
curl -s -X POST http://localhost:18080/graphql -H "Content-Type: application/json" \
  -d '{"query":"{ Users { results { uuid username name } } }"}' | jq
```

```json
{
  "data": {
    "Users": {
      "results": [{ "uuid": "096a4874-4b98-4001-a108-fac5d3e1efd3", "username": "alice", "name": "Alice Smith" }]
    }
  }
}
```

**Query published posts** — the WebdaQL query goes in the `query` argument:

```bash
curl -s -X POST http://localhost:18080/graphql -H "Content-Type: application/json" \
  -d "{\"query\":\"{ Posts(query: \\\"status = 'published' ORDER BY title\\\") { results { slug title author } } }\"}" | jq
```

**Read one post by its slug:**

```bash
curl -s -X POST http://localhost:18080/graphql -H "Content-Type: application/json" \
  -d '{"query":"{ Post(slug: \"hello-world\") { slug title content status viewCount } }"}' | jq .data.Post
```

**Mutations follow the model permissions.** Anonymous, `createTag` is refused:

```bash
curl -s -X POST http://localhost:18080/graphql -H "Content-Type: application/json" \
  -d '{"query":"mutation { createTag(Tag: {slug: \"graphql\", name: \"GraphQL\"}) { slug name } }"}' | jq -c .errors
```

```json
[
  {
    "message": "Permission denied",
    "locations": [{ "line": 1, "column": 12 }],
    "path": ["createTag"],
    "extensions": { "code": "PERMISSION_DENIED" }
  }
]
```

With the session cookie (`-b cookies.txt`), the same request returns the tag. Update and delete work the same way:

```bash
curl -s -b cookies.txt -X POST http://localhost:18080/graphql -H "Content-Type: application/json" \
  -d '{"query":"mutation { updatePost(uuid: \"hello-world\", Post: {title: \"Hello GraphQL\"}) { slug title } }"}' | jq
```

Errors are reported in `errors[].extensions.code`: `NOT_FOUND` for a missing (or unreadable) object, `PERMISSION_DENIED` when `canAct` refuses.

See the [@webda/graphql module](../../Modules/graphql/README.md) for subscriptions and the service parameters.

## What's next

→ [10 — gRPC](./10-gRPC.md)
