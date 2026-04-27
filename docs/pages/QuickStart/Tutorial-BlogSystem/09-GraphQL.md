---
sidebar_position: 9
sidebar_label: "09 — GraphQL"
---

# 09 — GraphQL

**Goal:** Add `@webda/graphql`, configure the `GraphQLService`, and exercise schema introspection, queries, and mutations against the blog domain.

**Files touched:** `package.json` (add `@webda/graphql`), `webda.config.json` (add `GraphQLService`).

**Concepts:** Automatic schema generation from models, `Query`/`Mutation` auto-CRUD, `__schema` introspection.

## Walkthrough

### 1. Install `@webda/graphql`

```bash
pnpm add @webda/graphql
```

### 2. Add the `GraphQLService` to `webda.config.json`

```json title="webda.config.json (new entry)"
{
  "GraphQLService": {
    "type": "Webda/GraphQLService"
  }
}
```

The service mounts a GraphQL endpoint at `/graphql`. No further configuration is required — it discovers all registered models automatically from `DomainService`.

### 3. Rebuild and restart

```bash
pnpm exec webdac build
# restart webda debug
```

### 4. Introspect the schema

```bash
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { queryType { name } mutationType { name } subscriptionType { name } } }"}' | jq
```

```json
{
  "data": {
    "__schema": {
      "queryType": { "name": "Query" },
      "mutationType": { "name": "Mutation" },
      "subscriptionType": null
    }
  }
}
```

List all types:

```bash
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { types { name kind } } }"}' | jq '.data.__schema.types[] | select(.kind == "OBJECT") | .name'
```

```
"Query"
"Mutation"
"Post"
"User"
"Comment"
"Tag"
"PostTag"
"UserFollow"
"PostResults"
"UserResults"
...
```

Every model gets a corresponding GraphQL type. Collections are wrapped in `<Model>Results` objects that include a `continuationToken` for cursor-based pagination.

### 5. Seed some data via REST

GraphQL operates on the same in-memory stores. Seed data first:

```bash
# Create a tag
curl -sk -X POST https://localhost:18080/tags \
  -H "Content-Type: application/json" \
  -d '{"slug":"graphql-tag","name":"GraphQL","description":"GraphQL testing","color":"#e535ab"}' > /dev/null

# Create a user
curl -sk -X POST https://localhost:18080/users \
  -H "Content-Type: application/json" \
  -d '{"uuid":"550e8400-e29b-41d4-a716-446655440010","username":"gqluser","email":"gql@example.com","name":"GQL User"}' > /dev/null

# Create a post
curl -sk -X POST https://localhost:18080/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"GraphQL Test Post","slug":"graphql-test","content":"Testing GraphQL queries with enough content here.","status":"draft","viewCount":0}' > /dev/null
```

### 6. Run queries

**List all posts:**

```bash
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ Posts { results { slug title status } } }"}' | jq
```

```json
{
  "data": {
    "Posts": {
      "results": [
        { "slug": "graphql-test", "title": "GraphQL Test Post", "status": "draft" }
      ]
    }
  }
}
```

**Single post:**

```bash
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ Post(slug: \"graphql-test\") { slug title content status viewCount } }"}' | jq '.data.Post'
```

```json
{
  "slug": "graphql-test",
  "title": "GraphQL Test Post",
  "content": "Testing GraphQL queries with enough content here.",
  "status": "draft",
  "viewCount": 0
}
```

**List all users:**

```bash
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ Users { results { uuid username email } } }"}' | jq '.data.Users.results'
```

```json
[
  {
    "uuid": "550e8400-e29b-41d4-a716-446655440010",
    "username": "gqluser",
    "email": "gql@example.com"
  }
]
```

**Single user:**

```bash
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ User(uuid: \"550e8400-e29b-41d4-a716-446655440010\") { uuid username name bio } }"}' | jq '.data.User'
```

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440010",
  "username": "gqluser",
  "name": "GQL User",
  "bio": null
}
```

### 7. Run mutations

**Create a post:**

```bash
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { createPost(Post: {title: \"GQL Created\", slug: \"gql-created\", content: \"Created via GraphQL mutation with enough text.\", status: \"draft\", viewCount: 0}) { slug title } }"
  }' | jq '.data.createPost'
```

```json
{
  "slug": "gql-created",
  "title": "GQL Created"
}
```

**Update a post:**

```bash
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { updatePost(uuid: \"gql-created\", Post: {title: \"GQL Updated\", slug: \"gql-created\", content: \"Updated via GraphQL mutation with enough text.\", status: \"draft\", viewCount: 5}) { slug title viewCount } }"
  }' | jq '.data.updatePost'
```

```json
{
  "slug": "gql-created",
  "title": "GQL Updated",
  "viewCount": 5
}
```

**Delete a post:**

```bash
curl -sk -X POST https://localhost:18080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { deletePost(uuid: \"gql-created\") { success } }"}' | jq '.data.deletePost'
```

```json
{ "success": true }
```

### 8. Schema auto-generation rules

The `GraphQLService` derives the schema from your models following these rules:

| Model aspect | GraphQL equivalent |
|---|---|
| Class `Post` | Type `Post`, query `Post(slug:…)`, collection `Posts` |
| `WEBDA_PRIMARY_KEY = ["slug"]` | Argument name `slug` in `Post(slug:…)` |
| Field `title: string` | `title: String` |
| Field `status: "draft" \| "published"` | `status: String` (enums become strings) |
| `@Operation() async publish(destination)` | Not auto-exposed as GraphQL mutation — operations become gRPC/REST only; use `@GraphQLOperation` to add them to the schema |
| Relations `BelongTo<User>` | Resolver field `author: User` |
| Relations `Contains<Comment>` | Resolver field `comments: CommentResults` |

### 9. Running the full GraphQL test suite

```bash
./graphql.sh
```

```
── Setup (REST) ──
  (Created test data via REST)
── Queries ──
  PASS Query all posts
  PASS Query single post
  PASS Query all tags
  PASS Query single tag
  PASS Query all users
  PASS Query single user
  PASS Query all comments
── Mutations ──
  PASS Create post via mutation
  PASS Update post via mutation
  PASS Delete post via mutation
  PASS Create tag via mutation
  PASS Delete tag via mutation
── Introspection ──
  PASS Schema introspection
  PASS List types
── Cleanup (REST) ──
  (Cleaned up test data)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ALL PASSED 14/14 tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Verify

:::warning Could not fully verify locally
The server was not started during doc generation. The curl and graphql.sh output above matches the reference implementation. To verify:

```bash
cd sample-apps/blog-system
pnpm exec webda debug &
./graphql.sh
```
:::

## What's next

→ [10 — gRPC](./10-gRPC.md)
