---
sidebar_label: Overview
---

# Expose your application

Expose your models and operations through the interfaces your callers need. Start with the
[operation contract](../Concepts/Operations.md), then choose the transports to enable.
An application can offer several interfaces, with protocol-specific configuration and streaming support.

| Interface               | Use it for                                                | What callers use                         |
| ----------------------- | --------------------------------------------------------- | ---------------------------------------- |
| [REST](../REST/REST.md) | HTTP APIs, browser clients, and integrations              | Routes, JSON requests, and OpenAPI       |
| [GraphQL](./GraphQL.md) | Clients that select fields and follow model relationships | Queries, mutations, and subscriptions    |
| [MCP](./MCP.md)         | AI assistants and agent integrations                      | Tools and model resources                |
| [CLI](./CLI.md)         | Local administration and remote operation calls           | Commands and typed arguments             |
| [gRPC](./gRPC.md)       | Typed service-to-service calls and streaming              | Generated Protobuf contracts over HTTP/2 |

## Start with the domain

Define your [models](../Concepts/Models/Models.md), their [actions](../Modules/models/Actions.md), and service
operations before choosing how to expose them. Keep domain behavior in those implementations so multiple
interfaces can call the same behavior.

## Choose what callers can access

Configure each transport's exposed operations and authentication for its intended callers.
Publishing an endpoint does not replace [authorization](../Security/Security.md).
For streaming, compare the supported modes in [Operations](../Concepts/Operations.md#streaming-operations):
not every protocol supports the same interaction patterns.

## Connect clients

The [frontend SDK](../Modules/sdk/README.md) provides typed model and operation clients.
The individual guides below link to transport configuration, examples, and module references.
