---
sidebar_position: 3
sidebar_label: Queries and Mutations
---

# Queries and Mutations

For every Webda model exposed through `GraphQLService`, the service auto-generates standard CRUD queries and mutations. This page documents the generated operations and shows examples based on the `sample-apps/blog-system`.

## Auto-generated queries

### Fetch one by primary key

```graphql
{ Post(slug: "hello-world") { slug title status viewCount } }
{ User(uuid: "550e8400-...") { uuid username email } }
```

The argument name matches the primary key field. For composite keys (multiple `WEBDA_PRIMARY_KEY` fields), all key fields are separate arguments.

### List all (with optional filtering)

```graphql
{
  Posts {
    results {
      slug
      title
      status
      viewCount
      createdAt
    }
    continuationToken
  }
}
```

The list query returns a `PostList` type with:
- `results` — the array of matching records
- `continuationToken` — pass this back as `offset` for the next page

### Filtering with WQL

Pass a [WebdaQL](../ql/Syntax.md) filter string in the `query` argument:

```graphql
{
  Posts(query: "status = 'published' AND viewCount >= 100") {
    results { slug title viewCount }
  }
}
```

### Pagination

```graphql
{
  Posts(limit: 10, offset: "eyJsYXN0S2V5IjoiYWJjIn0=") {
    results { slug title }
    continuationToken
  }
}
```

Pass `limit` as a Long integer and `offset` as the `continuationToken` from the previous response.

## Auto-generated mutations

### Create

```graphql
mutation {
  createPost(Post: {
    title: "Hello World"
    slug: "hello-world"
    content: "My first Webda blog post with enough content."
    status: "draft"
    viewCount: 0
  }) {
    slug
    title
    createdAt
  }
}
```

### Update

```graphql
mutation {
  updatePost(uuid: "hello-world", Post: {
    title: "Hello World (Updated)"
    slug: "hello-world"
    content: "Updated content with more text here."
    status: "published"
    viewCount: 5
  }) {
    slug
    title
    status
  }
}
```

The `uuid` argument corresponds to the primary key. For composite keys, pass all key fields.

### Delete

```graphql
mutation {
  deletePost(uuid: "hello-world") {
    success
  }
}
```

Returns `{ success: true }` on success.

## Custom operations

When a model defines `@Operation()` methods, they become additional mutations:

```typescript
// Post model
@Operation()
async publish(destination: "linkedin" | "twitter"): Promise<string> {
  return `${destination}_${this.slug}_${Date.now()}`;
}
```

```graphql
mutation {
  publishPost(slug: "hello-world", destination: "linkedin")
}
```

Static `@Operation()` methods (class-level, e.g. `User.login`) become mutations without a primary key argument:

```graphql
mutation {
  loginUser(email: "alice@example.com", password: "secret")
}
```

## `me` query

When `exposeMe: true` (the default), a `me` query exposes the current authenticated user:

```graphql
{
  me {
    uuid
    username
    email
  }
}
```

Returns `null` for unauthenticated requests.

## Error handling

GraphQL errors (permission denied, not found, etc.) are returned as `errors` in the standard GraphQL response format:

```json
{
  "data": null,
  "errors": [
    {
      "message": "Permission denied",
      "extensions": { "code": "PERMISSION_DENIED" }
    }
  ]
}
```

## Verify

```bash
# Requires blog-system server running: cd sample-apps/blog-system && pnpm run debug

# Create a post
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { createPost(Post: {title: \"Test\", slug: \"test-gql\", content: \"Test content with enough text.\", status: \"draft\", viewCount: 0}) { slug title } }"}' | jq .

# Query posts
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ Posts { results { slug title status } } }"}' | jq .

# Run the full graphql test script
cd sample-apps/blog-system
./graphql.sh
```

Expected output from `./graphql.sh` (when server is running):

```
── Setup (REST) ──
  Created test data via REST

── Queries ──
  PASS Query all posts
  PASS Query single post
  PASS Query all tags
  ...

── Mutations ──
  PASS Create post via mutation
  PASS Update post via mutation
  PASS Delete post via mutation
  ...

── Summary ──
  ALL PASSED X/Y tests
```

> **Note**: The verify commands above require the blog-system dev server to be running. If the server is not running, they will fail with a connection error.

## See also

- [Schema Generation](./Schema-Generation.md) — how models become GraphQL types
- [Subscriptions](./Subscriptions.md) — real-time event streaming
- [WQL Syntax](../ql/Syntax.md) — the query language for the `query` argument
- [@webda/models Actions](../models/Actions.md) — `@Operation` decorator reference
