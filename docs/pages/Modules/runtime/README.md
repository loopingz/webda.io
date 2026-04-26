---
sidebar_label: "@webda/runtime"
---
# runtime

# @webda/runtime

> Webda runtime service bundle — router, cluster coordination, proxy, invitation system, version endpoint, migration store, and core utility models bundled for use in any Webda deployment.

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

- `ClusterService` — Coordinates multiple Webda instances via a pub/sub channel; broadcasts invalidation events ([source](_media/cluster.ts))
- `EchoService` — Development helper that echoes request bodies back to the caller ([source](_media/echo.ts))
- `InvitationService` — Token-based invitation/join-code system for model membership ([source](_media/invitationservice.ts))
- `ProxyService` — HTTP reverse proxy that forwards requests matching a URL prefix to an upstream host ([source](_media/proxy.ts))
- `VersionService` — Exposes a `/version` endpoint returning the application name and version ([source](_media/version.ts))

### Stores

- `MigrationStore` — Wraps another store and runs model migrations on read ([source](_media/migration.ts))

### Utility models

- `BinaryModel` — Base model with binary attachment support
- `PasswordModel` — Secure password hashing helper ([source](_media/password.ts))

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
      "upstream": "http://old-service:8080"
    }
  }
}
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/runtime/`.
- Source: [`packages/runtime`](https://github.com/loopingz/webda.io/tree/main/packages/runtime)
- Related: [`@webda/core`](_media/core) for the base `Service` and `Store` classes; [`@webda/amqp`](_media/amqp) or [`@webda/gcp`](_media/gcp) as the pub/sub backend for `ClusterService`.
