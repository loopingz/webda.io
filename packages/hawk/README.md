# @webda/hawk module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@webda/hawk)](https://www.npmjs.com/package/@webda/hawk)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

> Hawk HTTP authentication for Webda — HMAC-signed request authentication using API keys stored in a Webda Store, with optional session-bound dynamic keys.

## When to use it

- You need server-to-server or machine-to-machine authentication via HMAC-signed HTTP requests (the [Hawk protocol](https://github.com/mozilla/hawk#readme)).
- You want to manage API keys as first-class Webda models with full CRUD, revocation, and audit trail support.
- You need an alternative to Bearer tokens that also covers request integrity (method + URL included in the signature).

## Install

```bash
pnpm add @webda/hawk
```

## Configuration

```json
{
  "services": {
    "hawk": {
      "type": "Hawk",
      "keyModel": "MyApp/ApiKey"
    },
    "apiKeyStore": {
      "type": "MemoryStore",
      "models": ["MyApp/ApiKey"]
    }
  }
}
```

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `keyModel` | string | — | No | Fully qualified model name for API key lookup (must extend `ApiKey`) |
| `dynamicSessionKey` | string | — | No | Session attribute to read a per-session HMAC key from |
| `redirectUrl` | string | — | No | URL to redirect to after successful key exchange |
| `redirectUris` | string[] | `[]` | No | Whitelist of allowed redirect URIs for CSRF protection |
| `timestampSkewSec` | number | `60` | No | Permitted clock skew of the request timestamps, in seconds, on each side |
| `nonceCacheSize` | number | `100000` | No | Maximum number of nonces remembered to reject replayed requests |

### Request integrity and replays

- A request with a body must sign its payload (`hash` attribute of the Authorization header, e.g. the `payload` option of
  `Hawk.client.header`): a body without hash, or whose hash does not match, is rejected with `403`. A request without
  body may omit the hash.
- A nonce is accepted once per key within the clock skew window: a replayed Authorization header is rejected with `403`.
  The nonce cache is in memory, per instance: behind a load balancer, a request replayed on another instance within the
  window is not detected.
- The `Server-Authorization` response header always carries the payload hash, an empty body included: verify it with
  `Hawk.client.authenticate(res, credentials, artifacts, { payload, required: true })`.

## Usage

```typescript
// 1. Create an API key for a client
import { ApiKey } from "@webda/hawk";
import { Bean, Service } from "@webda/core";
import { randomBytes } from "node:crypto";

@Bean
export class ApiKeyManager extends Service {
  async issueKey(name: string): Promise<ApiKey> {
    // The key id is its uuid, algorithm defaults to sha256
    // (a key created through the REST API gets a generated secret)
    return ApiKey.create({ name, __secret: randomBytes(48).toString("base64") });
  }
}

// 2. Sign a request on the client side (e.g. using the hawk npm package)
import * as Hawk from "hawk";

const { header } = Hawk.client.header(
  "https://api.example.com/orders",
  "GET",
  { credentials: { id: apiKeyId, key: apiKeySecret, algorithm: "sha256" } }
);
// A request with a body signs it too:
// Hawk.client.header(url, "POST", { credentials, payload: body, contentType: "application/json" })
// Send the Authorization: Hawk ... header

// 3. HawkService automatically validates incoming requests as a RequestFilter
// before other route handlers run — no additional middleware needed.
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/hawk/`.
- Source: [`packages/hawk`](https://github.com/loopingz/webda.io/tree/main/packages/hawk)
- Related: [`@webda/core`](../core) for `RequestFilter`; [`@webda/async`](../async) for pairing Hawk-authenticated job callbacks.

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
