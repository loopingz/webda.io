---
sidebar_label: "@webda/runtime"
---
# runtime

# @webda/runtime

> Webda runtime service bundle — router, cluster coordination, proxy, invitation system, version endpoint, and core utility models bundled for use in any Webda deployment.

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
- `EchoService` — Serves a static result on a fixed route ([source](_media/echo.ts))
- `InvitationService` — Token-based invitation/join-code system for model membership ([source](_media/invitationservice.ts))
- `ProxyService` — HTTP reverse proxy that forwards requests matching a URL prefix to an upstream host ([source](_media/proxy.ts))
- `VersionService` — Exposes a `/version` endpoint returning the application version as `text/plain` ([source](_media/version.ts))

### Utility models and services

- `BinaryModel` — Base model with binary attachment support
- `PasswordEncryptionService` — Registers the `password` encrypter for configuration secrets

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

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/runtime/`.
- Source: [`packages/runtime`](https://github.com/loopingz/webda.io/tree/main/packages/runtime)
- Related: [`@webda/core`](_media/core) for the base `Service` and `Store` classes; [`@webda/amqp`](_media/amqp) or [`@webda/gcp`](_media/gcp) as the pub/sub backend for `ClusterService`.
