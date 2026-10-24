# @webda/oidc module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

> OIDC workload identity for Webda — secretless, auditable trust between applications. Publish an OIDC discovery document, mint short-lived audience-scoped tokens, verify tokens from trusted issuers (other Webda apps, Kubernetes, GitHub Actions, GCP) and authorize the caller through IAM as `app:<name>`.

## When to use it

- Two Webda applications must call each other and you do not want to share an API key or a secret.
- A Kubernetes workload, a GitHub Actions workflow or a GCP service account must call your application.
- You want the callers to be IAM principals (`app:orders`) that policies can allow or deny.

User login stays with `@webda/auth`. A trusted issuer with `session: "user"` accepts the access tokens of a Webda
`OAuthServer` bound to this application (its `resources`), so several applications share one login.

## Install

```bash
pnpm add @webda/oidc
```

## Configuration

```jsonc
// App A (orders): issues tokens and calls other applications
"services": {
  "CryptoService": { "url": "/jwks", "jwt": { "algorithm": "RS256" } },
  "OIDCIssuer": { "type": "Webda/OIDCIssuer", "issuer": "https://orders.example.com", "name": "orders" },
  "OIDCClient": { "type": "Webda/OIDCClient", "source": "self" }
}
// App B (billing): trusts orders
"services": {
  "OIDCVerifier": {
    "type": "Webda/OIDCVerifier",
    "audience": "https://billing.example.com",
    "trustedIssuers": [{ "issuer": "https://orders.example.com", "claims": { "sub": "app:orders" } }]
  }
}
```

| Service | Main parameters |
|---|---|
| `Webda/OIDCIssuer` | `issuer` (required), `name`, `tokenTtl` (300), `algorithm` (`RS256`), `audiences` (`["*"]`) |
| `Webda/OIDCVerifier` | `audience`, `trustedIssuers` (`issuer`, `session`, `claims`, `principal`, `groups`, `audiences`, `algorithms`, `jwksUri`, `maxTokenAge`), `clockTolerance` (30), `maxTokenAge` (3600), `jwksCacheTtl` (600) |
| `Webda/OIDCClient` | `source` (`self`, `file`, `gcp-metadata`, `github-actions`), `tokenFile`, `refreshMargin` (60) |

## Usage

```typescript
import { useOIDCClient } from "@webda/oidc";

// App A: the Bearer token is added, its audience defaults to the url origin
const res = await useOIDCClient().fetch("https://billing.example.com/invoices", { method: "POST", body: "{}" });
```

On App B, the `SessionManager` hands the Bearer token to the `OIDCVerifier`: a valid token gives a stateless
application session (`session.application`, no user) and `@webda/iam` sees the principals `app:orders`,
`app-issuer:https://orders.example.com`, `authenticated-app`:

```jsonc
"attachments": { "app:orders": ["InvoiceWriter"] }
```

## Reference

- Guide: [Application trust with OIDC](../../docs/pages/Security/OIDC.md)
- Sample: [`sample-apps/oidc-trust`](../../sample-apps/oidc-trust)
- Source: [`packages/oidc`](https://github.com/loopingz/webda.io/tree/main/packages/oidc)
- Related: [`@webda/iam`](../iam) for the policies; `@webda/core` `CryptoService` for the keys and the JWKS.

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
