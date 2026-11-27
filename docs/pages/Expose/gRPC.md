# gRPC

Use gRPC for typed service-to-service calls and streaming over HTTP/2.
`@webda/grpc` exposes registered operations and generates Protobuf definitions from their metadata.

## Enable gRPC

Install `@webda/grpc`, configure `GrpcService`, and generate the application's `.proto` contract.
Follow the [module setup](../Modules/grpc/README.md) for service parameters, generation, and client examples.

## Choose a call pattern

Operations can be unary, server-streaming, client-streaming, or bidirectional.
Their TypeScript signatures describe the inputs and outputs; see
[streaming operations](../Concepts/Operations.md#streaming-operations) for validation and cancellation behavior.

The [blog gRPC tutorial](../QuickStart/Tutorial-BlogSystem/10-gRPC.md) demonstrates the complete flow.
