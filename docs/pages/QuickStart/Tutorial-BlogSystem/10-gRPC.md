---
sidebar_position: 10
sidebar_label: "10 — gRPC"
---

# 10 — gRPC

**Goal:** Add `@webda/grpc`, generate the `.proto` file of the application, and call the blog API with `grpcurl`.

**Files touched:** `package.json` (add `@webda/grpc`), `webda.config.json` (add `GRPCService`, `HttpServerH2c`).

**Concepts:** gRPC services generated from the operations, `.webda/app.proto`, h2c and TLS ports.

## Walkthrough

### 1. Install `@webda/grpc`

```bash
npm install @webda/grpc
```

### 2. Update `webda.config.json`

```json title="webda.config.json (services excerpt)"
{
  "services": {
    "GRPCService": {
      "type": "Webda/GrpcService"
    },
    "HttpServerH2c": {
      "type": "Webda/HttpServer",
      "port": 50051,
      "h2c": true
    }
  }
}
```

gRPC needs HTTP/2. `GrpcService` plugs into every `HttpServer` of the application and claims the requests with `content-type: application/grpc`:

- `HttpServerH2c` is a second server, in cleartext HTTP/2 (h2c) on port `50051`: use `grpcurl -plaintext`.
- With `"autoTls": true` (or a `key`/`cert`) on the main `HttpServer`, port `18080` serves HTTP/2 over TLS, and REST, GraphQL and gRPC share it: use `grpcurl -insecure` with the self-signed certificate. This is how the sample app runs.

`npm create @webda my-blog -- --transports rest,grpc` adds the same two entries.

### 3. Build

```bash
npm run build -- --force
```

The build runs the `GrpcService` build hook, which writes `.webda/app.proto` from the registered operations. `--force` makes sure the hook runs: `webdac build` skips everything, hooks included, when no source file changed since the last build.

```bash
grep "^service" .webda/app.proto
```

```
service CommentService {
service CommentsService {
service PostService {
service PostsService {
service PostTagService {
service PostTagsService {
service TagService {
service TagsService {
service UserService {
service UsersService {
service UserFollowService {
service UserFollowsService {
service PublisherService {
service VersionService {
service TestBeanService {
```

Operation ids map to gRPC names: the part before the dot becomes the service, the rest the method.

| Operation                        | gRPC                                 | Request message                                         |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| `Post.Get`, `Post.Delete`        | `webda.PostService/Get`, `/Delete`   | `PostPrimaryKey { slug }`                               |
| `Post.Create`, `Update`, `Patch` | `webda.PostService/Create`…          | `Post`                                                  |
| `Posts.Query`                    | `webda.PostsService/Query`           | `SearchRequest { query }`                               |
| `Post.Publish` (instance op)     | `webda.PostService/Publish`          | `UuidRequest { uuid }` (the post key)                   |
| `User.Register` (static op)      | `webda.UserService/Register`         | `UserRegisterInput { username, email, name, password }` |
| `Publisher.PublishPost`          | `webda.PublisherService/PublishPost` | `PublisherPublishPostInput { postId }`                  |
| `Version.Get`                    | `webda.VersionService/Get`           | empty                                                   |

### 4. Restart

```bash
npm run debug   # or npm run serve
```

The server log shows `Loaded gRPC definitions from .webda/app.proto — <n> RPC methods mapped`.

## Verify

Install `grpcurl` (`brew install grpcurl`, or `go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest`). The server does not implement gRPC reflection: always pass the proto file.

**List the services:**

```bash
grpcurl -plaintext -proto .webda/app.proto localhost:50051 list
```

**Query users:**

```bash
grpcurl -plaintext -proto .webda/app.proto -d '{"query":""}' localhost:50051 webda.UsersService/Query
```

```json
{
  "results": [
    {
      "name": "Alice Smith",
      "username": "alice",
      "uuid": "096a4874-4b98-4001-a108-fac5d3e1efd3"
    }
  ]
}
```

**Read one post, call a service operation:**

```bash
grpcurl -plaintext -proto .webda/app.proto -d '{"slug":"hello-world"}' localhost:50051 webda.PostService/Get

grpcurl -plaintext -proto .webda/app.proto -d '{"postId":"hello-world"}' localhost:50051 webda.PublisherService/PublishPost
```

```json
{
  "postId": "hello-world",
  "status": "published"
}
```

**Register an account over gRPC:**

```bash
grpcurl -plaintext -proto .webda/app.proto \
  -d '{"username":"grpcuser","email":"grpc@example.com","name":"gRPC User","password":"grpc-secret-1"}' \
  localhost:50051 webda.UserService/Register
```

The permissions are the same as over REST: an anonymous `webda.TagService/Create` is refused.

:::caution Limitations in 4.0.0-beta.6

- An operation returning a plain string (`Publisher.Publish`, `Version.Get`, `TestBean.TestOperation`) answers an empty message `{}` over gRPC.
- Errors (missing object, refused permission) answer the gRPC code `Unknown` without a message.
- An instance operation only receives the object key (`UuidRequest`): `Post.Publish` gets no `destination`.

:::

See the [@webda/grpc module](../../Modules/grpc/README.md) for the `protoFile` and `packageName` parameters.

## What's next

→ [11 — Next Steps](./11-NextSteps.md)
