---
sidebar_label: "Connecting agents"
---

# Connecting agent harnesses to a Webda MCP server

With `@webda/oauth` and `McpOAuthAuthenticator`, the agent harnesses people use today connect to a Webda MCP endpoint
with a browser sign-in and a consent screen: no API key to copy, no per-client setup by the application owner. The
client discovers the authorization server, registers itself (RFC 7591), sends the user through your login page and the
consent screen, then calls the tools the user allowed with a token bound to the endpoint.

## Minimal configuration

```jsonc
{
  "services": {
    "Authentication": { "type": "Webda/Authentication" },
    // Any login method of @webda/auth, e.g. Google Workspace; its page is the OAuthServer loginUrl
    "OAuthStore": {
      "type": "Webda/MemoryStore", // a shared, persistent store in production
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
    "McpOAuthAuthenticator": {
      "type": "Webda/McpOAuthAuthenticator",
      "publicUrl": "https://api.example.com"
    },
    "Mcp": {
      "type": "Webda/McpService",
      "authenticator": "McpOAuthAuthenticator",
      "allowedHosts": ["api.example.com"]
    }
  }
}
```

The MCP endpoint is `https://api.example.com/mcp`: that is the URL to give to every client below.

- **`publicUrl`** is the URL clients use, including any path prefix in front of the application (an API Gateway stage:
  `https://abc.execute-api.eu-west-1.amazonaws.com/prod`). Tokens are bound to `publicUrl` + `/mcp` and refused
  elsewhere. Without it the resource follows the request host: fine on `localhost`, not a security boundary.
- **Dynamic registration is open** as soon as the MCP endpoint is protected by `McpOAuthAuthenticator`. To accept only
  known clients, list their redirect URIs:

  ```jsonc
  "OAuthServer": {
    "type": "Webda/OAuthServer",
    "loginUrl": "/auth/google",
    "registrationRedirectPatterns": [
      "http://127.0.0.1/*",
      "http://localhost/*",
      "cursor://*",
      "vscode://*",
      "https://vscode.dev/redirect",
      "https://claude.ai/*",
      "https://chatgpt.com/*"
    ]
  }
  ```

  Patterns are matched against the canonical redirect URI without its query; the port of a loopback host is ignored
  (`http://127.0.0.1/*` matches `http://127.0.0.1:54321/callback`).

- Hosted connectors (claude.ai, ChatGPT) reach the server from the internet: the endpoint must be public and served
  over https. Local clients (Claude Code, Cursor, VS Code, Codex CLI, Gemini CLI) can use `http://localhost:18080/mcp`
  during development (keep `localhost` in `allowedHosts`).

See [@webda/oauth](../oauth/README.md) for every authorization server parameter and the [OAuth section of
@webda/mcp](./README.md#oauth) for audience binding and scopes.

## What the user sees

1. The client opens a browser on the authorization page; an anonymous browser goes to your `loginUrl` first.
2. The consent screen shows the client name **in quotes with an "Unverified application" notice** (the name is chosen
   by whoever registered the client) and where the browser goes back: "local application" for desktop and CLI
   clients, the host (`claude.ai`, `chatgpt.com`...) for hosted connectors.
3. The user picks the operations the client may call. **Remember for this app** skips the screen next time for the
   same registration; a client that registers again (a reinstall, another machine) asks again.
4. The client lists and calls the allowed tools. Calling a tool outside the grant answers `403 insufficient_scope`
   with the scope to request; clients that support step-up open the consent screen again, where the operations
   already granted show as "(already allowed)". Set `listOutOfScopeTools: true` on the `McpService` to let agents see
   those tools before asking.
5. The user revokes a client from the connected-apps operations (`OAuth.Sessions`, `OAuth.Revoke`); its next call gets
   `401` and it signs in again.

## Claude Code

```bash
claude mcp add --transport http myapp https://api.example.com/mcp
```

In a session, run `/mcp`, pick `myapp` and **Authenticate**: the browser opens on the consent screen. Claude Code uses
a loopback callback (`http://localhost:<port>/callback`).

## claude.ai and Claude Desktop

**Settings → Connectors → Add custom connector**, give a name and `https://api.example.com/mcp`, then **Connect**. The
callback is `https://claude.ai/api/mcp/auth_callback`; on Team and Enterprise plans an owner adds the connector for the
organization first. Claude Desktop uses the connectors of the account.

## ChatGPT

With developer mode enabled (**Settings → Apps & Connectors → Advanced settings**), **Create** a connector with
`https://api.example.com/mcp` and OAuth authentication. ChatGPT registers itself; its callback is on `chatgpt.com`.

## Cursor

Add the server to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "myapp": { "url": "https://api.example.com/mcp" }
  }
}
```

**Cursor Settings → MCP** shows the server as needing a login: click it to open the consent screen. The callback is a
`cursor://` URL.

## VS Code

Add the server to `.vscode/mcp.json` (or **MCP: Add Server…** from the command palette):

```json
{
  "servers": {
    "myapp": { "type": "http", "url": "https://api.example.com/mcp" }
  }
}
```

Start the server from the file or the **MCP: List Servers** command; VS Code asks to allow the sign-in, then opens the
browser. It uses a loopback callback or `https://vscode.dev/redirect`.

## Codex CLI

```bash
codex mcp add myapp --url https://api.example.com/mcp
codex mcp login myapp
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.myapp]
url = "https://api.example.com/mcp"
```

`codex mcp login` opens the browser and receives the code on a loopback callback.

## Gemini CLI

In `~/.gemini/settings.json` (or `.gemini/settings.json` in a project):

```json
{
  "mcpServers": {
    "myapp": { "httpUrl": "https://api.example.com/mcp" }
  }
}
```

Gemini CLI starts the sign-in when the server asks for it; `/mcp auth myapp` starts it again. It uses a loopback
callback.

## Troubleshooting

| Symptom                                           | Cause                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `invalid_redirect_uri` at registration            | Redirect not canonical, not an accepted kind, or not matching `registrationRedirectPatterns`          |
| `429 slow_down` at registration                   | More than `registrationRateLimit` registrations from the IP in the window (default 20 per hour)       |
| `invalid_target`                                  | The `resource` is not `publicUrl` + the MCP path, or several MCP endpoints and none was named         |
| `401 invalid_token` right after signing in        | `publicUrl` differs from the URL the client uses (missing path prefix, other host or scheme)          |
| `403 Host not allowed`                            | The public hostname is missing from `allowedHosts`                                                    |
| Consent asked again after reinstalling the client | Each registration is a new client: remembered consent is per `client_id`                              |
| Client refused after a day unused                 | A registered client expires after `registrationUnusedTtl` without a token; the client registers again |
