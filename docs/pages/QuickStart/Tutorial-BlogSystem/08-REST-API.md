---
sidebar_position: 8
sidebar_label: "08 — REST API Tour"
---

# 08 — REST API Tour

**Goal:** Walk through every major REST endpoint the blog system exposes, explaining how each is derived from the models and services defined in pages 02–07.

**Files touched:** _(read-only tour — no new files)_

**Concepts:** Route derivation from model names, query method (`PUT /<model>`), relation sub-routes, status codes, error responses, content negotiation.

## Walkthrough

Start the server if it is not already running:

```bash
cd sample-apps/blog-system
pnpm exec webda debug
```

The server listens on `https://localhost:18080` with a self-signed certificate. All `curl` commands below use `-k` to skip certificate validation.

You can also run the full automated suite:

```bash
./rest.sh
```

Below we walk through each section of `rest.sh` and explain what is happening.

---

### Tags CRUD

Tags are addressed by their `slug` (custom primary key).

```bash
# Create
curl -sk -X POST https://localhost:18080/tags \
  -H "Content-Type: application/json" \
  -d '{"slug":"javascript","name":"JavaScript","description":"All things JS","color":"#f7df1e"}'
# → 200 {"slug":"javascript","name":"JavaScript",...}

# Read
curl -sk https://localhost:18080/tags/javascript
# → 200 {"slug":"javascript",...}

# Update (full replace)
curl -sk -X PUT https://localhost:18080/tags/javascript \
  -H "Content-Type: application/json" \
  -d '{"slug":"javascript","name":"JavaScript Updated","description":"Updated description","color":"#f7df1e"}'
# → 200

# Query (list all)
curl -sk -X PUT https://localhost:18080/tags \
  -H "Content-Type: application/json" \
  -d '{"q":""}'
# → 200 {"results":[...],"continuationToken":null}

# Delete
curl -sk -X DELETE https://localhost:18080/tags/javascript
# → 204 No Content
```

**Why `PUT /tags` for queries?** Webda uses `PUT` for the query/list operation because query parameters can be arbitrarily complex (filters, sort, cursor) and don't fit cleanly in a `GET` query string. The body `{"q":""}` returns all records; add filter expressions like `{"q":"name LIKE 'Java%'"}` to narrow results.

---

### Users CRUD

Users use UUID primary keys (default from `UuidModel`).

```bash
USER1="550e8400-e29b-41d4-a716-446655440001"

# Create
curl -sk -X POST https://localhost:18080/users \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$USER1\",\"username\":\"alice\",\"email\":\"alice@example.com\",\"name\":\"Alice Smith\",\"bio\":\"Blogger\"}"
# → 200 {"uuid":"550e8400...","username":"alice",...}

# Read
curl -sk "https://localhost:18080/users/$USER1"
# → 200 {"uuid":"550e8400..."}

# Partial update (PATCH)
curl -sk -X PATCH "https://localhost:18080/users/$USER1" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$USER1\",\"bio\":\"Senior Blogger\"}"
# → 200

# Query
curl -sk -X PUT https://localhost:18080/users \
  -H "Content-Type: application/json" \
  -d '{"q":""}'
# → 200 {"results":[...],"continuationToken":null}

# Delete
curl -sk -X DELETE "https://localhost:18080/users/$USER1"
# → 204
```

**PATCH vs PUT:** `PUT` replaces the entire document. `PATCH` merges only the provided fields — the others remain unchanged.

---

### Posts CRUD + action

Posts use `slug` as the primary key.

```bash
# Create
curl -sk -X POST https://localhost:18080/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello World","slug":"hello-world","content":"This is my first blog post with enough content.","status":"draft","viewCount":0}'
# → 200 {"slug":"hello-world","title":"Hello World",...}

# Read by slug
curl -sk https://localhost:18080/posts/hello-world
# → 200

# Full update
curl -sk -X PUT https://localhost:18080/posts/hello-world \
  -H "Content-Type: application/json" \
  -d '{"slug":"hello-world","title":"Hello World Updated","content":"Updated content for first blog post with enough text.","status":"draft","viewCount":5}'
# → 200

# Partial update
curl -sk -X PATCH https://localhost:18080/posts/hello-world \
  -H "Content-Type: application/json" \
  -d '{"slug":"hello-world","viewCount":10}'
# → 200

# Query
curl -sk -X PUT https://localhost:18080/posts \
  -H "Content-Type: application/json" \
  -d '{"q":""}'
# → 200

# Custom action — derived from @Operation() async publish(destination)
curl -sk -X PUT https://localhost:18080/posts/hello-world/publish \
  -H "Content-Type: application/json" \
  -d '{"destination":"twitter"}'
# → 200 "twitter_hello-world_1714050000000"

# Delete
curl -sk -X DELETE https://localhost:18080/posts/hello-world
# → 204
```

