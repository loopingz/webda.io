# MCP OAuth gaps (#901) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let today's agent harnesses connect to a Webda MCP server with only a browser sign-in: dynamic client registration, tokens bound to the MCP resource, accurate out-of-scope errors, optional listing of out-of-scope tools.

**Architecture:** Core gains resource-bound access tokens (`aud` = MCP resource URI), a protected-resource registry and a probe API that tells "out of scope" from "denied". `@webda/oauth` gains RFC 8707 `resource` handling and RFC 7591 registration backed by a new `OAuthRegisteredClient` model. `@webda/mcp` validates the audience itself and maps scope refusals to `insufficient_scope`. `@webda/mcp` must not depend on `@webda/oauth`; they meet through core.

**Tech Stack:** TypeScript (ESM), `@webda/core`, `@webda/oauth`, `@webda/mcp`, `@modelcontextprotocol/sdk`, `@webda/test` (`@suite`/`@test` classes) and vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-mcp-oauth-gaps-design.md`

## Global Constraints

- Public clients only: `token_endpoint_auth_method` `none`; no client secrets are ever issued or stored.
- PKCE S256 stays mandatory (unchanged).
- Tokens without a `resource` keep `aud = "webda-access"`; `SessionManager.loadFromToken` accepts only `webda-access`.
- No compatibility mode and no token migration (owner): the MCP authenticator refuses `webda-access` tokens.
- Out-of-scope tools hidden from `tools/list` by default; `listOutOfScopeTools` (on `McpService`, default `false`) lists them. Permission-denied tools are never listed and answer `Unknown tool: <name>`.
- Registration defaults: `registrationRateLimit` 20 per `registrationRateWindow` 3600 s per IP; `registrationUnusedTtl` 86400 s; `registrationIdleTtl` 7776000 s; client ids prefixed `dcr_`.
- Redirect URIs accepted for registration follow the existing metadata-document rules (https, loopback http any port, private-use scheme; no fragment/credentials/forbidden scheme; ≤ 2048 chars; ≤ 20 URIs).
- Consent never replaces a remembered grant on re-authorization: it adds to it.
- `@webda/mcp` keeps depending only on `@webda/core` and `@webda/workout`.
- Each package: `pnpm run build`, `pnpm test`, `pnpm run lint`, prettier clean before commit. Core tests need `@webda/sample-app` built first. Do not hand-edit `webda.module.json`; regenerate with the build.
- Commits: conventional, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Proxy / multiple hostnames:** with `publicUrl` set, a request arriving through another `Host` must still validate a token whose `aud` is the `publicUrl` resource, and a token whose `aud` is a forged-host URI must be refused. → test in Task 8.
2. **Revoking a resource-bound access token at `/oauth/revoke`** (RFC 7009) must still revoke its family; today `accessFamily` verifies with the default audience only. → test in Task 4.
3. **Expired registered client with live refresh tokens:** after expiry, refresh fails with `invalid_client` and existing access tokens of its families are revoked. → test in Task 5.
4. **Registration body abuse:** non-JSON body, `redirect_uris` not an array / empty / 21 entries / `javascript:` / fragment, `grant_types` including `client_credentials`, `token_endpoint_auth_method: "client_secret_basic"` all answer 400 `invalid_client_metadata` or `invalid_redirect_uri` and store nothing. → test in Task 6.
5. **Step-up re-authorization keeps earlier tools:** a client with `Task.Get` re-authorizing for `Task.Update` ends with a token covering both, without the user re-selecting `Task.Get`. → test in Task 7.

---

### Task 1: Core probe API that separates "out of scope" from "denied"

**Files:**
- Modify: `packages/core/src/core/operations.ts:141-163` (`canCallOperation`)
- Modify: `packages/core/src/index.ts` (export `InsufficientScope`, `probeOperation`)
- Test: `packages/core/src/core/operations.spec.ts` (add cases; create if the suite lives elsewhere, follow the existing operations spec)

**Interfaces:**
- Produces: `export async function probeOperation(context: OperationContext, operationId: string, options?: { input?: any }): Promise<true | string | false>` — `false` when the permission check fails or the operation is unknown, otherwise the raw `runAuthorizers` result in probe mode (`"insufficient_scope"` for a scope refusal). `canCallOperation` becomes `(await probeOperation(...)) === true` with identical behaviour.
- Produces: `InsufficientScope` (from `services/scopeauthorizer.ts`) exported from `@webda/core`.

- [ ] **Step 1: Write failing tests** — `probeReportsScopeRefusal`: session with `scopes = ["Task.Get"]` probing `Task.Update` → `"insufficient_scope"`; `probeReportsPermissionDenied`: operation with `permission` the session fails → `false`; `probeAllowed` → `true`; `canCallOperationUnchanged`: the three cases give `false`, `false`, `true`.
- [ ] **Step 2: Run** `cd packages/core && npx vitest run src/core/operations.spec.ts` — expect FAIL (`probeOperation` not exported).
- [ ] **Step 3: Implement** `probeOperation` by extracting the body of `canCallOperation` (keep the try/catch returning `false`); export it and `InsufficientScope` from `src/index.ts`.
- [ ] **Step 4: Run** the spec — PASS; then `pnpm test` in core — no regressions.
- [ ] **Step 5: Commit** `feat(core): probeOperation tells scope refusals from permission denials (#901)`.

### Task 2: Protected-resource registry and scope union

**Files:**
- Create: `packages/core/src/services/protectedresources.ts`
- Modify: `packages/core/src/session/scope.ts` (add `union`)
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/services/protectedresources.spec.ts`, `packages/core/src/session/scope.spec.ts`

**Interfaces:**
- Produces:
  - `export interface ProtectedResource { path: string; uri?: string }` — `uri` is the canonical absolute URI when the resource server knows it (`publicUrl` set), else only `path` (application relative).
  - `export function registerProtectedResource(resource: ProtectedResource): void` (idempotent on `path`), `export function unregisterProtectedResource(path: string): void`, `export function listProtectedResources(): ProtectedResource[]`.
  - `export function resolveProtectedResources(origin: string): string[]` — `uri ?? origin + path` for each, `origin` without trailing slash.
  - `export function union(a: Scope, b: Scope): Scope` in `scope.ts` — de-duplicated, order of `a` then new items of `b`.
- Module-level array, same pattern as `registerOperationAuthorizer` in `core/operations.ts`.

- [ ] **Step 1: Write failing tests** — register two resources (one with `uri`), `resolveProtectedResources("https://app.example")` → `["https://mcp.example/mcp", "https://app.example/api/mcp"]`; re-register same path replaces; unregister removes; `union(["Task.Get"], ["Task.Get","Task.Update"])` → `["Task.Get","Task.Update"]`.
- [ ] **Step 2: Run** both specs — FAIL.
- [ ] **Step 3: Implement** and export from `src/index.ts`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(core): protected resource registry and scope union (#901)`.

### Task 3: Resource-bound access tokens in core

**Files:**
- Modify: `packages/core/src/services/token.service.ts` (l.14 `ACCESS_AUDIENCE`, `IssueOptions` l.32-58, `AccessClaims` l.61-80, `issue` l.198-250, `verifyAccess` l.256-264, `refresh` l.371-465)
- Modify: `packages/core/src/models/refreshtoken.model.ts` (add `resource?: string`)
- Modify: `packages/core/src/session/manager.model.ts:87-125`
- Test: `packages/core/src/services/token.service.spec.ts`, `packages/core/src/session/manager.spec.ts` (existing suites)

**Interfaces:**
- Produces:
  - `export const ACCESS_AUDIENCE = "webda-access"` (now exported).
  - `IssueOptions.resource?: string`; `RefreshToken.resource?: string`; `AccessClaims.aud?: string | string[]`.
  - `issue()` signs with `audience: options.resource ?? ACCESS_AUDIENCE` and stores `resource` on the `RefreshToken`.
  - `verifyAccess(token: string, options: { audience?: string | string[] } = {}): Promise<AccessClaims | undefined>` — default `ACCESS_AUDIENCE`.
  - `refresh(refreshToken, options: { scope?: Scope; clientId?: string; resource?: string } = {})` — `options.resource` present and different from `stored.resource` → throw `InvalidTarget`; the new tokens keep `stored.resource`.
  - `export class InvalidTarget extends WebdaError.BadRequest { code = "invalid_target" }` in `token.service.ts`, exported from `@webda/core`.
  - `SessionManager.sessionFromAccessToken(token: string, options?: { audience?: string | string[] }): Promise<Session | undefined>` — public; builds the stateless session exactly as `loadFromToken` l.105-123 does (including `isOutdated`), returns `undefined` when the token is invalid. `loadFromToken` calls it with the default audience, then falls back to bearer resolvers as today.

- [ ] **Step 1: Write failing tests** — `issueBindsResource`: issue with `resource: "https://app.example/mcp"` → `verifyAccess(t)` is `undefined`, `verifyAccess(t, {audience: "https://app.example/mcp"})` returns claims; `refreshKeepsResource`: refreshed token still only verifies with that audience; `refreshRejectsOtherResource`: `refresh(rt, {resource: "https://other/mcp"})` throws `InvalidTarget`; `loadFromTokenRefusesBoundToken`: a bound token gives an anonymous session through `loadFromToken`; `sessionFromAccessTokenWithAudience` returns a logged session with `scopes`/`clientId` set.
- [ ] **Step 2: Run** core token and manager specs — FAIL.
- [ ] **Step 3: Implement** as specified above.
- [ ] **Step 4: Run** — PASS; full core `pnpm test` — no regressions.
- [ ] **Step 5: Commit** `feat(core): access tokens bound to a resource (RFC 8707) (#901)`.

### Task 4: RFC 8707 `resource` in the OAuth server

**Files:**
- Modify: `packages/oauth/src/oauthserver.service.ts` (`AUTHORIZE_PARAMS` l.81-91, `authorize` l.459-525, `issueCode` l.791-804, `exchangeCode` l.1030-1070, `exchangeRefresh` l.1097-1109, `issueTokens` l.1186-1206, `toOAuthError` l.963, `accessFamily` l.1269-1272)
- Modify: `packages/oauth/src/pending.ts` (`PendingRequest.resource?`, `isPendingRequest`)
- Modify: `packages/oauth/src/models.model.ts` (`OAuthCode.resource?: string`)
- Modify: `packages/oauth/src/parameters.ts` (`OAuthClient.defaultResource?: string`, `validateClient`)
- Test: `packages/oauth/src/resource.spec.ts` (new, `@suite class ResourceIndicatorTest extends OAuthTest`)

**Interfaces:**
- Consumes: Task 2 `resolveProtectedResources`, Task 3 `IssueOptions.resource`, `refresh(..., {resource})`, `InvalidTarget`, `ACCESS_AUDIENCE`, `verifyAccess(token, {audience})`.
- Produces:
  - `protected resolveResource(ctx: WebContext, client: OAuthClient, requested?: string): string | undefined` — throws `OAuthError("invalid_target", ...)`. Rules: known = `resolveProtectedResources(this.issuer(ctx))`. `requested` set → must be in known. Absent → `client.defaultResource` if set (must be in known); else for registered (`dcr_`) and metadata-document clients: exactly one known → it, several → `invalid_target`, none → `undefined`; static clients without `defaultResource` → `undefined`.
  - `issueTokens(identity, clientId, scope, name?, resource?: string)` passes `resource` to `TokenService.issue`.
  - `toOAuthError` maps `InvalidTarget` → `invalid_target` (400).
  - `accessFamily` verifies with `audience: [ACCESS_AUDIENCE, ...resolveProtectedResources(issuer)]`.

- [ ] **Step 1: Write failing tests** (register `{path: "/mcp"}` in `beforeEach`, unregister in `afterEach`): `authorizeBindsResource` (explicit `resource=https://test.webda.io/mcp` → access token verifies only with that audience); `missingResourceDefaultsForMetadataClient`; `staticClientWithoutResourceKeepsAppAudience` (client `app` → `webda-access`); `unknownResourceRedirectsInvalidTarget` (302 to redirect_uri with `error=invalid_target`); `tokenResourceMismatch` (code issued for `/mcp`, `/token` with another `resource` → 400 `invalid_target`); `refreshKeepsAudience`; `revokeBoundAccessToken` (Review Focus 2: `/oauth/revoke` with the bound access token → family revoked, refresh fails).
- [ ] **Step 2: Run** `cd packages/oauth && npx vitest run src/resource.spec.ts` — FAIL.
- [ ] **Step 3: Implement** — add `resource` to `AUTHORIZE_PARAMS`, `PendingRequest` (+ validator), `OAuthCode`; resolve in `authorize` (errors through `fail`), store in `issueCode`, check `body.resource` in `exchangeCode`, pass through `exchangeRefresh` and `issueTokens`; `defaultResource` validated as an absolute https/http URL in `validateClient`.
- [ ] **Step 4: Run** the spec and full oauth `pnpm test` — PASS.
- [ ] **Step 5: Commit** `feat(oauth): RFC 8707 resource indicators (#901)`.

### Task 5: Registered clients: model, lookup, expiry

**Files:**
- Modify: `packages/oauth/src/models.model.ts` (new `OAuthRegisteredClient`)
- Modify: `packages/core/src/services/domainservice.service.ts:156` (`INTERNAL_MODELS` + `"Webda/OAuthRegisteredClient"`)
- Modify: `packages/oauth/src/models.spec.ts` (`IDS`)
- Modify: `packages/oauth/src/clients.ts` (`ClientRegistry.get`, export `isAcceptableRedirect`)
- Modify: `packages/oauth/src/parameters.ts` (`OAuthClient.registered?: boolean`; params `registrationUnusedTtl` 86400, `registrationIdleTtl` 7776000)
- Modify: `packages/oauth/src/oauthserver.service.ts` (`issueTokens`, `sweepExpired` l.295)
- Modify: `packages/oauth/src/test/oauthtest.ts` (AuthStore models list)
- Test: `packages/oauth/src/registeredclients.spec.ts`

**Interfaces:**
- Produces:
  - `OAuthRegisteredClient extends Model` (`@WebdaModel`, pk `uuid`): `uuid: string` (the `dcr_…` client id), `name: string`, `clientUri?: string`, `logoUri?: string`, `redirect_uris: string[]`, `scope?: string`, `createdAt: number`, `lastUsedAt?: number`, `expiresAt: number`, `ip: string`.
  - `ClientRegistry.get(clientId)`: after static clients, ids starting with `dcr_` load `OAuthRegisteredClient`; missing or `expiresAt <= now` → `undefined`. Mapped to `{ id, name, redirect_uris, logo: logoUri, client_uri: clientUri, defaultScope: scope, deviceFlow: false, registered: true }`.
  - `export function isAcceptableRedirect(uri: unknown): boolean` (rename of `isAcceptableDocumentRedirect`, now exported).
  - `protected async touchRegisteredClient(clientId: string): Promise<void>` on `OAuthServer`, called by `issueTokens` for `dcr_` ids: `patch({ lastUsedAt: now, expiresAt: now + registrationIdleTtl*1000 })`.
  - `sweepExpired` also removes expired `OAuthRegisteredClient`s, and for each: revokes every `RefreshToken` family with that `clientId` (`TokenService.revokeFamily`) and deletes its `OAuthGrant`s.

- [ ] **Step 1: Write failing tests** — `lookupRegisteredClient`; `expiredRegisteredClientUnknown`; `firstTokenExtendsExpiry` (created with `expiresAt = now + 86400s`, after code exchange `expiresAt ≈ now + 7776000s`); `sweepRevokesExpiredClient` (Review Focus 3: tokens issued, client expired, `sweepExpired()` → refresh 401 `invalid_client`, access token rejected by `verifyAccess`, grant gone); `internalModelsListed` via `models.spec.ts` `IDS`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; rebuild oauth (`pnpm run build`) to regenerate `webda.module.json`.
- [ ] **Step 4: Run** oauth and core `pnpm test` — PASS.
- [ ] **Step 5: Commit** `feat(oauth): registered client model and lifecycle (#901)`.

### Task 6: `POST {url}/register` (RFC 7591)

**Files:**
- Create: `packages/oauth/src/registration.ts`
- Modify: `packages/oauth/src/oauthserver.service.ts` (`resolve` l.236-260 route, `metadata` l.409-432, rate-limit maps, `countAttempts` l.1529, `pruneLookupFailures` l.1578)
- Modify: `packages/oauth/src/parameters.ts` (params below)
- Modify: `packages/oauth/src/test/oauthtest.ts` (`beforeEach` clears `registrationRequests`)
- Test: `packages/oauth/src/registration.spec.ts`

**Interfaces:**
- Consumes: Task 5 model and `isAcceptableRedirect`; Task 2 `listProtectedResources`; `iamGlobMatch` from `@webda/utils`.
- Produces:
  - Params: `registration?: "open" | "off"` (undefined → `"open"` when `listProtectedResources().length > 0`, else `"off"`, evaluated per request), `registrationRedirectPatterns?: string[]`, `registrationRateLimit: number` (20), `registrationRateWindow: number` (3600, seconds).
  - `export interface RegistrationRequest { redirect_uris: string[]; client_name?: string; client_uri?: string; logo_uri?: string; scope?: string }`
  - `export function parseRegistration(body: unknown, patterns?: string[]): RegistrationRequest` — throws `OAuthError("invalid_redirect_uri", …)` for redirect problems (not acceptable, > 20, empty, not matching a pattern) and `OAuthError("invalid_client_metadata", …)` for: non-object body; `token_endpoint_auth_method` other than `"none"`; `grant_types` outside `["authorization_code","refresh_token"]`; `response_types` other than `["code"]`; non-https `client_uri`/`logo_uri`; `client_name` > 100 chars. Unknown fields ignored.
  - `async register(ctx: WebContext): Promise<void>` on `OAuthServer`: `off` → 404; rate limit key `ip:<clientIp>` with window `registrationRateWindow` → 429 `slow_down`; creates `OAuthRegisteredClient` (`uuid = "dcr_" + randomToken(24)`, `scope` intersected with the server's `scopesSupported()`, `expiresAt = now + registrationUnusedTtl*1000`, `ip`); responds 201 JSON `{ client_id, client_id_issued_at, client_name, redirect_uris, grant_types: ["authorization_code","refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope? }` with `TOKEN_HEADERS`.
  - `countAttempts(attempts, key, now, window = LOOKUP_WINDOW)`; `pruneLookupFailures` prunes `registrationRequests` with its own window.
  - `metadata` adds `registration_endpoint` when registration is open.

- [ ] **Step 1: Write failing tests** — `registerLoopbackClient` (201, `client_id` starts with `dcr_`, then authorize with `http://127.0.0.1:5555/callback` succeeds); `registerCustomScheme` (`cursor://anysphere.cursor-retrieval/oauth/callback`); `registerHttpsCallback` (`https://claude.ai/api/mcp/auth_callback`); `registrationOffByDefaultWithoutResources` (404, no `registration_endpoint`); `registrationRejectsBadMetadata` (Review Focus 4: each listed bad body → 400 with the listed error, and no `OAuthRegisteredClient` stored); `registrationPatterns` (`["http://127.0.0.1/*"]` refuses `https://evil.example/cb`); `registrationRateLimited` (21st request from one IP → 429 `slow_down`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `registration.ts`, the route `${url}/register` POST (`hidden: true`), params, metadata.
- [ ] **Step 4: Run** oauth `pnpm test` — PASS.
- [ ] **Step 5: Commit** `feat(oauth): dynamic client registration (RFC 7591) (#901)`.

### Task 7: Consent for registered clients and additive grants

**Files:**
- Modify: `packages/oauth/src/oauthserver.service.ts` (`ConsentRequest.client` l.126-143, `consentGet` l.625-631, `remember` l.747-761)
- Modify: `packages/oauth/src/pages.ts` (`CONSENT_SCRIPT` l.141-265)
- Test: `packages/oauth/src/consent.spec.ts`, `packages/oauth/src/pages.spec.ts`

**Interfaces:**
- Consumes: Task 2 `union`; Task 5 `OAuthClient.registered`.
- Produces:
  - `ConsentRequest.client.verified: boolean` (`false` only for registered clients); for registered clients `host` = redirect URI host of the pending request, or the string `"local application"` for loopback http and private-use schemes.
  - Consent page: when `verified === false`, the name is shown in quotes followed by the notice exact copy `Unverified application: its name was chosen by whoever registered it.` using the existing `warning` class, plus `Redirects to <host>`.
  - `remember(userId, clientId, scope)`: when a non-expired grant exists, stores `formatScope(union(parseScope(existing.scope), scope))`; otherwise unchanged. The issued token's scope is the union as well when the remembered grant is still valid.

- [ ] **Step 1: Write failing tests** — `consentMarksRegisteredUnverified` (`OAuth.Consent.Get` → `client.verified === false`, `host === "local application"` for a loopback client, `"claude.ai"` for the https one); `staticClientVerified`; `pageShowsUnverifiedNotice` (rendered script contains the exact copy); `stepUpKeepsEarlierScope` (Review Focus 5: consent `Task.Get` remembered, re-authorize with `scope=Task.Update`, consent → token scope covers `Task.Get Task.Update`, remembered grant scope is the union).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** oauth `pnpm test` — PASS (update any existing test that asserted replacement semantics, noting it in the commit body).
- [ ] **Step 5: Commit** `feat(oauth): unverified consent notice and additive grants (#901)`.

### Task 8: MCP authenticator: `publicUrl` and audience check

**Files:**
- Modify: `packages/mcp/src/oauth.service.ts` (params l.15-40, `bindResource` l.69, `init` l.79, `absolute` l.94-105, `authenticate` l.168-179)
- Test: `packages/mcp/src/oauth.service.spec.ts` (update `bearer()` helper to pass `resource`)

**Interfaces:**
- Consumes: Task 2 `registerProtectedResource`; Task 3 `SessionManager.sessionFromAccessToken`.
- Produces:
  - `McpOAuthAuthenticatorParameters.publicUrl?: string` (absolute origin, trailing slash stripped in `load`).
  - `init()` registers each bound path: `registerProtectedResource({ path, uri: publicUrl ? publicUrl + path : undefined })`; without `publicUrl`, logs once `WARN` `McpOAuthAuthenticator: publicUrl is not set, the token audience is derived from the request host (development only)`. `stop()` unregisters.
  - `protected resourceUri(ctx: WebContext, path: string): string` — `publicUrl + path` when set, else today's `absolute(ctx, path)`. Used for the metadata `resource` field and the audience.
  - `authenticate(ctx)`: reads the `Bearer` token from `authorization`; `useService("SessionManager").sessionFromAccessToken(token, { audience: this.resourceUri(ctx, this.resourceFor(ctx)) })`; no/invalid token → `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="…"` (no `error` when no token was sent) and `Unauthorized`. Sets the session on the context (`ctx.setSession` or equivalent used by `handleHttp`) so `authInfo` is unchanged.

- [ ] **Step 1: Write failing tests** — `boundTokenAccepted`; `appAudienceTokenRefused` (token from `issue()` without resource → 401 with `error="invalid_token"`); `otherResourceRefused` (`aud = https://other.example/mcp`); `publicUrlBehindProxy` (Review Focus 1: `publicUrl: "https://mcp.example"`, request with `Host: internal:8080` and token `aud = https://mcp.example/mcp` → accepted; token `aud = https://internal:8080/mcp` → refused; metadata `resource` = `https://mcp.example/mcp`); `registersResource` (`listProtectedResources()` contains the bound path after init). Update `scopedTokenFiltersTools` and the other existing tests to mint bound tokens.
- [ ] **Step 2: Run** `cd packages/mcp && npx vitest run src/oauth.service.spec.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** mcp `pnpm test` — PASS.
- [ ] **Step 5: Commit** `feat(mcp): audience-bound bearer tokens and publicUrl (#901)`.

### Task 9: Out-of-scope tools: `insufficient_scope` and `listOutOfScopeTools`

**Files:**
- Modify: `packages/mcp/src/server.ts` (`McpServerOptions` l.32-57, `allowed` l.99-101, tools/list l.103-114, tools/call l.116-156)
- Modify: `packages/mcp/src/mcpservice.service.ts` (`McpServiceParameters` l.31-119, `createServer` l.266, `handleHttp` l.325-387)
- Test: `packages/mcp/src/oauth.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 `probeOperation`, `InsufficientScope`; Task 2 `union`, `formatScope`.
- Produces:
  - `McpServiceParameters.listOutOfScopeTools: boolean` (default `false`), passed as `McpServerOptions.listOutOfScopeTools?: boolean`.
  - `async function toolAccess(context: SimpleOperationContext, operationId: string): Promise<"allowed" | "out_of_scope" | "denied">` in `server.ts` (`probeOperation` → `true` / `"insufficient_scope"` / anything else).
  - tools/list: include `allowed`, plus `out_of_scope` when `listOutOfScopeTools`.
  - tools/call: unknown or `denied` → unchanged `McpError(InvalidParams, "Unknown tool: <name>")`; `out_of_scope` → `McpError(-32001, "insufficient_scope", { error: "insufficient_scope", scope: <challenge scope> })`, challenge scope = `formatScope(union(session.scopes ?? [], [operationId]))`.
  - `handleHttp`: for a single (non-batch) `tools/call` request whose tool is `out_of_scope`, answer before the SDK transport with HTTP 403, `WWW-Authenticate: Bearer error="insufficient_scope", scope="<challenge scope>", resource_metadata="<metadata url>"` and the JSON-RPC error body above (via `jsonRpcError`-style writer). Needs `protected toolOperation(name: string): string | undefined` on `McpService` from its tool registry.

- [ ] **Step 1: Write failing tests** — `outOfScopeHiddenByDefault` (token `Task.Get`: `tools/list` lacks `Task.Update`); `outOfScopeCallChallenged` (HTTP POST `tools/call` `Task.Update` → 403, header with `scope="Task.Get Task.Update"`); `permissionDeniedStillUnknown` (admin-only tool, non-admin → `Unknown tool`); `listOutOfScopeToolsOption` (`listOutOfScopeTools: true` → `Task.Update` listed, admin-only tool not listed). Replace the `/Unknown tool/` assertion in `scopedTokenFiltersTools` with the 403 challenge.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** mcp `pnpm test` — PASS.
- [ ] **Step 5: Commit** `feat(mcp): insufficient_scope challenge and listOutOfScopeTools (#901)`.

### Task 10: End-to-end per client type, docs

**Files:**
- Create: `packages/oauth/src/mcp-e2e.spec.ts` (needs `@webda/mcp` as an oauth devDependency; if that creates a build cycle, place it in `sample-apps/blog-system` tests instead and note why)
- Modify: `docs/pages/Modules/oauth/README.md` (new `### Dynamic client registration` under `## Clients`; `resource` in `## MCP`; parameters table)
- Modify: `packages/mcp/README.md` and `docs/pages/Modules/mcp/README.md` (`### OAuth`: `publicUrl`, audience binding, `insufficient_scope`, `listOutOfScopeTools`)
- Create: `docs/pages/Modules/mcp/ConnectingAgents.md` — minimal config (OAuthServer + McpOAuthAuthenticator with `publicUrl` + McpService), then one short section each for Claude Code, claude.ai, ChatGPT, Cursor, VS Code, Codex CLI, Gemini CLI.

**Interfaces:**
- Consumes: everything above; real router + HTTP server on port 0 as in `packages/oauth/src/e2e.spec.ts` and an SDK `Client` over `StreamableHTTPClientTransport` as in `packages/mcp/src/oauth.service.spec.ts`.

- [ ] **Step 1: Write the e2e tests** — one `@test` per redirect type (loopback `http://127.0.0.1:<port>/callback`, `cursor://…`, `https://claude.ai/api/mcp/auth_callback`), each: fetch `/.well-known/oauth-protected-resource` → AS metadata → `/register` → `/authorize` (one with `resource`, one without) → login → consent → `/token` → MCP `tools/list` → in-scope call OK → out-of-scope call 403 challenge → `/token` refresh → `/revoke` → MCP 401. Plus one run with `listOutOfScopeTools: true`: tool listed, challenged, re-authorize with the challenge scope, call succeeds, earlier tool still callable.
- [ ] **Step 2: Run** — expect PASS (all features exist); fix any integration gap found, with a regression test in the owning package.
- [ ] **Step 3: Write the docs.**
- [ ] **Step 4: Full verification** — `pnpm run build` at root; `pnpm test` in core, oauth, mcp, auth; lint and prettier clean.
- [ ] **Step 5: Commit** `test(oauth): MCP end-to-end per client type; docs for connecting agents (#901)`.
- [ ] **Step 6: Manual check (before release, recorded in the PR):** connect Claude Code and Cursor (or VS Code) to the blog-system sample with this config; note result per client.
