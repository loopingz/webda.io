# @webda/google-auth module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/google-auth

> Google OAuth 2.0 authentication provider for Webda — adds `GET /auth/google` and callback handling to your application so users can sign in with their Google account.

## When to use it

- You want to add "Sign in with Google" to a Webda application without hand-rolling OAuth flows.
- You need an offline access token (e.g. for server-side Google API calls on behalf of the user).
- You are building a multi-provider auth system alongside other `@webda/oauth` providers.

## Install

```bash
pnpm add @webda/google-auth
```

## Configuration

```json
{
  "services": {
    "Authentication": {
      "type": "Authentication",
      "providers": {
        "google": {
          "type": "GoogleAuthentication",
          "client_id": "${GOOGLE_CLIENT_ID}",
          "client_secret": "${GOOGLE_CLIENT_SECRET}",
          "access_type": "online",
          "redirect_uri": "https://myapp.example.com/auth/google/callback"
        }
      }
    }
  }
}
```

| Parameter | Type | Default | Required | Description |
|---|---|---|---|---|
| `client_id` | string | — | Yes | Google OAuth 2.0 Client ID from Google Cloud Console |
| `client_secret` | string | — | Yes | Google OAuth 2.0 Client Secret |
| `access_type` | `"online"` \| `"offline"` | `"online"` | No | `"offline"` returns a refresh token for server-side API access |
| `project_id` | string | — | No | Google Cloud Project ID (informational) |
| `auth_options` | object | — | No | Additional parameters forwarded to the Google authorization URL |
| `redirects.use_referer` | boolean | — | No | Redirect to the HTTP Referer after successful login |
| `redirects.whitelist` | string[] | — | No | Allowed redirect URLs (regexp strings) |

## Usage

```typescript
// 1. Register your OAuth credentials in Google Cloud Console:
//    APIs & Services > Credentials > Create OAuth 2.0 Client ID
//    Authorized redirect URI: https://myapp.example.com/auth/google/callback

// 2. Configure (see above). The framework auto-registers these routes:
//    GET  /auth/google           → redirects to Google consent screen
//    GET  /auth/google/callback  → handles the OAuth callback, creates a session

// 3. Listen to the auth event to customize post-login behaviour:
import { GoogleAuthentication } from "@webda/google-auth";
import { Bean, Inject } from "@webda/core";

@Bean
export class ProfileSync extends Service {
  @Inject("Authentication")
  auth: any;

  async resolve(): Promise<this> {
    await super.resolve();
    // Fired after a successful Google login
    this.auth.on("GoogleAuth.Tokens", async ({ tokens, context }) => {
      // tokens.access_token, tokens.refresh_token (if access_type=offline)
      const user = context.getCurrentUser();
      // ... sync Google profile data to your User model
    });
    return this;
  }
}
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/google-auth/`.
- Source: [`packages/google-auth`](https://github.com/loopingz/webda.io/tree/main/packages/google-auth)
- Related: [`@webda/core`](../core) Authentication service; [`@webda/gcp`](../gcp) for Cloud-side GCP integrations.

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
