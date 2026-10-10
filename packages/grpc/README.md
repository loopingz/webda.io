# @webda/grpc module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

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

| Parameter           | Type   | Default              | Required | Description                                                                                                                   |
| ------------------- | ------ | -------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `protoFile`         | string | `".webda/app.proto"` | No       | Path where the generated `.proto` file is written and loaded from                                                             |
| `packageName`       | string | `"webda"`            | No       | Protobuf package name used in the generated `.proto`                                                                          |
| `maxQueuedMessages` | number | `1000`               | No       | Most unconsumed messages a client or bidirectional call may queue; above it the call fails with `RESOURCE_EXHAUSTED`          |
| `maxQueuedBytes`    | number | `16777216`           | No       | Most bytes of unconsumed messages a client or bidirectional call may queue; above it the call fails with `RESOURCE_EXHAUSTED` |

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

## Streaming

All four modes (unary, server, client and bidirectional streams) are live: messages are sent as the generator yields,
and input messages reach the operation as they are received. Request metadata is readable through
`useContext().getHttpContext()`. See [Operations](../../docs/pages/Concepts/Operations.md#streaming-operations) for the
signatures, and for the same `async *connect(frames)` served as a WebSocket by the REST transport.

Messages are the JSON-equivalent objects of the operation: a chunk that is not an object is sent as `{ value }` and
`__`-prefixed keys never leave the server. A compressed message ends the call with `UNIMPLEMENTED`, a message over
4 MiB (`GRPC_MAX_MESSAGE_SIZE`) with `RESOURCE_EXHAUSTED`, and one that cannot be decoded with `INVALID_ARGUMENT`. When
the client cancels, the generator's `return()` is called so its `finally` runs; an operation that throws
`OperationCancelledError` while the client is still connected ends with `CANCELLED`.

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/grpc/`.
- Source: [`packages/grpc`](https://github.com/loopingz/webda.io/tree/main/packages/grpc)
- Related: [`@webda/graphql`](../graphql) for the GraphQL transport; [`@webda/core`](../core) for the `OperationsTransport` base class and operation registration.

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
