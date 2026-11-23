# @webda/runtime module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@webda/runtime)](https://www.npmjs.com/package/@webda/runtime)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

> Webda runtime service bundle — cluster coordination, proxy, invitation system, version endpoint, and core utility models bundled for use in any Webda deployment.

## When to use it

- You need a cluster-coordination service (`ClusterService`) to synchronize multiple Webda instances via pub/sub.
- You want a built-in `VersionService` endpoint (`GET /version`) that returns the current application version.
- You need an HTTP reverse proxy (`ProxyService`) to forward matching requests to an upstream service.
- You need an invitation/join-code workflow (`InvitationService`) for user onboarding.

## Install

```bash
pnpm add @webda/runtime
```

## What's inside

### Services

- `ClusterService` — Coordinates multiple Webda instances via a pub/sub channel; broadcasts invalidation events ([source](./src/services/cluster.service.ts))
- `EchoService` — Serves a static result on a fixed route ([source](./src/services/echo.service.ts))
- `InvitationService` — Token-based invitation/join-code system for model membership ([source](./src/services/invitationservice.service.ts))
- `ProxyService` — HTTP reverse proxy that forwards requests matching a URL prefix to an upstream host ([source](./src/services/proxy.service.ts))
- `VersionService` — Exposes a `/version` endpoint returning the application name and version ([source](./src/services/version.service.ts))

### Utility models and services

- `BinaryModel` — Base model with binary attachment support ([source](./src/models/binarymodel.model.ts))
- `PasswordEncryptionService` — Registers the `password` encrypter for configuration secrets ([source](./src/utils/password.service.ts))

## Quick config example

```json
{
  "services": {
    "versionService": {
      "type": "VersionService",
      "url": "/version"
    },
    "proxy": {
      "type": "ProxyService",
      "url": "/legacy",
      "backend": "http://old-service:8080"
    }
  }
}
```

### ProxyService headers

The proxy forwards the client request headers with their keys lowercased, so the headers it sets itself
(`x-forwarded-*`, `host`, and the extra headers a subclass passes to `rawProxy`) replace any client header of the
same name. It never forwards hop-by-hop headers (`connection`, `keep-alive`, `proxy-authorization`, `te`,
`trailer`, `upgrade`, ... and the headers listed in `Connection`).

The client `Authorization` and `Cookie` headers are not forwarded either: they carry the caller's credentials for
this application. Set `forwardCredentials: true` only when the backend must receive them and is trusted with them:

```json
{
  "type": "ProxyService",
  "url": "/legacy",
  "backend": "http://old-service:8080",
  "forwardCredentials": true
}
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/runtime/`.
- Source: [`packages/runtime`](https://github.com/loopingz/webda.io/tree/main/packages/runtime)
- Related: [`@webda/core`](../core) for the base `Service` and `Store` classes; [`@webda/amqp`](../amqp) or [`@webda/gcp`](../gcp) as the pub/sub backend for `ClusterService`.

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
