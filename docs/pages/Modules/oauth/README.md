---
sidebar_label: "@webda/oauth"
---

# @webda/oauth

`@webda/oauth` turns a Webda application into an **OAuth 2.1 authorization server** for delegated access. A client
(the Webda CLI, an MCP client, a third-party tool) sends the user through a consent screen and receives an access token
(plus an optional refresh token) limited to the **operations** the user approved. The core enforces that scope on every
operation call, whatever the transport (REST, `/operations`, MCP).

## Minimal configuration

```jsonc
{
  "services": {
    "Authentication": { "type": "Webda/Authentication" },
    "OAuthStore": {
      "type": "Webda/MemoryStore",
      "models": [
        "Webda/User",
        "Webda/Ident",
        "Webda/RefreshToken",
        "Webda/RevokedAccess",
        "Webda/OAuthCode",
        "Webda/OAuthDeviceCode",
        "Webda/OAuthGrant"
      ]
    },
    "OAuthServer": { "type": "Webda/OAuthServer", "loginUrl": "/auth/google" },
    "Operations": { "type": "Webda/OperationsTransport" }
  }
}
```

- `loginUrl` (required) is your application login page. The server redirects an anonymous browser there with
  `?redirect=` pointing back to the pending request.
- `Webda/OperationsTransport` serves `GET /operations` and `POST /operations/{id}`, the transport the Webda CLI uses.
- Use a shared store for `Webda/RevokedAccess` and `Webda/RefreshToken` in multi-instance deployments, see
  [Revocation](#revocation).

## Parameters

| Parameter                            | Default        | Description                                                            |
| ------------------------------------ | -------------- | ---------------------------------------------------------------------- |
| `url`                                | `/oauth`       | Base path of the endpoints                                             |
| `issuer`                             | request host   | Issuer advertised in the metadata                                      |
| `loginUrl`                           |                | Application login page (required)                                      |
| `clients`                            | CLI client     | Static clients by id, `null` removes a built-in one                    |
| `clientMetadataDocuments`            | `true`         | Accept `https://` client ids resolved as metadata documents            |
| `clientMetadataHosts`                | `[]`           | Hosts allowed to serve metadata documents                              |
| `clientMetadataTimeout`              | `5`            | Fetch timeout (s)                                                      |
| `clientMetadataCacheTtl`             | `3600`         | Metadata cache (s)                                                     |
| `consentUrl`/`deviceUrl`/`resultUrl` | built-in pages | Custom UI, see [Custom pages](#custom-consent-device-and-result-pages) |
| `accessTtl` / `refreshTtl`           | TokenService   | Token lifetimes (s)                                                    |
| `codeTtl`                            | `60`           | Authorization code lifetime (s)                                        |
| `deviceCodeTtl`                      | `600`          | Device code lifetime (s)                                               |
| `devicePollInterval`                 | `5`            | Minimum polling interval (s)                                           |
| `rememberConsent`                    | `true`         | Skip the consent screen when a client asks for already granted scopes  |
| `rememberConsentTtl`                 | `7776000`      | Remembered consent lifetime (s), 90 days                               |
| `scopesSupported`                    | top groups     | Scopes advertised in the metadata                                      |

## Endpoints

With the default `url`: `/.well-known/oauth-authorization-server`, `/oauth/authorize`, `/oauth/token`,
`/oauth/revoke`, `/oauth/device_authorization`, plus the browser pages `/oauth/consent`, `/oauth/device` and
`/oauth/done`.

## Scopes

A scope is a space-separated list of **operation id globs**, for example `Task.* Mail.Send`. `*` matches everything
the user may do and `offline_access` asks for a refresh token. The token only carries what the user approved, and a
caller can never exceed the user's own permissions: both the scope and the user's permissions must allow an operation.

`OAuth.*` operations are never offered on the consent screen and are never delegable: a delegated token cannot be
used to mint other tokens.

## Clients

### Static clients

```jsonc
{
  "OAuthServer": {
    "type": "Webda/OAuthServer",
    "loginUrl": "/login",
    "clients": {
      "my-tool": {
        "name": "My tool",
        "redirect_uris": ["http://127.0.0.1/callback", "mytool://auth/callback"],
        "allowedScopes": "Task.* offline_access",
        "defaultScope": "Task.*",
        "deviceFlow": true
      }
    }
  }
}
```

A built-in `webda-cli` client (loopback callback, device flow, `* offline_access`) is always present; set it to `null`
to remove it. Redirect rules: an `http` loopback URI (`127.0.0.1`, `[::1]`) matches **any port**; every other URI,
including custom schemes, must match **exactly**.

### Client ID Metadata Documents

A client may use an `https://` URL as its `client_id`; the server fetches the JSON document (name, `redirect_uris`,
logo...) at that URL and applies the same redirect rules. Fetches are https only, bounded by `clientMetadataTimeout`
and cached for `clientMetadataCacheTtl`.

- `clientMetadataHosts` empty (default): any **public** host is accepted; private and loopback addresses are refused.
- `clientMetadataHosts` non-empty: **only** the listed hosts are accepted, and they bypass the private address check
  (so an internal host can be listed).
- Known limitation: DNS rebinding between the check and the fetch is not pinned. The impact is limited by the https only
  rule and by the exact `client_id` URL match.

Set `clientMetadataDocuments: false` to disable the feature.

## Consent

The authorization endpoint redirects an anonymous browser to `loginUrl`, then to the consent screen listing the
operations requested. With `rememberConsent` (default) a returning client asking for scopes already granted skips the
screen; the client can force it with `prompt=consent`. Remembered grants are listed and forgotten through the
connected-apps operations below.

## Device flow

For machines without a browser, the client calls `POST /oauth/device_authorization` and gets a `user_code` and a
verification URL. The user opens `/oauth/device` on any signed-in browser, enters the code and consents, while the
client polls `POST /oauth/token` (`urn:ietf:params:oauth:grant-type:device_code`), honouring `slow_down`.

Looking up a code requires a logged-in session and is rate limited: 5 attempts per session and 20 per client IP per 10
minutes. The counters are **in memory, per process**. The client IP comes from core's `getClientIp()`: behind a proxy
that appends to `X-Forwarded-For`, configure `trustedProxies` on the HTTP server.

## Custom consent, device and result pages

The built-in pages are served with a strict Content-Security-Policy. To use your own UI set `consentUrl`, `deviceUrl`
and/or `resultUrl` (an application path or URL). Your UI talks to the server through three operations:

| Operation              | REST hint path              | Purpose                                               |
| ---------------------- | --------------------------- | ----------------------------------------------------- |
| `OAuth.Consent.Get`    | `GET oauth/consent/request` | Pending request: client, requested scopes, CSRF token |
| `OAuth.Consent.Decide` | `POST oauth/consent/decide` | Approve (with the selected scopes) or deny            |
| `OAuth.Device.Lookup`  | `POST oauth/device/lookup`  | Resolve a user code, then approve or deny it          |

The pending request is tracked by a cookie **scoped to the OAuthServer `url`** (`/oauth`). Browser UIs, built-in or
overridden, must therefore call these operations through their **REST hint paths** under that URL; calling them through
`/operations` does not carry the cookie. Device lookup requires a logged-in session.

## Revocation

- `POST /oauth/revoke` implements RFC 7009 for access and refresh tokens. A client logs out by revoking its own token.
- Revoking a refresh token revokes its family and the access tokens issued from it; reusing a rotated refresh token
  or an already used authorization code revokes the whole family.
- Revocations are written to the `Webda/RevokedAccess` denylist, which `TokenService` checks on every bearer request:

| `TokenService` parameter | Default | Description                                                                                           |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| `revocationCheck`        | `true`  | Reject access tokens whose family or user was revoked                                                 |
| `revocationCacheTtl`     | `10`    | Seconds a "not revoked" answer is cached: bounds how long another instance's revocation can be missed |

**Multi-instance deployments must map `Webda/RevokedAccess` (and `Webda/RefreshToken`) to a shared store**, otherwise
revocations stay local to the instance that performed them. See
[Authentication](../../Security/Authentication.md#store-mapping).

## Connected apps

A signed-in user manages the clients acting for them with `OAuth.Sessions` (active refresh sessions), `OAuth.Grants`
(remembered consents), `OAuth.Revoke` (revoke a session) and `OAuth.Forget` (forget a remembered consent). They only
see their own records and **refuse delegated sessions** (a scoped bearer token): use a normal browser session. A
delegated client logs out by revoking its own token with `POST /oauth/revoke`.

## MCP

`@webda/mcp` provides `McpOAuthAuthenticator`, an RFC 9728 protected resource that validates bearer tokens issued by
this server:

```jsonc
{
  "services": {
    "McpOAuthAuthenticator": { "type": "Webda/McpOAuthAuthenticator" },
    "Mcp": { "type": "Webda/McpService", "authenticator": "McpOAuthAuthenticator" }
  }
}
```

The resource identifier is derived from the `McpService` `url` (prefix aware) and the metadata is served at
`/.well-known/oauth-protected-resource`. Out-of-scope tools are filtered from `tools/list` and refused as unknown
tools. See the [@webda/mcp README](https://github.com/loopingz/webda.io/blob/main/packages/mcp/README.md).

## OpenAPI

The REST OpenAPI document is only served when the REST transport has `exposeOpenAPI` enabled. Clients such as the CLI
fall back to `GET /operations` when it is not.