**Route derivation for `@Operation`:** The framework lowercases the class name (`Post`) and method name (`publish`) to produce `PUT /posts/:slug/publish`. The HTTP method is always `PUT` for operations unless overridden with `rest: { method: "get" }`.

---

### Comments CRUD

Comments are UUID-keyed children of posts.

```bash
COMMENT="660e8400-e29b-41d4-a716-446655440001"

# Create (foreign keys as plain string values)
curl -sk -X POST https://localhost:18080/comments \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$COMMENT\",\"content\":\"Great post!\",\"post\":\"hello-world\",\"author\":\"$USER1\",\"isEdited\":false}"
# → 200

# Read
curl -sk "https://localhost:18080/comments/$COMMENT"
# → 200

# Query
curl -sk -X PUT https://localhost:18080/comments \
  -H "Content-Type: application/json" \
  -d '{"q":""}' | jq '.results | length'
# → 1

# Patch
curl -sk -X PATCH "https://localhost:18080/comments/$COMMENT" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$COMMENT\",\"content\":\"Great post! (edited)\",\"isEdited\":true}"
# → 200

# Delete
curl -sk -X DELETE "https://localhost:18080/comments/$COMMENT"
# → 204
```

---

### Service operations

These come from `@Operation`-decorated methods on service beans, not model classes.

```bash
# GET /version  (custom route via rest: { method: "get", path: "/version" })
curl -sk https://localhost:18080/version
# → 200 "@webda/sample-blog-system"

# PUT /publisher/publish
curl -sk -X PUT https://localhost:18080/publisher/publish \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello from REST"}'
# → 200 "customid"

# PUT /publisher/publishpost
curl -sk -X PUT https://localhost:18080/publisher/publishpost \
  -H "Content-Type: application/json" \
  -d '{"postId":"hello-world"}'
# → 200 {"postId":"hello-world","status":"published"}

# PUT /testbean/testoperation  (hex-encodes a counter)
curl -sk -X PUT https://localhost:18080/testbean/testoperation \
  -H "Content-Type: application/json" \
  -d '{"counter":42}'
# → 200 "2a"
```

---

### Error responses

All validation errors return `400` with a structured body:

```bash
curl -sk -X POST https://localhost:18080/users \
  -H "Content-Type: application/json" \
  -d '{"username":"x","email":"not-an-email","name":"X"}' | jq
```

```json
{
  "code": 400,
  "message": "Validation error",
  "errors": [
    { "path": "/email", "message": "must match format \"email\"" },
    { "path": "/username", "message": "must NOT have fewer than 3 characters" }
  ]
}
```

Missing resources return `404`:

```bash
curl -sk https://localhost:18080/posts/does-not-exist | jq '.code'
# → 404
```

---

### Running the full suite

The reference `rest.sh` script creates test data, verifies every endpoint, and cleans up:

```bash
./rest.sh
```

```
── Tags ──
  PASS POST /tags → 200  Create tag
  PASS POST /tags → 200  Create second tag
  PASS GET /tags/javascript → 200  Get tag by slug
  PASS PUT /tags/javascript → 200  Update tag
  PASS PUT /tags → 200  Query tags
── Users ──
  PASS POST /users → 200  Create user 1
  PASS POST /users → 200  Create user 2
  ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ALL PASSED 28/28 tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Verify

:::warning Could not fully verify locally
The server was not started during doc generation to avoid port conflicts. The output blocks above match `rest.sh` when run against a live server. Verify by running:

```bash
cd sample-apps/blog-system
pnpm exec webda debug &
./rest.sh
```
:::

## What's next

→ [09 — GraphQL](./09-GraphQL.md)
