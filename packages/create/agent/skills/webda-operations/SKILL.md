---
name: webda-operations
description: Use when exposing behaviour to clients as an operation, or enabling REST, GraphQL, gRPC or MCP in a Webda app
---

# Webda operations and transports

## When to use

Making a model or service method callable by clients, or adding a transport.

## Pattern

`@Operation()` on a service or model method declares an operation. Every enabled transport exposes it: REST, GraphQL, gRPC and MCP read the same operations, with the same input validation (from the TypeScript signature) and permissions. Models also get create/get/update/patch/delete/query operations automatically.

```ts
import { Operation, Service } from "@webda/core";

/**
 * @WebdaModda
 */
export class GreetingService extends Service {
  /**
   * Operation id: GreetingService.Greet; REST: PUT /greetingservice/greet
   * @param name - who to greet
   * @returns the greeting
   */
  @Operation()
  greet(name: string): string {
    return `Hello ${name}`;
  }
}
```

On a model, an instance method operation receives the model loaded from its key:

```ts
import { Operation } from "@webda/core";
import { UuidModel } from "@webda/models";

export class Invoice extends UuidModel {
  paid!: boolean;

  /**
   * Operation id: Invoice.Pay
   */
  @Operation()
  async pay(): Promise<void> {
    this.paid = true;
    await this.save();
  }
}
```

Transports are services in `webda.config.json`; add the package and the service:

| Transport | Package          | Service                                                                                                                             |
| --------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| REST      | `@webda/core`    | `"RESTService": { "type": "Webda/RESTOperationsTransport" }`                                                                        |
| GraphQL   | `@webda/graphql` | `"GraphQLService": { "type": "Webda/GraphQLService" }`                                                                              |
| gRPC      | `@webda/grpc`    | `"GRPCService": { "type": "Webda/GrpcService" }` plus `"HttpServerH2c": { "type": "Webda/HttpServer", "port": 50051, "h2c": true }` |
| MCP       | `@webda/mcp`     | `"MCP": { "type": "Webda/McpService" }`                                                                                             |

`Webda/DomainService` must stay configured: it registers the model operations.

## Common mistakes

```text
Writing a REST route by hand for model CRUD  → already exposed by the model operations
One method per transport                     → one @Operation serves every transport
Removing DomainService                       → model operations disappear
```

## Verify

`npm run build` regenerates `.webda/operations.json`: check your operation id is listed. Then `npm run debug` and call it.

## Reference

https://docs.webda.io

Written for Webda 4.0.0-beta.
