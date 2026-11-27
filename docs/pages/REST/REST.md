---
sidebar_position: 2.09
---

# REST

Use REST for HTTP APIs consumed by browsers, mobile clients, and integrations.
Webda exposes model operations and service operations through HTTP routes, with JSON inputs and outputs.

## Define your endpoints

Start with [operations](../Concepts/Operations.md#rest-input-binding) to map typed parameters to path,
query, and body values. Use [routes](./Routes.md) when you need a custom HTTP handler.

## Describe and consume the API

[OpenAPI](./OpenAPI.md) describes the HTTP contract for documentation and client tooling.
The [frontend SDK](../Modules/sdk/README.md) provides typed clients for models and operations.

## Stream results

REST operations can stream responses using NDJSON or server-sent events. Bidirectional operations use WebSocket
on their operation URL. See [streaming operations](../Concepts/Operations.md#streaming-operations) for the supported
modes and lifecycle behavior.

For a complete example, follow the [blog REST tutorial](../QuickStart/Tutorial-BlogSystem/08-REST-API.md).
