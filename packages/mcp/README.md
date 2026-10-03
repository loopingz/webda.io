# @webda/mcp

> Model Context Protocol transport for Webda — exposes registered operations as MCP tools and models as MCP resources, over Streamable HTTP and stdio.

## When to use it

- You want AI assistants (Claude Code, Claude Desktop, any MCP client) to call your Webda operations as tools.
- You want models readable as MCP resources through `webda://{Model}/{pk...}` URIs.
- You want the same permissions as your REST API: each caller only sees and runs what their session allows.

### What it exposes

- **Tools**: every non-hidden operation, the tool name being the operation id (for example `Post.Get`, `Posts.Query`, `User.Login`).
- **Resources**: models with a `{Model}.Get` operation, as `webda://{Model}/{pk...}` resource templates (for example `webda://Post/{slug}`).
- **Progress**: `AsyncGenerator` operations stream their chunks as MCP progress notifications.
- **Truncated outputs**: tool outputs larger than `maxOutputBytes` are truncated with a notice and returned with `isError: true`.

## Install

```bash
pnpm add @webda/mcp
```

## Configuration

```jsonc
{
  "services": {
    "mcp": {
      "type": "Webda/McpService",
      "url": "/mcp", // HTTP endpoint; false disables HTTP (stdio only)
      "operations": ["*", "!User.Delete"], // standard OperationsTransport filter
      "resources": { "models": ["*"] }, // false disables resources; model ids or "*"
      "sessionTimeout": 1800, // seconds of inactivity before an MCP session is evicted
      "allowedOrigins": [], // extra Origin values accepted besides the request host
      "allowedHosts": ["localhost", "127.0.0.1", "::1"], // Host header hostnames accepted (any port); "*" disables the check
      "maxSessions": 1000, // cap on open MCP HTTP sessions; initialize beyond it gets 503
      "maxOutputBytes": 1048576, // larger tool/resource outputs are truncated with a notice
      "serverName": undefined, // defaults to the application package name
      "serverVersion": undefined, // defaults to the application package version
      "stdio": { "user": undefined }, // default --user for `webda mcp`
      "authenticator": undefined // name of a service implementing McpAuthenticator; default uses the Webda session
    }
  }
}
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | string \| false | `"/mcp"` | HTTP endpoint; `false` disables HTTP (stdio only) |
| `operations` | string[] | `["*"]` | Operation filter, with `!` for exclusions |
| `resources` | `{ models: string[] }` \| false | `{ "models": ["*"] }` | Models exposed as resources; `false` disables resources |
| `sessionTimeout` | number | `1800` | Seconds of inactivity before an MCP session is evicted |
| `allowedOrigins` | string[] | `[]` | Extra `Origin` values accepted besides the request host |
| `allowedHosts` | string[] | `["localhost", "127.0.0.1", "::1"]` | Hostnames accepted on the `Host` header (any port); `"*"` disables the check |
| `maxSessions` | number | `1000` | Cap on open HTTP sessions; `initialize` beyond it gets `503` |
| `maxOutputBytes` | number | `1048576` | Larger tool/resource outputs are truncated with a notice |
| `serverName` | string | application package name | Server name announced to clients |
| `serverVersion` | string | application package version | Server version announced to clients |
| `stdio.user` | string | none | Default `--user` for `webda mcp` |
| `authenticator` | string | none | Name of a service implementing `McpAuthenticator`; the default uses the Webda session |

> **Remote deployments must set `allowedHosts`.** The Host header is checked on every HTTP request as DNS-rebinding protection: unless your public hostname(s) are listed (or the value is `"*"`), every request gets `403 Host not allowed`.

## Usage

```bash
# HTTP: register the endpoint of a running application
claude mcp add --transport http blog http://localhost:18080/mcp

# stdio: Claude launches the application and acts as the given user
claude mcp add blog -- webda mcp --user <userId>
```

Control how an operation appears to MCP clients:

```typescript
import { Operation } from "@webda/core";

export class PostService extends Service {
  // Not exposed as a tool
  @Operation({ mcp: false })
  async internalCleanup() {}

  // Exposed with a title and explicit hints
  @Operation({ mcp: { title: "Delete a post", readOnly: false, destructive: true } })
  async deletePost(ctx: OperationContext) {}
}
```

## Security

- Permissions apply per caller: an operation is run with the caller's session and `tools/list` is filtered to what that caller may call.
- HTTP sessions are random ids bound to the user who created them; another user presenting the id is rejected with `403`.
- Every HTTP request is checked against `allowedHosts` and `Origin` (request host plus `allowedOrigins`) to prevent DNS rebinding, and open sessions are capped by `maxSessions`.
- `webda mcp` over stdio trusts whoever launches it: that process acts with the permissions of `--user` (or anonymous permissions without it).
- OAuth 2.1 (authorization server and bearer validation) is planned as a second step and will plug in through the `authenticator` hook.

## Reference

- Source: [`packages/mcp`](https://github.com/loopingz/webda.io/tree/main/packages/mcp)
- Design: `docs/superpowers/specs/2026-10-03-webda-mcp-design.md`
