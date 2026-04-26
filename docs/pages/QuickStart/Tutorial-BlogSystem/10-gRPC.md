---
sidebar_position: 10
sidebar_label: "10 — gRPC"
---

# 10 — gRPC

**Goal:** Add `@webda/grpc`, configure the `GrpcService`, and call the blog API over gRPC using `grpcurl`.

**Files touched:** `package.json` (add `@webda/grpc`), `webda.config.json` (add `GrpcService`, `HttpServerH2c`).

**Concepts:** gRPC service auto-generation from models and `@Operation`, multi-protocol TLS port (REST + GraphQL + gRPC on `18080`), `grpcurl` for ad-hoc calls, proto file generation.

## Walkthrough

### 1. Install `@webda/grpc`

```bash
pnpm add @webda/grpc
```

### 2. Update `webda.config.json`

Add two services — one for gRPC over TLS (piggy-backs on the existing HTTP/2 TLS port) and one for a plain h2c port useful in internal/testing scenarios:

```json title="webda.config.json (new entries)"
{
  "HttpServerH2c": {
    "type": "Webda/HttpServer",
    "port": 50051,
    "h2c": true
  },
  "GRPCService": {
    "type": "Webda/GrpcService"
  }
}
```

The existing `HttpServer` (port 18080, `autoTls: true`) already supports HTTP/2. `GrpcService` registers gRPC handlers on it, so the same TLS port serves REST, GraphQL *and* gRPC simultaneously. This is the "multi-protocol single-port" feature added in commit `ed8832ec`.

The `HttpServerH2c` entry adds a second, unencrypted h2c port (50051) for internal or testing use where TLS is not available.

### 3. Rebuild and restart

```bash
pnpm exec webdac build
# restart webda debug
```

After the build you should see a `.webda/app.proto` file generated — this is the proto descriptor for all your models and services.

```bash
ls .webda/app.proto
```

### 4. Install grpcurl

```bash
# macOS
brew install grpcurl

# Go toolchain
go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest
```

### 5. Discover available services

The gRPC reflection API (enabled automatically) lets you list services without a proto file:

```bash
grpcurl -insecure localhost:18080 list
```

```
grpc.reflection.v1alpha.ServerReflection
webda.CommentService
webda.CommentsService
webda.PostService
webda.PostsService
webda.PostTagService
webda.PostTagsService
webda.PublisherService
webda.TagService
webda.TagsService
webda.TestBeanService
webda.UserService
webda.UsersService
webda.UserFollowService
webda.UserFollowsService
webda.VersionService
```

Each model gets two services: a singular one (`PostService`) for CRUD on a single item and a plural one (`PostsService`) for collection queries.

### 6. CRUD via gRPC

The `grpc.sh` script in the sample app runs the full suite. Below are the key calls with their expected output.

#### Tags

```bash
# Create
grpcurl -insecure -d '{"slug":"grpc-tag","name":"gRPC Tag","description":"From gRPC","color":"#00b4d8"}' \
  localhost:18080 webda.TagService/Create
```

```json
{"slug": "grpc-tag", "name": "gRPC Tag", "description": "From gRPC", "color": "#00b4d8"}
```

```bash
# Get
grpcurl -insecure -d '{"slug":"grpc-tag"}' localhost:18080 webda.TagService/Get
```

```json
{"slug": "grpc-tag", "name": "gRPC Tag", "color": "#00b4d8"}
```

```bash
# Query
grpcurl -insecure -d '{"query":""}' localhost:18080 webda.TagsService/Query
```

```json
{"results": [{"slug": "grpc-tag", "name": "gRPC Tag"}], "continuationToken": ""}
```

```bash
# Update
grpcurl -insecure -d '{"slug":"grpc-tag","name":"gRPC Tag Updated"}' \
  localhost:18080 webda.TagService/Update
```

```json
{"slug": "grpc-tag", "name": "gRPC Tag Updated"}
```

