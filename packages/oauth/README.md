# @webda/oauth

OAuth 2.1 authorization server for Webda applications. It lets a third-party client (the Webda CLI, an MCP client, any
OAuth 2.1 client) act on behalf of a signed-in user with a **delegated, scoped token**: the user consents to a set of
operations, and the issued access token can only call those.

- Authorization code flow with PKCE (S256), loopback and custom-scheme redirects.
- Device authorization grant (RFC 8628) for headless machines.
- Refresh token rotation with reuse detection (and a grace for a client that lost the answer of its refresh), through the core `TokenService`.
- Client ID Metadata Documents (clients identified by an `https://` URL) and static clients.
- Remembered consent, connected-apps operations, token revocation (RFC 7009), authorization server metadata (RFC 8414).
- Built-in consent, device and result pages, replaceable by your own UI.
- One login for several applications: tokens bound to the `resources` of other applications, verified there by
  `@webda/oidc`.

See the full documentation in [docs/pages/Modules/oauth/README.md](../../docs/pages/Modules/oauth/README.md).

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

`loginUrl` is the application login page; it receives `?redirect=` to come back to the consent flow.
Use a shared store in production (see the documentation).
