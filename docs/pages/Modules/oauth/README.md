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
  `GET /operations` answers `{ version, operations }`: `version` is a hash of the listed operations (16 hex
  characters), so it changes whenever an operation the caller can see is added, removed or changed.
- No REST transport is needed: the built-in consent and device pages call routes the OAuthServer serves itself (see
  [Custom pages](#custom-consent-device-and-result-pages)).
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
| `rememberConsent`                    | `true`         | Skip the consent screen when the remembered consent covers the request |
| `rememberConsentTtl`                 | `7776000`      | Remembered consent lifetime (s), 90 days                               |
| `scopesSupported`                    | top groups     | Scopes advertised in the metadata                                      |

## Endpoints

With the default `url`: `/.well-known/oauth-authorization-server`, `/oauth/authorize`, `/oauth/token`,
`/oauth/revoke`, `/oauth/device_authorization`, the browser pages `/oauth/consent`, `/oauth/device` and
`/oauth/done`, and the routes of the browser operations `/oauth/consent/request`, `/oauth/consent/decide` and
`/oauth/device/lookup`.

## Scopes

A scope is a space-separated list of **operation id globs**, for example `Task.* Mail.Send`. `*` matches everything
the user may do and `offline_access` asks for a refresh token. The token only carries what the user approved, and a
caller can never exceed the user's own permissions: both the scope and the user's permissions must allow an operation.

`OAuth.*` operations are never offered on the consent screen and are never delegable: a delegated token cannot be
used to mint other tokens.

The granted scope stays compact: a requested glob whose operations are all approved is kept as is, and under a broader
request (such as `*`) each top-level group whose operations are all approved is granted as `<Group>.*`. Only the
operations of a partially approved group are listed one by one. For example, a user who is not an administrator
approving everything offered for `*` gets `Task.* User.* offline_access`, not `*` (the `Admin.*` operations were never
offered) nor the list of every operation id.

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
to remove it. Redirect rules: an `http` loopback URI (`127.0.0.1`, `localhost`, `[::1]`) matches **any port**; every
other URI, including custom schemes, must match **exactly**.

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
operations requested. With `rememberConsent` (default) and **Remember for this app** checked, the decision is kept for
the client. A later request skips the screen when the remembered scope covers **every operation the request matches
that the user can call now**, and `offline_access` when requested. The check is done on operations, not on the
scope text: a `*` request remembered as `Task.* User.*` is answered while those are still all the user can call. An
operation added or made callable since is not covered, so the screen is shown again with the remembered operations
pre-selected. The issued token carries the intersection of the request and the remembered scope. The client can force
the screen with `prompt=consent`; the device flow always shows it. Remembered grants are listed and forgotten through
the connected-apps operations below.

## Device flow

For machines without a browser, the client calls `POST /oauth/device_authorization` and gets a `user_code` and a
verification URL. The user opens `/oauth/device` on any signed-in browser, enters the code and consents, while the
client polls `POST /oauth/token` (`urn:ietf:params:oauth:grant-type:device_code`), honouring `slow_down`.

`POST /oauth/device_authorization` is unauthenticated and stores a device code per request: it is rate limited to 20
requests per client IP per 10 minutes. Beyond, it answers `429` with `{"error": "slow_down"}` (and no device code is
stored); the client should wait before starting a new device flow.

Looking up a code requires a logged-in session and is rate limited: 5 attempts per session and 20 per client IP per 10
minutes. The counters are **in memory, per process**. The client IP comes from core's `getClientIp()`: behind a proxy
that appends to `X-Forwarded-For`, configure `trustedProxies` on the HTTP server.

## Custom consent, device and result pages

The built-in pages are served with a strict Content-Security-Policy. To use your own UI set `consentUrl`, `deviceUrl`
and/or `resultUrl` (an application path or URL). Your UI talks to the server through three operations, which the
OAuthServer serves on its own routes below its `url`:

| Operation              | Route (default `url`)        | Purpose                                               |
| ---------------------- | ---------------------------- | ----------------------------------------------------- |
| `OAuth.Consent.Get`    | `GET /oauth/consent/request` | Pending request: client, requested scopes, CSRF token |
| `OAuth.Consent.Decide` | `POST /oauth/consent/decide` | Approve (with the selected scopes) or deny            |
| `OAuth.Device.Lookup`  | `POST /oauth/device/lookup`  | Resolve a user code, then approve or deny it          |

These routes exist whatever transports are configured, and the calls go through the core operation path (input
validation and authorizers apply). The operations are hidden from the transports (REST, `/operations`, MCP...): the
pending request is tracked by a cookie **scoped to the OAuthServer `url`** (`/oauth`), which only these routes receive.
Device lookup requires a logged-in session.

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
`/.well-known/oauth-protected-resource`, with `scopes_supported` (by default the same `*`, `<Group>.*` and
`offline_access` the authorization server advertises; set `scopesSupported` on the authenticator to override). Tools
outside the token scope are filtered from `tools/list`, and calling one answers the JSON-RPC error `Unknown tool`
(HTTP 200), as for a tool that does not exist: a delegated client does not learn which operations it was not granted. See the [@webda/mcp README](https://github.com/loopingz/webda.io/blob/main/packages/mcp/README.md).

## OpenAPI

The REST OpenAPI document is only served when the REST transport has `exposeOpenAPI` enabled. Clients such as the CLI
fall back to `GET /operations` when it is not.