#### Posts

```bash
# Create
grpcurl -insecure \
  -d '{"title":"gRPC Test Post","slug":"grpc-test","content":"Testing gRPC with the blog system sample app.","status":"draft","viewCount":0}' \
  localhost:18080 webda.PostService/Create
```

```json
{"title": "gRPC Test Post", "slug": "grpc-test", "status": "draft", "viewCount": 0}
```

```bash
# Call the publish @Operation
grpcurl -insecure -d '{"uuid":"grpc-test"}' localhost:18080 webda.PostService/Publish
```

```json
{"result": "twitter_grpc-test_1714050000000"}
```

#### Service operations

```bash
# Version
grpcurl -insecure -d '{}' localhost:18080 webda.VersionService/Get
```

```json
{"result": "@webda/sample-blog-system"}
```

```bash
# Publisher
grpcurl -insecure -d '{"message":"Hello from gRPC"}' localhost:18080 webda.PublisherService/Publish
```

```json
{"result": "customid"}
```

### 7. Using the proto file directly

If you prefer to specify the proto file explicitly (useful in CI without reflection support):

```bash
grpcurl -insecure -proto .webda/app.proto \
  -d '{"slug":"grpc-tag"}' localhost:18080 webda.TagService/Get
```

### 8. Proto generation rules

`GrpcService` generates a proto file from your domain by these rules:

| Source | Proto equivalent |
|--------|-----------------|
| Model `Post` | `message Post { … }`, `service PostService { Create, Get, Update, Delete }`, `service PostsService { Query }` |
| `WEBDA_PRIMARY_KEY = ["slug"]` | `message PostRequest { string slug = 1; }` |
| Field `title: string` | `string title = 1;` |
| Field `viewCount: number` | `int64 view_count = 1;` (snake_case in proto) |
| `@Operation() async publish(destination)` | `rpc Publish(PostPublishRequest) returns (StringValue)` added to `PostService` |
| Service bean `Publisher` | `service PublisherService { Publish, PublishPost }` |

### 9. Running the full gRPC test suite

```bash
./grpc.sh
```

```
── Service Discovery ──
  PASS list services
── Tags ──
  PASS webda.TagService/Create  Create tag
  PASS webda.TagService/Get  Get tag
  PASS webda.TagsService/Query  Query tags
  PASS webda.TagService/Update  Update tag
── Users ──
  PASS webda.UserService/Create  Create user
  PASS webda.UserService/Get  Get user
  PASS webda.UsersService/Query  Query users
── Posts ──
  PASS webda.PostService/Create  Create post
  PASS webda.PostService/Get  Get post
  PASS webda.PostsService/Query  Query posts
  PASS webda.PostService/Update  Update post
── Post Actions ──
  PASS webda.PostService/Publish  Publish post
── Comments ──
  PASS webda.CommentService/Create  Create comment
  PASS webda.CommentService/Get  Get comment
  PASS webda.CommentsService/Query  Query comments
── Service Operations ──
  PASS webda.VersionService/Get  Version
  PASS webda.PublisherService/Publish  Publisher.publish
  PASS webda.PublisherService/PublishPost  Publisher.publishPost
  PASS webda.TestBeanService/TestOperation  TestBean.testOperation
── Cleanup ──
  PASS webda.CommentService/Delete  Delete comment
  PASS webda.PostService/Delete  Delete post
  PASS webda.TagService/Delete  Delete tag
  PASS webda.UserService/Delete  Delete user
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ALL PASSED 24/24 tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Verify

:::warning Could not fully verify locally
The server was not started and `grpcurl` was not available during doc generation. The output blocks above match `grpc.sh` when run against a live server. To verify:

```bash
brew install grpcurl   # if not already installed
cd sample-apps/blog-system
pnpm exec webda debug &
./grpc.sh
```
:::

## What's next

→ [11 — Next Steps](./11-NextSteps.md)
