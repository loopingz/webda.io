---
sidebar_label: "@webda/grpc"
---
# grpc

# @webda/grpc

> gRPC transport for Webda — exposes registered operations as gRPC services over HTTP/2, with auto-generated `.proto` files from the operation registry.

## When to use it

- You want to expose Webda operations to gRPC clients (mobile apps, microservices, inter-service calls) alongside the existing REST API.
- You are running the multi-protocol dev server (`webda debug`) and need gRPC on the same TLS port as REST and GraphQL.
- You need a generated `.proto` file that stays in sync with your operation registry automatically on every `webdac build`.

## Install

```bash
pnpm add @webda/grpc
```

## Configuration

```json
{
  "services": {
    "grpc": {
      "type": "GrpcService",
      "protoFile": ".webda/app.proto",
      "packageName": "webda"
    }
  }
}
```

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `protoFile` | string | `".webda/app.proto"` | No | Path where the generated `.proto` file is written and loaded from |
| `packageName` | string | `"webda"` | No | Protobuf package name used in the generated `.proto` |

## Usage

```typescript
// 1. Annotate operations in your model/service:
import { Operation } from "@webda/core";

export class PostService extends Service {
  @Operation({ input: "CreatePostInput", output: "Post" })
  async createPost(ctx: OperationContext<CreatePostInput>): Promise<Post> {
    const body = await ctx.getInput();
    return new Post(body).save();
  }
}

// 2. Build to generate the .proto file:
//    webdac build
//    → writes .webda/app.proto

// 3. Start the server (gRPC is multiplexed on the same port as REST):
//    webda serve
//    → gRPC requests with content-type: application/grpc are routed to GrpcService

// 4. Call from a gRPC client (example using grpcurl):
//    grpcurl -plaintext -d '{"title":"Hello"}' localhost:18080 webda.PostService/CreatePost
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/grpc/`.
- Source: [`packages/grpc`](https://github.com/loopingz/webda.io/tree/main/packages/grpc)
- Related: [`@webda/graphql`](_media/graphql) for the GraphQL transport; [`@webda/core`](_media/core) for the `OperationsTransport` base class and operation registration.
