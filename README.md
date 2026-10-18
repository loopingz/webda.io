# webda.io module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

## Summary

Webda is a TypeScript framework for building applications around your domain. You write the `Models` (data,
validation, permissions, actions); Webda exposes them on every configured transport — REST, GraphQL, gRPC, MCP — and
gives you the features every application needs: dependency injection, authentication, authorization, logging,
monitoring, configuration, multi-database abstraction and realtime events.

It is articulated around four domains:

- **Models** define your data and how it is accessed: permissions, actions and relations to other models. Testing your
  models tests most of your application.
- **Services** hold the behaviour that does not belong to a model: authentication, stores, queues, pub/sub, mailers.
  They are injected where you need them and follow the `resolve` → `init` → `stop` lifecycle.
- **Deployments** run the same application as Kubernetes workloads, Lambda functions behind API Gateway, or Docker/OCI
  images. Each deployment overrides only the configuration it needs.
- **Integrations** reach your application over REST, GraphQL, gRPC or MCP. Operations give every entry point one
  normalized way to call your application, with the same permissions and validation.

Even if the framework can do all the steps of deployment, it can also be decoupled to fit inside your classic CI
workflow using GitHub Actions, Bazel, Jenkins, ...

## Quickstart

Webda requires Node.js 22 or later.

```shell
npm create @webda my-app
cd my-app
npm run debug   # build, then dev server with the interactive debug console on http://localhost:18080
```

The command asks for the store (`memory`, `file`, `mongodb`, `postgres`) and the transports (`rest`, `graphql`,
`grpc`, `mcp`). To skip the questions:

```shell
npm create @webda my-app -- --store postgres --transports rest,graphql --yes
```

Other scripts of the generated application:

```shell
npm run serve   # build, then HTTP server on http://localhost:18080
npm run build   # compile and generate webda.module.json
npm test        # build, then run the tests
```

The CLI comes from two packages: `webda` (from `@webda/core`) runs the application, `webdac` (from `@webda/compiler`)
builds it.

### Your first model

```typescript title="src/models/Task.model.ts"
import type { IOperationContext } from "@webda/core";
import { UuidModel } from "@webda/models";

/**
 * A task to do
 */
export class Task extends UuidModel {
  /**
   * What needs to be done
   * @minLength 1
   * @maxLength 200
   */
  title!: string;

  done!: boolean;

  async canAct(_context: IOperationContext, _action: string): Promise<boolean | string> {
    // Permissions are deny-by-default: restrict this before going to production
    return true;
  }
}
```

After `npm run build`, the model is available on every transport (`POST /tasks`, `GET /tasks/{uuid}`, ...) and in
code, without ever touching a store:

```typescript
const task = await Task.create({ title: "Write the docs", done: false });
const { results } = await Task.query("done = FALSE ORDER BY title LIMIT 20");
```

### Working with a coding agent

Generated applications include `AGENTS.md`, `CLAUDE.md` and skills in `.agents/skills/` describing the Webda patterns.
In an existing v4 project, Claude Code users can install the same skills:

```text
/plugin marketplace add loopingz/webda.io
/plugin install webda@webda
```

## Documentation

- [Quick Start](https://webda.io/docs/QuickStart) and the
  [Blog System Tutorial](https://webda.io/docs/QuickStart/Tutorial-BlogSystem/Overview)
- [Concepts](https://webda.io/docs/Concepts): models, services, stores, operations, configuration
- [Modules](https://webda.io/docs/Modules): the categorized index of every `@webda/*` package
- [Deployments](https://webda.io/docs/Deployments): Kubernetes, AWS Lambda, Docker
- [API reference](https://webda.io/typedoc)

The [sample application](./sample-app/) is a reference application using most of the framework.

## Configuration resolution

The configuration lives in `webda.config.json`; the build writes its JSON schema to `.webda/config.schema.json` so
editors complete and validate service types and parameters.

It is resolved in layers: the global configuration of the application is overridden by the deployment configuration
(`deployments/{name}.json`), then by the local element configuration, and finally by the deployment element
configuration. A deployment can change service types (a `MemoryStore` locally, a `PostgresStore` in production); at
runtime, a configuration service can only alter parameters, from files, Kubernetes ConfigMaps or secrets. Secrets can
be committed encrypted with `webda config encrypt`.

## Packages

| Area               | Packages                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Foundation         | `core`, `compiler`, `models`, `decorators`, `content-mapper`, `ql`                         |
| Transports         | `graphql`, `grpc`, `mcp`                                                                   |
| Stores             | `fs`, `mongodb`, `postgres`, `elasticsearch`, `aws` (DynamoDB, S3), `gcp` (Firestore, GCS) |
| Queues / messaging | `amqp`, `async`, `cloudevents`                                                             |
| Authentication     | `auth`, `google-auth`, `hawk`, `iam`                                                       |
| Deploy             | `aws`, `gcp`, `kubernetes`, `oci`                                                          |
| Observability      | `otel`, `workout`                                                                          |
| Testing / dev      | `test`, `debug`, `mock`, `create`                                                          |
| Utilities          | `utils`, `serialize`, `versioning`, `offline`, `cache`, `runtime`                          |

## History

Back in 2014, I had servers running for my own personal use for more than 10 years because I wanted to have few
websites and APIs online, but most of the time those servers are sitting and waiting. Then came **Lambda**, really cool
feature from AWS, but it was tricky to turn it into a full webserver. That's one of the targets of Webda.

Since AWS became better with nice framework like Amplify or Serverless. Webda stayed useful as it does provide a true
framework of development with some vague inspiration from Spring. It does the heavy lifting for you to abstract
NoSQL, to abstract the run environment (Lambda or Kubernetes or custom).

The **webda.config.json** contains the configuration of the app, defining Services and global configuration, you can
consider it as the applicationContext.xml of Spring if you prefer, with Beans=Services.

## Requirements

Node.js >= 22.0.0

<!-- README_FOOTER -->

## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://webda.io/img/sponsors/arize.svg" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://webda.io/img/sponsors/loopingz.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://webda.io/img/sponsors/tellae.svg" width="200">](https://tellae.fr)
