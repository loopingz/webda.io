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
        "Webda/OAuthGrant",
        "Webda/OAuthRegisteredClient"
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
  `GET /operations` answers `{ version, aliases, operations }`: `version` is a hash of the listing (16 hex
  characters), so it changes whenever an operation the caller can see is added, removed or changed. `aliases` maps a
  model plural to its singular (`{ "MindNodes": "MindNode" }`) for the models of the listed operations, so the CLI
  serves `MindNodes.Query` and `MindNode.Get` under one command group.
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
| `registration`                       | see below      | Dynamic client registration: `open` or `off`                           |
| `registrationRedirectPatterns`       | none           | Globs every registered redirect URI must match one of                  |
| `registrationRateLimit`              | `20`           | Registrations per client IP per window                                 |
| `registrationRateWindow`             | `3600`         | Window of the registration rate limit (s)                              |
| `registrationUnusedTtl`              | `86400`        | Lifetime of a registered client never used (s), 24 hours               |
| `registrationIdleTtl`                | `7776000`      | Lifetime of a registered client after its last token (s), 90 days      |

## Endpoints

With the default `url`: `/.well-known/oauth-authorization-server`, `/oauth/authorize`, `/oauth/token`,
`/oauth/revoke`, `/oauth/device_authorization`, `/oauth/register` (when [registration](#dynamic-client-registration)
is open), the browser pages `/oauth/consent`, `/oauth/device` and
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

A static client gets tokens bound to no resource (the application audience) unless it sends `resource` or sets
`defaultResource` to the absolute URI of a protected resource (see [MCP](#mcp)).

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

### Dynamic client registration

`POST /oauth/register` implements RFC 7591 for **public clients**: most MCP clients (Claude Code, Cursor, VS Code,
claude.ai and ChatGPT connectors...) register themselves this way the first time they connect. It is advertised as
`registration_endpoint` in the metadata.

- `registration` defaults to `open` when a protected resource is registered (an `McpService` using
  `McpOAuthAuthenticator`), `off` otherwise; `off` answers `404`. Set it explicitly to override.
- Only `token_endpoint_auth_method: "none"` (public client with PKCE S256) is accepted, `grant_types` among
  `authorization_code` and `refresh_token`, `response_types` `["code"]`. No client secret is issued. Other fields than
  `redirect_uris`, `client_name`, `client_uri`, `logo_uri` and `scope` are ignored.
- `redirect_uris` follow the metadata document rules (https, loopback `http` on any port, private-use custom scheme;
  no fragment or credentials) and must be in **canonical form** (as `new URL(uri).href` prints it, e.g.
  `https://example.com/cb`, not `HTTPS://Example.com/cb`).
- The response is `201` with a `client_id` prefixed `dcr_` and `client_id_issued_at`. `scope`, when sent, is kept as
  the client default scope, restricted to the advertised scopes.
- **Rate limit:** `registrationRateLimit` registrations per client IP per `registrationRateWindow` (default 20 per hour),
  then `429 slow_down`. The counter is in memory, per process, like the device flow limits.
- **Expiry:** a client never used expires after `registrationUnusedTtl` (24 hours); each token issued to it extends its
  life to `registrationIdleTtl` (90 days) after that use. An expired client is refused; the periodic sweep deletes it and revokes its
  refresh tokens and remembered consents.
- **`registrationRedirectPatterns`** restricts registration to known clients, for example
  `["http://127.0.0.1/*", "http://localhost/*", "cursor://*", "vscode://*", "https://claude.ai/*", "https://chatgpt.com/*"]`.
  A pattern is matched against `<scheme>://<host><path>` of the canonical URI (no query). For a loopback host the
  **port is ignored**: write `http://127.0.0.1/*`, not `http://127.0.0.1:*/*`.

The name of a registered client is chosen by whoever registered it: the consent screen shows it in quotes with an
**"Unverified application"** notice and where the browser will be sent back (the redirect host, or "local
application" for a loopback or custom scheme redirect). Remembered consent is kept per `client_id`, so each new
registration of the same tool asks the user again.

## Consent

The authorization endpoint redirects an anonymous browser to `loginUrl`, then to the consent screen listing the
operations requested. With `rememberConsent` (default) and **Remember for this app** checked, the decision is kept for
the client. A later request skips the screen when the remembered scope covers **every operation the request matches
that the user can call now**, and `offline_access` when requested. The check is done on operations, not on the
scope text: a `*` request remembered as `Task.* User.*` is answered while those are still all the user can call. An
operation added or made callable since is not covered, so the screen is shown again with the remembered operations
pre-selected and marked **(already allowed)**: a new decision adds to the remembered consent, it never withdraws
from it (step-up). The remembered operations the token will carry are listed too, even outside the request. The issued
token carries, when the screen is skipped, the intersection of the request and the remembered scope; after a decision
on the screen, the remembered scope (without `offline_access`) plus the newly allowed operations, bounded by the
client `allowedScopes`. The client can force
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
    "McpOAuthAuthenticator": {
      "type": "Webda/McpOAuthAuthenticator",
      "publicUrl": "https://api.example.com"
    },
    "Mcp": { "type": "Webda/McpService", "authenticator": "McpOAuthAuthenticator" }
  }
}
```

Each MCP endpoint is a **resource** identified by `publicUrl` + the `McpService` `url` (here
`https://api.example.com/mcp`), registered with the authorization server at startup. Tokens are **audience bound**
(RFC 8707):

- `/authorize` and `/token` accept `resource`; it must be a registered resource, otherwise `invalid_target`. The code
  and the refresh token keep it: a token request or a refresh naming a different one is refused with `invalid_target`,
  and `/revoke` accepts the bound tokens.
- Without `resource`, a dynamically registered or metadata document client gets a token bound to the only registered
  resource (`invalid_target` when there are several: the client must name one). A static client gets an application
  token (`aud` `webda-access`) unless it sets `defaultResource`.
- A resource-bound token is only accepted by its MCP endpoint: it is not a general API bearer token, and the MCP
  endpoint refuses application tokens (`401 invalid_token`).

The metadata is served at `/.well-known/oauth-protected-resource`, with `scopes_supported` (by default the same `*`,
`<Group>.*` and `offline_access` the authorization server advertises; set `scopesSupported` on the authenticator to
override). Tools outside the token scope are hidden from `tools/list`; calling one answers `403` with an
`insufficient_scope` challenge the client can use to ask for a wider grant. See the
[@webda/mcp README](https://github.com/loopingz/webda.io/blob/main/packages/mcp/README.md) and
[Connecting agents](../mcp/ConnectingAgents.md).

## OpenAPI

The REST OpenAPI document is only served when the REST transport has `exposeOpenAPI` enabled. Clients such as the CLI
fall back to `GET /operations` when it is not.
