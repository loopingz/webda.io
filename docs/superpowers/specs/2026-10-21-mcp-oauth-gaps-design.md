# MCP OAuth 2.1: closing the gaps for today's agent harnesses — design

- **Date:** 2026-10-21
- **Issue:** loopingz/webda.io#901
- **Builds on:** #928 (merged) — `@webda/oauth` `OAuthServer`, scoped/delegated tokens in core, `McpOAuthAuthenticator`
- **Status:** draft, pending owner approval (owner answers to the review questions included)

## 1. Intent

A Webda application exposing `@webda/mcp` must be usable from **the agent harnesses people use today**, with nothing more than a browser sign-in and a consent screen: no API key copied into a client config, no per-client setup by the application owner.

Target clients: Claude Code, Claude Desktop / claude.ai connectors, ChatGPT connectors, Cursor, VS Code (Copilot), OpenAI Codex CLI, Gemini CLI, Windsurf, Goose — and any client following the MCP authorization spec.

The first concrete user is LoopCenter, which exposes its models (agent-authored specs and plans stored as `Report`s) to coding agents.

**Success:** each client category (below) connects end to end against a sample app — discovery, registration, sign-in through `@webda/auth` (e.g. Google Workspace), consent, tool calls restricted to the granted scope, refresh, and revocation from the connected-apps operations.

## 2. What already exists (from #928)

- `@webda/oauth` `OAuthServer`: RFC 8414 metadata, `/authorize` (PKCE S256 only), consent with operation selection and remembered consent (`OAuthGrant`), `/token` (code, refresh, device), RFC 7009 `/revoke`, RFC 8628 device flow, connected-apps operations (`OAuth.Sessions`, `OAuth.Grants`, `OAuth.Revoke`, `OAuth.Forget`).
- Client registry (`packages/oauth/src/clients.ts`): static clients, loopback redirects on any port, exact custom schemes, Client ID Metadata Documents with SSRF guards. **No dynamic client registration.**
- Core: scope algebra over operation globs, `scope` / `client_id` in access and refresh tokens, permanent scope authorizer, `RevokedAccess` denylist.
- `McpOAuthAuthenticator`: RFC 9728 protected resource metadata, `401` with `WWW-Authenticate: Bearer resource_metadata=…`, tools outside the scope hidden from `tools/list`.

## 3. Gaps this design closes

1. **Dynamic Client Registration (RFC 7591).** Many of the target clients only register dynamically (or fall back to it when the server does not advertise Client ID Metadata Documents). Without it they cannot connect.
2. **Audience binding (RFC 8707 resource indicators).** Every access token is signed with the fixed audience `webda-access` (`packages/core/src/services/token.service.ts`, `ACCESS_AUDIENCE`) and the `resource` parameter is ignored. The MCP spec requires tokens to be bound to the MCP server they were issued for and refused elsewhere.
3. **Out-of-scope tool call answers "Unknown tool"** (`packages/mcp/src/server.ts`) instead of an `insufficient_scope` error. Out-of-scope tools stay hidden from `tools/list` (owner decision), so this only matters to a client calling a tool name it already knows; the error must still be accurate.
4. **No client-by-client validation or connection docs.**

## 4. Goals, non-goals, anti-goals

**Goals**
- Any MCP-spec client registers itself and connects with a browser consent.
- Tokens issued for an MCP resource are only accepted by that resource.
- Clear errors a client can act on (`insufficient_scope`, re-auth on `invalid_token`).
- Existing clients (the built-in `webda-cli`, metadata-document clients, cookie sessions) keep working unchanged.

**Non-goals**
- Validating tokens issued by an external authorization server (Auth0, Keycloak, Google as AS). Webda stays the only authorization server; Google Workspace and others remain **login providers behind it** through `@webda/auth`. (Owner decision.)
- New login methods.
- Software statements / signed registration (RFC 7591 §2.3), registration access tokens / client management (RFC 7592).

**Anti-goals** (failure even if it works)
- Open registration becoming an abuse vector: unbounded client records, or a consent screen that lets a self-registered client impersonate a trusted one.
- A token minted for one Webda MCP endpoint being replayable against another resource.
- Breaking `webda-cli` or any existing integration's tokens.

## 5. Design

### 5.1 Dynamic Client Registration — `@webda/oauth`

**Endpoint.** `POST {url}/register` (RFC 7591), advertised as `registration_endpoint` in the authorization server metadata when enabled.

