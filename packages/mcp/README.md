# @webda/mcp module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

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
      "maxSessions": 1000, // cap on open MCP HTTP sessions; at the cap the least recently used one is closed
      "maxOutputBytes": 1048576 // larger tool/resource outputs are truncated with a notice
      // "serverName": "my-app", // defaults to the application package name
      // "serverVersion": "1.0.0", // defaults to the application package version
      // "stdio": { "user": "<userId>" }, // default --user for `webda mcp`
      // "authenticator": "myAuthenticator" // service implementing McpAuthenticator; default uses the Webda session
    }
  }
}
```

| Parameter        | Type                            | Default                             | Description                                                                                                                                                 |
| ---------------- | ------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`            | string \| false                 | `"/mcp"`                            | HTTP endpoint; `false` disables HTTP (stdio only)                                                                                                           |
| `operations`     | string[]                        | `["*"]`                             | Operation filter, with `!` for exclusions                                                                                                                   |
| `resources`      | `{ models: string[] }` \| false | `{ "models": ["*"] }`               | Models exposed as resources; `false` disables resources                                                                                                     |
| `sessionTimeout` | number                          | `1800`                              | Seconds of inactivity before an MCP session is evicted                                                                                                      |
| `allowedOrigins` | string[]                        | `[]`                                | Extra `Origin` values accepted besides the request host                                                                                                     |
| `allowedHosts`   | string[]                        | `["localhost", "127.0.0.1", "::1"]` | Hostnames accepted on the `Host` header (any port); `"*"` disables the check                                                                                |
| `maxSessions`    | number                          | `1000`                              | Cap on open HTTP sessions; at the cap a new `initialize` closes the least recently used session, whose next request gets `404` (clients then re-initialize) |
| `maxOutputBytes` | number                          | `1048576`                           | Larger tool/resource outputs are truncated with a notice                                                                                                    |
| `serverName`     | string                          | application package name            | Server name announced to clients                                                                                                                            |
| `serverVersion`  | string                          | application package version         | Server version announced to clients                                                                                                                         |
| `stdio.user`     | string                          | none                                | Default `--user` for `webda mcp`                                                                                                                            |
| `authenticator`  | string                          | none                                | Name of a service implementing `McpAuthenticator`; the default uses the Webda session                                                                       |

> **Remote deployments must set `allowedHosts`.** The Host header is checked on every HTTP request as DNS-rebinding protection: unless your public hostname(s) are listed (or the value is `"*"`), every request gets `403 Host not allowed`.
>
> **Behind a reverse proxy**, the hostname checked is the `X-Forwarded-Host` header when present, otherwise `Host`. `X-Forwarded-*` headers are only accepted from proxies listed in the HttpServer `trustedProxies` parameter (anything else gets `400` from the HttpServer). A proxy that rewrites `Host` without a trusted `X-Forwarded-Host` gets `403` unless the rewritten hostname is in `allowedHosts`.

## Usage

```bash
# stdio: Claude launches the application and acts as the given user
claude mcp add blog -- webda mcp --user <userId>

# HTTP: register the endpoint of a running application
claude mcp add --transport http blog http://localhost:18080/mcp
```

Use `https://` when the HttpServer serves TLS. With `autoTls` (as in the [blog sample](../../sample-apps/blog-system/README.md#mcp)) the certificate is self-signed: start the MCP client with `NODE_EXTRA_CA_CERTS=<app>/.webda/dev-tls/cert.pem` so it trusts it.

`webda mcp` keeps stdout for protocol frames: from the moment the command starts, log lines and any other stdout output go to stderr, whatever `--log-stream` says. Lines logged while the application boots (before the command starts) follow `--log-stream`; its default (`auto`) already sends them to stderr because MCP clients pipe stdout.

### Who is the HTTP caller?

The default `SessionAuthenticator` uses Webda's cookie session. MCP clients (Claude Code, the SDK HTTP transports) do not keep cookies, so **HTTP callers are anonymous in practice**: they see and run only the operations anonymous users may call. To act as a user, use stdio (`webda mcp --user <userId>`), use [OAuth](#oauth) so MCP clients act as the consenting user, or plug a custom authenticator service:

```typescript
import { Service, Session, WebContext, WebdaError } from "@webda/core";
import type { McpAuthenticator } from "@webda/mcp";

// Your own key lookup (a model query, a secret store...)
declare function lookupUserForKey(key: string): Promise<string | undefined>;

/**
 * Resolve MCP callers from an API key header
 */
export class ApiKeyAuthenticator extends Service implements McpAuthenticator {
  async authenticate(ctx: WebContext): Promise<Session> {
    const key = ctx.getHttpContext().getUniqueHeader("x-api-key");
    const session = new Session();
    if (key === undefined) {
      return session; // anonymous
    }
    const userId = await lookupUserForKey(key);
    if (!userId) {
      throw new WebdaError.Unauthorized("Invalid API key");
    }
    session.login(userId, userId);
    return session;
  }
}
```

```jsonc
{
  "services": {
    "apiKeys": { "type": "MyApp/ApiKeyAuthenticator" },
    "mcp": { "type": "Webda/McpService", "authenticator": "apiKeys" }
  }
}
```

### OAuth

`McpOAuthAuthenticator` makes the MCP endpoint an OAuth 2.1 protected resource (RFC 9728) for tokens issued by
[`@webda/oauth`](../oauth/README.md). MCP clients discover the authorization server, send the user through consent and
then call with a scoped bearer token:

```jsonc
{
  "services": {
    "McpOAuthAuthenticator": { "type": "Webda/McpOAuthAuthenticator" },
    "Mcp": { "type": "Webda/McpService", "authenticator": "McpOAuthAuthenticator" }
  }
}
```

- The resource is derived from the `McpService` `url` (prefix aware); the metadata is served at
  `/.well-known/oauth-protected-resource` (`resourceMetadataPath`), with the RFC 9728 path-suffixed form when several
  MCP endpoints share the authenticator.
- `authorizationServers` lists the advertised authorization servers; it defaults to the request origin.
- Tools outside the token scope are filtered from `tools/list` and refused as unknown tools.
- Without a valid token the endpoint answers `401` with a `WWW-Authenticate` header pointing to the metadata.

### Multiple instances

MCP HTTP sessions live in the memory of the instance that created them. When running several instances behind a load balancer, route each client to the same instance (sticky sessions on the `Mcp-Session-Id` header or the client address); a request reaching another instance gets `404 Session not found`.

Control how an operation appears to MCP clients:

```typescript
import { Operation, OperationContext, Service } from "@webda/core";

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
- Every HTTP request is checked against `allowedHosts` and `Origin` (request host plus `allowedOrigins`) to prevent DNS rebinding.
- Open sessions are capped by `maxSessions`; at the cap the least recently used session is closed rather than refusing new ones, so nobody can lock the endpoint by opening sessions.
- With the default authenticator, HTTP callers are anonymous in practice (see [Who is the HTTP caller?](#who-is-the-http-caller)).
- `webda mcp` over stdio trusts whoever launches it: that process acts with the permissions of `--user` (or anonymous permissions without it).
- With `McpOAuthAuthenticator`, callers present an OAuth bearer token whose scope limits the tools they see and call (see [OAuth](#oauth)).

## Reference

- Source: [`packages/mcp`](https://github.com/loopingz/webda.io/tree/main/packages/mcp)
- Design: `docs/superpowers/specs/2026-10-03-webda-mcp-design.md`

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
