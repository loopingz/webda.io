---
sidebar_position: 2.1
---

# Modules

This page is a categorized index of every `@webda/*` package. Click a package name to reach its dedicated documentation page.

## Why @webda is modular

Webda is a thin runtime (`@webda/core`) wrapped in a fleet of focused, opt-in packages — one for each integration point. You pull in only the protocol layers, stores, deployers, and observability tools your application actually uses. A REST-only app deploying to Lambda doesn't drag in MongoDB, GraphQL, Kubernetes, or OpenTelemetry; an internal service running on bare metal doesn't drag in any AWS code at all. Every package follows the same conventions (a Modda type, a `ServiceParameters` interface, a `webda.config.json` entry), so the integration cost of adding a new layer is nearly zero — declare it in configuration, and `Core` picks it up at boot.

## How code generation amplifies it

Modules are not just runtime libraries — they're *contracts the compiler reads*. `webdac build` walks every package in the dependency graph, discovers each Modda and Model, and generates:

- a typed `webda.module.json` manifest of every service, model, and decorator the app exposes;
- JSON schemas (`.webda-config-schema.json`, `.webda-deployment-schema.json`) that drive VS Code autocomplete *and* runtime validation against `ajv`;
- OpenAPI specs and GraphQL SDL derived from your Models — no hand-written endpoint definitions;
- gRPC `.proto` files with the same source of truth;
- accessor methods, dirty-tracking proxies, and serialization shims emitted by `@webda/ts-plugin` directly into your TypeScript output.

Adding a Model to your app means: write the class, run `webdac build`, and the framework gives you typed REST handlers, a GraphQL type, gRPC service methods, validation, schema autocomplete, and store mappings — across every protocol package you've enabled. The modules below are the building blocks the compiler stitches together; pick the ones you need and configure them in `webda.config.json`.

---

## Foundational (deep tier)

These packages form the backbone of the framework. Most applications depend on all of them.

| Package | Description |
|---------|-------------|
| [core](./core/README.md) | Application boot, dependency injection, routing, stores, events, and all base classes. |
| [compiler](./compiler/README.md) | TypeScript compiler wrapper (`webdac`) that generates `webda.module.json`, OpenAPI specs, and JSON schemas at build time. |
| [models](./models/README.md) | Pre-built domain-model base classes (User, Group, Email, Policy …) ready to extend. |
| [decorators](./decorators/README.md) | All first-party decorators: `@Bean`, `@Route`, `@Inject`, `@Action`, `@Expose`, and more. |
| [schema](./schema/README.md) | JSON-Schema generation, validation pipeline, and the `webda-schema` CLI. |
| [ql](./ql/README.md) | WebdaQL — a portable query language for filtering model collections across every store backend. |
| [graphql](./graphql/README.md) | Auto-generates a GraphQL schema from your models and wires queries, mutations, and subscriptions. |

---

## Stores

Plug-and-play persistence backends — swap them via configuration without touching model code.

| Package | Description |
|---------|-------------|
| [fs](./fs/README.md) | File-system store for local development and testing (JSON files on disk). |
| [mongodb](./mongodb/README.md) | MongoDB store with full WebdaQL translation and change-stream events. |
| [postgres](./postgres/README.md) | PostgreSQL store with SQL-backed WebdaQL and connection-pool management. |
| [elasticsearch](./elasticsearch/README.md) | Elasticsearch store for full-text search and analytics workloads. |
| [aws](./aws/README.md) | AWS integrations including **DynamoStore** (DynamoDB), **S3Binary**, and CloudFormation/Lambda deployers. |
| [gcp](./gcp/README.md) | Google Cloud integrations including **FireStore** persistence and GCP deployer. |

---

## Queues / Messaging

Decouple background work and fan-out events with these messaging adapters.

| Package | Description |
|---------|-------------|
| [amqp](./amqp/README.md) | AMQP 0-9-1 queue adapter (RabbitMQ-compatible) for `QueueService`. |
| [async](./async/README.md) | Async Action runner — executes model actions in background workers via any queue backend. |
| [cloudevents](./cloudevents/README.md) | CloudEvents publisher/subscriber adapter for cross-service event delivery. |

---

## Authentication

| Package | Description |
|---------|-------------|
| [google-auth](./google-auth/README.md) | Google OAuth 2.0 provider for `@webda/authentication`. |
| [hawk](./hawk/README.md) | Hawk HMAC authentication middleware for machine-to-machine API calls. |

---

## Protocols

| Package | Description |
|---------|-------------|
| [grpc](./grpc/README.md) | gRPC server and client transport layer, auto-generated from Protobuf definitions derived from your models. |

---

## Cloud / Deploy

Deployers package your application for cloud execution environments.

| Package | Description |
|---------|-------------|
| [aws](./aws/README.md) | CloudFormation and Lambda deployers plus AWS-specific services (DynamoDB, S3, SQS …). |
| [gcp](./gcp/README.md) | Google Cloud Run and GCP infrastructure deployer. |
| [kubernetes](./kubernetes/README.md) | Kubernetes manifests generator and deployer with Helm-chart output. |

---

## Observability

| Package | Description |
|---------|-------------|
| [otel](./otel/README.md) | OpenTelemetry traces, metrics, and logs — zero-code instrumentation for every Webda service. |
| [workout](./workout/README.md) | Structured logging (`useLog`), log formatters, and the memory-log test helper. |

---

## Testing / Dev

| Package | Description |
|---------|-------------|
| [test](./test/README.md) | `WebdaTest` base class, test utilities, and Vitest helpers for unit and integration tests. |
| [debug](./debug/README.md) | Live-reload dev server, request inspector, and in-browser debug panels. |
| [mock](./mock/README.md) | Coherent fake-data factory for models — deterministic mocks for repeatable tests. |

---

## Build Tooling

| Package | Description |
|---------|-------------|
| [tsc-esm](./tsc-esm/README.md) | Post-compile helper that rewrites TypeScript output to proper ESM `.js` extension specifiers. |
| [compiler](./compiler/README.md) | See **Foundational** above — `webdac` drives both the build pipeline and module-manifest generation. |

---

## Utilities

| Package | Description |
|---------|-------------|
| [utils](./utils/README.md) | Shared helpers: deep-merge, retry, stream utilities, and path manipulation. |
| [serialize](./serialize/README.md) | JSON serializers and deserializers with support for `Date`, `Buffer`, `Map`, `Set`, and circular references. |
| [versioning](./versioning/README.md) | Object-level patch and diff library — compute and apply JSON-Patch-compatible deltas between model versions. |
| [cache](./cache/README.md) | Pluggable in-process and distributed cache adapters (`MemoryCache`, Redis …). |
| [runtime](./runtime/README.md) | Runtime detection helpers: environment probing, ESM/CJS bridge utilities, and process lifecycle hooks. |
