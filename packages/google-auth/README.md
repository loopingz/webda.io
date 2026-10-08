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

> "Sign in with Google" (OpenID Connect) provider for [`@webda/auth`](../auth): adds `GET /auth/google`, its callback
> and the `Auth.Google.Token` operation; logins go through the `Authentication` service (linking, registration,
> sessions, tokens).

## When to use it

- You want users to sign in with their Google account, in the browser or from a mobile/desktop client holding a
  Google ID token.
- You want to restrict logins to a Google Workspace domain (`hostedDomain`).
- You need an offline Google refresh token (`access_type: "offline"`; stored in the ident tokens).

## Install

```bash
pnpm add @webda/auth @webda/google-auth
```

## Configuration

`GoogleAuthentication` is a provider service next to `Authentication` (see the
[Authentication guide](https://docs.webda.io/Security/Authentication)):

```jsonc
{
  "services": {
    "Authentication": { "type": "Webda/Authentication" },
    "google": {
      "type": "Webda/GoogleAuthentication",
      "client_id": "${GOOGLE_CLIENT_ID}",
      "client_secret": "${GOOGLE_CLIENT_SECRET}",
      // Register exactly this url in the Google Cloud console; set it explicitly behind a proxy
      "redirect_uri": "https://api.example.com/auth/google/callback",
      "redirects": {
        "success": "https://app.example.com/", // default "/"
        "failure": "https://app.example.com/login" // required, receives ?reason=CODE
      },
      // Allowed targets of GET /auth/google?redirect=... (same origin, this path or below)
      "authorized_uris": ["https://app.example.com/"],
      "audiences": ["1234-ios.apps.googleusercontent.com"], // other client ids accepted by Auth.Google.Token
      "hostedDomain": "example.com" // optional: Google Workspace accounts of this domain only
    }
  }
}
```

| Parameter                                       | Default                          | Description                                                                                     |
| ----------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `client_id`, `client_secret`                    | required                         | OAuth client of type "Web application"                                                          |
| `url`                                           | `/auth/google`                   | Prefix of the login and callback routes                                                         |
| `redirect_uri`                                  | request url + `/callback`        | Callback url sent to Google                                                                     |
| `redirects.success` / `redirects.failure`       | `/` / required                   | Where the callback redirects                                                                    |
| `authorized_uris`                               | `[]`                             | Allowed `redirect` parameters (absolute urls)                                                   |
| `scope`                                         | `["openid", "email", "profile"]` | Requested scopes (`openid` is needed for the ID token)                                          |
| `access_type`                                   | `"online"`                       | `"offline"` also returns a refresh token                                                        |
| `audiences`                                     | `[]`                             | Extra client ids accepted by `Auth.Google.Token`                                                |
| `hostedDomain`                                  | -                                | Required `hd` claim; refused with `EMAIL_DOMAIN_NOT_ALLOWED`                                    |
| `auth_options`                                  | -                                | Extra authorization url parameters (`prompt`, `login_hint`...); cannot override the flow fields |
| `allowedEmailDomains`, `trustEmailVerification` | -                                | Per-provider email policy of `@webda/auth`                                                      |

## Usage

- Browser: link to `GET /auth/google?redirect=https://app.example.com/after`. The flow uses PKCE and an OpenID nonce,
  kept in a short-lived encrypted `webda_oauth_google` cookie (so it also works with a `SameSite=Strict` session
  cookie). After the Google consent the callback logs the user in and redirects to `redirect` (or
  `redirects.success`), adding `?mfa=required` when the user still has to pass MFA. Failures redirect to
  `redirects.failure?reason=CODE` (`STATE_MISMATCH`, `PROVIDER_ERROR`, `TOKEN_INVALID`, `ACCOUNT_EXISTS`,
  `EMAIL_DOMAIN_NOT_ALLOWED`, ...).
- Other clients: `POST /auth/google/token` (`Auth.Google.Token`) with a JSON body `{ "token": "<Google ID token>" }`
  or the v3 body `{ "tokens": { "id_token": "...", "access_token": "...", ... } }` returns the `@webda/auth` result
  (`{ status: "ok", accessToken, refreshToken, ... }`). Only ID tokens are verified; access tokens alone are refused.
  This operation never links the identity to an already logged-in user.

The Google identity is the ID token `sub`; the email is only treated as verified when `email_verified` is `true`.
Google credentials are stored encrypted on the ident (`await ident.tokens.get()`) and published after each login:

```typescript
useService("google").on("GoogleAuth.Tokens", async ({ tokens, context }) => {
  // tokens.access_token, tokens.refresh_token (access_type "offline")
});
```

## Reference

- Source: [`packages/google-auth`](https://github.com/loopingz/webda.io/tree/main/packages/google-auth)
- Related: [`@webda/auth`](../auth) (`OAuthProvider` base class, `Authentication` service).

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
