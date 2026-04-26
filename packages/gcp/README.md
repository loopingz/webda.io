# @webda/gcp module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/gcp

> Google Cloud Platform integration bundle for Webda — Firestore Store, Cloud Storage Binary, Cloud Pub/Sub, GCP Queue, and KMS encryption service in one package.

## When to use it

- You are deploying a Webda application on GCP and need cloud-native backing services.
- You want to replace `MemoryStore` / `FileBinary` / `MemoryQueue` with GCP-managed equivalents for production.
- You need envelope encryption via Google Cloud KMS for stored model data.

## Install

```bash
pnpm add @webda/gcp
```

## What's inside

- `FireStore` — Firestore-backed Store for any Webda model ([source](./src/services/firestore.ts))
- `Storage` — Cloud Storage-backed Binary service for file uploads/downloads ([source](./src/services/storage.ts))
- `GCPQueue` — Cloud Pub/Sub-backed Queue for reliable task delivery ([source](./src/services/queue.ts))
- `GCPPubSubService` — Cloud Pub/Sub fan-out pub/sub messaging ([source](./src/services/pubsub.ts))
- `GCPKMSService` — Cloud KMS-based encryption/decryption ([source](./src/services/kms.ts))

## Quick config example

```json
{
  "services": {
    "userStore": {
      "type": "FireStore",
      "model": "MyApp/User",
      "project": "my-gcp-project",
      "collection": "users"
    },
    "uploads": {
      "type": "Storage",
      "bucket": "my-app-uploads"
    },
    "taskQueue": {
      "type": "GCPQueue",
      "topic": "my-app-tasks",
      "subscription": "my-app-tasks-sub"
    }
  }
}
```

Authentication uses Application Default Credentials. Set `GOOGLE_APPLICATION_CREDENTIALS` to a service account key file for local development:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json webda serve
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/gcp/`.
- Source: [`packages/gcp`](https://github.com/loopingz/webda.io/tree/main/packages/gcp)
- Related: [`@webda/core`](../core) for the `Store`, `Binary`, and `Queue` base classes; [`@webda/async`](../async) for job orchestration on top of GCPQueue; [`@webda/aws`](../aws) for the AWS equivalent.

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