**Request handling.**
- Accepted metadata: `redirect_uris` (required), `client_name`, `client_uri`, `logo_uri`, `grant_types` (`authorization_code`, `refresh_token` only), `response_types` (`code` only), `token_endpoint_auth_method` (**`none` only** — public clients with PKCE; anything else → `invalid_client_metadata`), `scope` (the requested default scope, intersected with what the server allows).
- Unknown fields are ignored, not stored.
- `redirect_uris` are validated with the same rules as metadata documents (`isAcceptableDocumentRedirect`: https, loopback http on any port, private-use custom scheme; forbidden schemes, fragments and credentials refused), plus the same length/count limits.
- Response `201` with the stored metadata and a generated `client_id` (opaque, random, prefixed `dcr_`), `client_id_issued_at`. No `client_secret`.

**Storage.** New model `OAuthRegisteredClient` in `packages/oauth/src/models.model.ts`: `uuid` (= client_id), `name`, `clientUri?`, `logoUri?`, `redirect_uris`, `scope?`, `createdAt`, `lastUsedAt?`, `expiresAt`, `ip` (registering address, for rate limiting and audit). It is resolved by the client registry after static clients and before metadata documents (`client_id` starting with `dcr_`).

**Guardrails.**
- `registration` parameter: `"open"` (default when MCP is used — see 5.4), `"off"`.
- `registrationRedirectPatterns?: string[]` — when set, every registered redirect URI must match one of these globs (lets an enterprise allow only e.g. `http://127.0.0.1/*`, `cursor://*`, `https://claude.ai/*`).
- Rate limit per source IP (`registrationRateLimit`, default 20 per hour), in memory per process like the device flow limits (documented limitation, same as #928).
- **Unused clients expire:** `expiresAt = createdAt + registrationUnusedTtl` (default 24 h). The first successful code exchange extends it to `lastUsedAt + registrationIdleTtl` (default 90 days), refreshed on each token issuance. Expired clients are refused and cleaned up lazily on lookup; grants and refresh tokens of an expired client are revoked with it.
- **Consent screen** shows a dynamically registered client as **unverified**: its self-declared name is displayed in quotes with an "unverified application" notice and the **redirect host** (or "local application" for loopback / custom scheme). Static and metadata-document clients keep their current presentation (the metadata-document URL is already the identity).
- Remembered consent for a dynamically registered client is keyed by its `client_id`, so a new registration always asks again.

### 5.2 Audience binding — core + `@webda/oauth` + `@webda/mcp`

**Tokens.**
- `TokenService.issue()` gains an optional `resource` (absolute URI). When set, the access token `aud` is **that resource only**; when not set, `aud` stays `webda-access` (unchanged behavior).
- `RefreshToken` stores `resource?`; refresh keeps it (a refresh request may repeat the same `resource` or omit it; a different one → `invalid_target`).
- `verifyAccess(token, { audience? })`: default audience `webda-access` (current callers unchanged). `SessionManager.loadFromToken` keeps verifying `webda-access` only, so a resource-bound token is **not** a general API bearer token.

**Resource identity.** A new `publicUrl` parameter on `McpOAuthAuthenticator` (falling back to the core application public URL setting when one is configured) gives the canonical absolute URI of each MCP endpoint: `<publicUrl><mcp path>`. Audience checks compare this **full URI**, never a value derived from request headers. One resource per endpoint, whatever hostnames the app answers on. Without a configured public URL the authenticator falls back to the request origin and logs a startup warning that audience binding is weakened (development only). The protected resource metadata advertises the same URI.

**Authorization server.**
- `/authorize` and `/token` accept `resource` (RFC 8707). It must be one of the application's known resources: each `McpService` URL bound to an `McpOAuthAuthenticator` registers its canonical resource URI (above) with the `OAuthServer`. Unknown resource → `invalid_target`.
- A code is bound to the `resource` requested at `/authorize`; the `/token` `resource`, if present, must match.
- **When `resource` is absent:**
  - Dynamically registered and metadata-document clients: if the application has exactly one MCP resource, the token is bound to it; if several, `invalid_target` (the client must say which).
  - Static clients (including `webda-cli`): unchanged — `webda-access` audience. A static client can opt into a default resource with a new `defaultResource` client setting.
- Protected Resource Metadata already lists the `resource` URI; the AS metadata adds `resource_indicators_supported`-style documentation in `docs` only (no standard field exists).

**Resource server.** `McpOAuthAuthenticator.authenticate()` stops relying on the cookie/bearer session built by core. It reads the bearer itself and calls `verifyAccess(token, { audience: <its resource URI> })`, builds the stateless session the same way `loadFromToken` does (shared helper extracted from `SessionManager`), and on failure answers `401` with `WWW-Authenticate: Bearer error="invalid_token", resource_metadata=…`.
- No compatibility mode: nothing connects to Webda MCP endpoints with OAuth tokens today (owner), so `webda-access` tokens are simply refused by the MCP authenticator and no migration of existing access or refresh tokens is needed. Clients that connected during the 4.0 betas sign in again.

### 5.3 Out-of-scope tool calls

In `packages/mcp/src/server.ts`, when a tool exists but the caller's scope does not cover its operation, answer with an MCP error carrying `insufficient_scope` and, on the HTTP transport, `403` with `WWW-Authenticate: Bearer error="insufficient_scope", scope="<operation glob>", resource_metadata=…` . **Out-of-scope tools stay hidden from `tools/list` by default** (owner decision): an agent only sees tools it can call, and widening access means re-connecting with a larger scope. The `insufficient_scope` answer is then a safety net for clients calling a known tool name.

**Option `listOutOfScopeTools`** (on `McpService`, default `false`, owner request): when `true`, `tools/list` also returns tools the caller's **permissions** allow but its token **scope** does not cover, so an agent can discover them and a call triggers the `insufficient_scope` step-up challenge above. This needs the permission check and the scope check evaluated separately in both `tools/list` and `tools/call` (today the scope authorizer answers `insufficient_scope` in probe mode and `canCallOperation` folds it into `false`): a tool is listed when the permission check passes and either the scope covers it or the option is on. Tools denied by permissions are never listed, whatever the option. When a client does re-authorize with a larger scope, the consent adds to the remembered `OAuthGrant` rather than replacing it, and the challenge `scope` lists the full set the client needs (already granted ∪ missing). Tools the caller cannot call for **permission** reasons (not scope) keep answering "Unknown tool" so their existence is not disclosed.

### 5.4 Defaults and configuration

- When an `McpOAuthAuthenticator` is configured and an `OAuthServer` is present, `registration` defaults to `"open"`; otherwise `"off"`. Applications can set it explicitly.
- All new parameters are documented in `docs/pages/Modules/oauth/README.md` and the `@webda/mcp` README.

### 5.5 Validation and docs

- **End-to-end tests** (real router, like `packages/oauth/src/e2e.spec.ts`), one per client category, each going register → authorize (with/without `resource`) → consent → token → MCP `tools/list` → in-scope call → out-of-scope call (`insufficient_scope`) → (with `listOutOfScopeTools: true`: the tool is listed, the call is challenged, re-authorization with the wider scope succeeds and keeps the earlier tools) → refresh → revoke → `401`:
  1. loopback redirect (`http://127.0.0.1:<random port>/callback`) — Claude Code, Codex, Gemini CLI, Goose style;
  2. custom scheme (`cursor://…`, `vscode://…`) — editor style;
  3. hosted https callback (`https://claude.ai/api/mcp/auth_callback`-style) — claude.ai / ChatGPT connector style.
- Negative tests: wrong audience, unknown resource, refresh with a different resource, expired unused client, registration rate limit, forbidden redirect, `token_endpoint_auth_method` other than `none`, redirect not matching `registrationRedirectPatterns`.
- **Docs page** "Connecting agent harnesses to a Webda MCP server": minimal config, then per-client connection steps for Claude Code, claude.ai, ChatGPT, Cursor, VS Code, Codex, Gemini CLI.
- **Manual check before release:** connect at least Claude Code and one editor (Cursor or VS Code) to the sample app and record the result in the PR.

## 6. Decisions log

| Decision | By |
|---|---|
| Target "most agent harnesses of today" → DCR is in scope | Owner |
| Webda is the only AS; Google Workspace etc. stay login providers behind it; no external-AS token validation | Owner |
| Public clients only (`token_endpoint_auth_method: none`), no client secrets | Claude's call |
| Unverified label + redirect host on the consent screen for DCR clients | Claude's call |
| Unused DCR clients expire after 24 h, idle after 90 days | Claude's call |
| Missing `resource` → bind to the single MCP resource; `invalid_target` if several | Claude's call |
| Resource-bound tokens are not accepted as general API bearer tokens | Claude's call |
| Out-of-scope tools hidden from `tools/list` by default, `listOutOfScopeTools` option to list them | Owner |
| `listOutOfScopeTools` lives on `McpService` (it shapes the MCP tool list, not token validation) | Claude's call |
| No compatibility mode or token migration (nothing uses MCP OAuth tokens today) | Owner |
| Canonical resource URI from a configured `publicUrl`, compared in full; one resource per endpoint | Claude's call |
| Step-up consent adds to the existing grant (union with the remembered `OAuthGrant`); the challenge `scope` lists the full set the client needs (granted ∪ missing) | Claude's call |
| Out-of-scope → `insufficient_scope` / 403; permission-denied stays "Unknown tool" | Claude's call |

## 7. Left to the builder

- Exact module layout inside `@webda/oauth` (new `registration.ts` or within `clients.ts`).
- Cleanup mechanics for expired clients beyond lazy cleanup on lookup.
- Wording and layout of the "unverified" consent notice within the existing page style and CSP.
- How the `OAuthServer` learns the MCP resources (a small registry in core is the likely shape) — as long as `@webda/mcp` does not depend on `@webda/oauth` (the authenticator must keep only knowing the AS by URL).
