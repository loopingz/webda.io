import { createHash, timingSafeEqual } from "node:crypto";
import {
  ACCESS_AUDIENCE,
  callOperation,
  canCallOperation,
  collapse,
  covers,
  expand,
  formatScope,
  type HttpMethodType,
  intersect,
  type IssuedTokens,
  InvalidScope,
  InvalidTarget,
  listProtectedResources,
  listOperations,
  OFFLINE_ACCESS,
  Operation,
  OperationIdTransport,
  operationGlobs,
  parseScope,
  RefreshToken,
  resolveProtectedResources,
  runAsSystem,
  type Scope,
  scopeMatches,
  Service,
  Session,
  TokenInvalid,
  type TokenService,
  union,
  useContext,
  useCrypto,
  useCore,
  useService,
  type WebContext,
  WebdaError
} from "@webda/core";
import { OAuthError } from "./errors.js";
import { parseRegistration } from "./registration.js";
import { ClientRegistry, rateLimitKey, REGISTERED_PREFIX } from "./clients.js";
import {
  formatUserCode,
  generateUserCode,
  normalizeUserCode,
  randomToken,
  sha256,
  splitDeviceCode
} from "./devicecode.js";
import { type GrantIdentity, OAuthCode, OAuthDeviceCode, OAuthGrant, OAuthRegisteredClient } from "./models.model.js";
import { type OAuthClient, OAuthServerParameters } from "./parameters.js";
import { type PendingRequest, PENDING_TTL, readPending, writePending } from "./pending.js";
import { consentHtml, deviceHtml, errorHtml, MAX_ECHO, newNonce, pageHeaders, resultHtml } from "./pages.js";

/** Name of the pending request cookie */
export const PENDING_COOKIE = "webda_oauth_pending";
/** Maximum length of the `state` parameter */
const MAX_STATE = 256;
/** Maximum length of the `scope` parameter */
const MAX_SCOPE = 1024;
/** Maximum length of the `hostname` parameter */
const MAX_HOSTNAME = 64;
/** Device authorization grant type (RFC 8628) */
export const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
/** PKCE code_verifier: 43 to 128 unreserved characters (RFC 7636 §4.1) */
const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
/** Maximum size of a token request body */
const MAX_TOKEN_BODY = 64 * 1024;
/** Headers of every token endpoint response (RFC 6749 §5.1) */
const TOKEN_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache" };
/** Maximum number of records deleted per query by a sweep pass */
const SWEEP_BATCH = 100;
/** Longest user code prefilled by the device page */
const USER_CODE_MAX = 32;
/** Attempts at drawing a free user code */
const USER_CODE_ATTEMPTS = 5;
/** Window of the device lookup rate limit (ms) */
const LOOKUP_WINDOW = 10 * 60 * 1000;
/** Failed device lookups allowed per browser session in the window */
const LOOKUP_SESSION_FAILURES = 5;
/** Failed device lookups allowed per client IP in the window */
const LOOKUP_IP_FAILURES = 20;
/** Device authorization requests allowed per client IP in the window: each one stores a device code */
const DEVICE_AUTHORIZATION_IP_LIMIT = 20;
/** Maximum number of tracked rate limit keys: the oldest are dropped beyond */
const LOOKUP_MAX_KEYS = 10_000;
/** Query parameters of the authorization endpoint */
const AUTHORIZE_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "prompt",
  "hostname",
  "resource"
];

/** Browser operations served on routes below `url`: method, path, operation */
const BROWSER_OPERATIONS: [HttpMethodType, string, string][] = [
  ["GET", "/consent/request", "OAuth.Consent.Get"],
  ["POST", "/consent/decide", "OAuth.Consent.Decide"],
  ["POST", "/device/lookup", "OAuth.Device.Lookup"]
];

/** Live refresh family of a connected app */
export interface ConnectedSession {
  /** Refresh family */
  family: string;
  /** Client the family was issued to */
  clientId: string;
  /** Display name, e.g. "Webda CLI on remi-mbp" */
  name?: string;
  /** Granted scope */
  scope?: string;
  /** Creation, ms since epoch, when known */
  createdAt?: number;
  /** Last refresh, ms since epoch */
  lastUsedAt?: number;
}

/** Host shown for unverified clients redirecting to the machine of the user */
const LOCAL_APPLICATION = "local application";

/** Remembered consent of the user for a client */
export interface RememberedGrant {
  clientId: string;
  scope: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
}

/** Consent request shown to the user */
export interface ConsentRequest {
  /** Authorization code or device flow */
  flow: "code" | "device";
  /** Requesting client */
  client: { id: string; name: string; logo?: string; uri?: string; host?: string; verified: boolean };
  /** Signed-in user */
  user: { id: string; name?: string };
  /** Hostname of the device requesting access */
  hostname?: string;
  /** Requested operations the user can call, by first segment */
  operations: {
    group: string;
    ids: { id: string; summary?: string; preselected: boolean; alreadyAllowed?: boolean }[];
  }[];
  /** A refresh token is requested */
  offlineAccess: boolean;
  /** The decision can be remembered */
  rememberable: boolean;
  /** CSRF token to send back with the decision */
  csrf: string;
}

/** Successful token endpoint response (RFC 6749 §5.1) */
export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  /** Access token lifetime (s) */
  expires_in: number;
  /** Granted scope */
  scope: string;
  /** Only when `offline_access` is granted */
  refresh_token?: string;
}

/**
 * @returns the error for an authorization code that cannot be exchanged: one description for every cause
 */
function invalidCode(): OAuthError {
  return new OAuthError("invalid_grant", "Invalid authorization code");
}

/**
 * @param a - received secret
 * @param b - expected secret
 * @returns true when equal, compared in constant time
 */
function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * @param value - configured resource
 * @returns true when it is an absolute http(s) URI without fragment (RFC 8707 §2)
 */
function isResourceUri(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.hash && !value.includes("#");
  } catch {
    return false;
  }
}

/**
 * @param url - base URL, possibly with a query
 * @param params - parameters to append, undefined values are skipped
 * @returns the URL with the parameters
 */
function withQuery(url: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined)
  ).toString();
  return query ? `${url}${url.includes("?") ? "&" : "?"}${query}` : url;
}

/**
 * @param session - logged-in session
 * @returns the identity carried by the issued tokens
 */
function identityOf(session: Session): GrantIdentity {
  return {
    userId: session.userId!,
    identId: session.identUsed,
    provider: session.provider,
    amr: session.amr ?? [],
    ...(session.mfaAt !== undefined ? { mfaAt: session.mfaAt } : {}),
    ...(session.mfaVerifications && Object.keys(session.mfaVerifications).length > 0
      ? { mfaVerifications: session.mfaVerifications }
      : {}),
    mfa: session.mfa ?? "none"
  };
}

/**
 * OAuth 2.1 authorization server issuing scoped TokenService tokens to native and MCP clients
 *
 * Routes:
 * - `GET /.well-known/oauth-authorization-server`: server metadata (RFC 8414)
 * - `GET <url>/authorize`: authorization endpoint (code flow, PKCE S256 only)
 *
 * - `POST <url>/token`: token endpoint (authorization code, refresh token and device code grants)
 * - `POST <url>/revoke`: revocation endpoint (RFC 7009)
 * - `POST <url>/device_authorization`: device authorization endpoint (RFC 8628)
 *
 * Browser operations (browser session, pending request cookie), hidden from the transports and served on routes of
 * their own below `url`, the path of the pending request cookie, whatever transports are configured:
 * - `GET <url>/consent/request`: `OAuth.Consent.Get`
 * - `POST <url>/consent/decide`: `OAuth.Consent.Decide`
 * - `POST <url>/device/lookup`: `OAuth.Device.Lookup`
 *
 * Connected apps operations (logged-in user, own records only): `OAuth.Sessions`, `OAuth.Grants`, `OAuth.Revoke`,
 * `OAuth.Forget`
 *
 * @WebdaModda OAuthServer
 */
export class OAuthServer<T extends OAuthServerParameters = OAuthServerParameters> extends Service<T> {
  /** Client resolution */
  clients: ClientRegistry;
  /** Periodic sweep of the expired OAuth records */
  protected sweepTimer?: ReturnType<typeof setInterval>;
  /** Sweep in progress: a new sweep joins it */
  protected sweeping?: Promise<number>;
  /** Times of the recent failed device lookups, by `session:<uuid>` and `ip:<client ip>` */
  lookupFailures: Map<string, number[]> = new Map();
  /** Times of the recent device authorization requests, by `ip:<client ip>` */
  deviceRequests: Map<string, number[]> = new Map();
  /** Times of the recent client registrations, by `ip:<client ip>` */
  registrationRequests: Map<string, number[]> = new Map();

  /** @override */
  resolve(): this {
    super.resolve();
    if (!this.parameters.loginUrl) {
      throw new WebdaError.CodeError("OAUTH_LOGIN_URL", "OAuthServer requires the 'loginUrl' parameter");
    }
    this.checkRemoteResources();
    this.clients = new ClientRegistry(this.parameters);
    const url = this.parameters.url;
    this.addRoute("/.well-known/oauth-authorization-server", ["GET"], this.metadata, { hidden: true });
    this.addRoute(`${url}/authorize{?${AUTHORIZE_PARAMS.map(p => `${p}?`).join(",")}}`, ["GET"], this.authorize, {
      hidden: true
    });
    this.addRoute(`${url}/token`, ["POST"], this.token, { hidden: true });
    this.addRoute(`${url}/revoke`, ["POST"], this.revoke, { hidden: true });
    this.addRoute(`${url}/device_authorization`, ["POST"], this.deviceAuthorization, { hidden: true });
    this.addRoute(`${url}/register`, ["POST"], this.register, { hidden: true });
    this.addRoute(`${url}/consent`, ["GET"], this.consentPage, { hidden: true });
    this.addRoute(`${url}/device{?user_code?}`, ["GET"], this.devicePage, { hidden: true });
    this.addRoute(`${url}/done{?status?,error?}`, ["GET"], this.resultPage, { hidden: true });
    // The browser operations are hidden from the transports: served here, below the pending cookie path
    for (const [method, path, operationId] of BROWSER_OPERATIONS) {
      this.addRoute(`${url}${path}`, [method], (ctx: WebContext) => this.browserOperation(ctx, operationId), {
        hidden: true
      });
    }
    return this;
  }

  /** @override */
  async init(): Promise<this> {
    await super.init();
    const sweep = () => this.sweep().catch(err => this.log("WARN", "OAuth sweep failed", err));
    await sweep();
    this.sweepTimer = setInterval(sweep, this.parameters.codeTtl * 10 * 1000);
    this.sweepTimer.unref();
    return this;
  }

  /**
   * Remote resources verify the tokens from the issuer keys: they need a fixed issuer, an asymmetric signature and
   * the published JWKS
   * @throws CodeError OAUTH_REMOTE_RESOURCES when the configuration cannot serve them
   */
  protected checkRemoteResources(): void {
    const { resources, issuer } = this.parameters;
    const fail = (reason: string) => {
      throw new WebdaError.CodeError("OAUTH_REMOTE_RESOURCES", `OAuthServer resources: ${reason}`);
    };
    if (!Array.isArray(resources)) fail("must be an array of absolute URIs");
    for (const resource of resources) {
      if (!isResourceUri(resource)) fail(`${JSON.stringify(resource)} is not an absolute http(s) URI without fragment`);
    }
    if (!resources.length) return;
    if (!issuer) fail("the 'issuer' parameter is required");
    const crypto = useCrypto();
    const algorithm = crypto.getParameters().jwt?.algorithm ?? "HS256";
    if (algorithm.startsWith("HS")) fail(`the CryptoService must sign with an asymmetric algorithm, not ${algorithm}`);
    if (!crypto.getJWKSUrl()) fail("the CryptoService must publish its JWKS (set its 'url')");
  }

  /** @returns the issuer of the access tokens, undefined when the issuer is not configured */
  protected tokenIssuer(): string | undefined {
    return this.parameters.issuer?.replace(/\/$/, "");
  }

  /** @override */
  async stop(): Promise<void> {
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
    await super.stop();
  }

  /**
   * Delete the expired OAuth records: authorization codes an access token lifetime after their expiry (a used code is
   * kept that long to detect its reuse), device codes and remembered consents once expired. A sweep started while
   * another runs joins it
   * @returns number of deleted records
   */
  sweep(): Promise<number> {
    this.sweeping ??= runAsSystem(() => this.sweepExpired()).finally(() => {
      this.sweeping = undefined;
    });
    return this.sweeping;
  }

  /**
   * @returns number of deleted records
   */
  protected async sweepExpired(): Promise<number> {
    const now = Date.now();
    this.pruneLookupFailures(now);
    const codeLimit = now - this.accessTtl() * 1000;
    let removed = await this.sweepBatches(
      () => OAuthCode.iterate("expiresAt < ?", [codeLimit]),
      async code => {
        await code.ref().delete();
        return true;
      }
    );
    removed += await this.sweepBatches(
      () => OAuthDeviceCode.iterate("expiresAt < ?", [now]),
      async device => {
        await device.ref().delete();
        return true;
      }
    );
    removed += await this.sweepBatches(
      () => OAuthGrant.iterate("expiresAt < ?", [now]),
      async grant => {
        // A re-consent since the read extended the grant: it survives; a grant forgotten since the read is skipped
        try {
          await grant.ref().delete("expiresAt" as any, grant.expiresAt as any);
          return true;
        } catch (err) {
          if (!this.isConditionFailure(err) && (await grant.ref().exists())) throw err;
          return false;
        }
      }
    );
    removed += await this.sweepBatches(
      () => OAuthRegisteredClient.iterate("expiresAt < ?", [now]),
      async client => {
        await this.revokeRegisteredClient(client.uuid);
        // A use since the read extended the client: it survives (its tokens were revoked with it, as it was expired)
        try {
          await client.ref().delete("expiresAt" as any, client.expiresAt as any);
          return true;
        } catch (err) {
          if (!this.isConditionFailure(err) && (await client.ref().exists())) throw err;
          return false;
        }
      }
    );
    return removed;
  }

  /**
   * Revoke every refresh family issued to a client and forget the consents given to it
   * @param clientId - client
   */
  protected async revokeRegisteredClient(clientId: string): Promise<void> {
    const families = new Set<string>();
    for await (const token of RefreshToken.iterate("clientId = ?", [clientId])) families.add(token.family);
    for (const family of families) await this.tokenService().revokeFamily(family);
    const grants: OAuthGrant[] = [];
    for await (const grant of OAuthGrant.iterate("clientId = ?", [clientId])) grants.push(grant);
    for (const grant of grants) await grant.ref().delete();
  }

  /**
   * Delete matching records by batches: a batch is read, then deleted, so deleting never shifts the pages of a running
   * query. Repeated until a batch is not full or deletes nothing
   * @param query - query of the records to delete, run again for each batch
   * @param remove - delete a record, false when it was kept
   * @returns number of deleted records
   */
  protected async sweepBatches<M>(
    query: () => AsyncIterable<M>,
    remove: (item: M) => Promise<boolean>
  ): Promise<number> {
    let removed = 0;
    for (;;) {
      const batch: M[] = [];
      for await (const item of query()) {
        batch.push(item);
        if (batch.length >= SWEEP_BATCH) break;
      }
      let deleted = 0;
      for (const item of batch) {
        if (await remove(item)) deleted++;
      }
      removed += deleted;
      if (batch.length < SWEEP_BATCH || deleted === 0) return removed;
    }
  }

  /**
   * @returns lifetime of the issued access tokens (s)
   */
  protected accessTtl(): number {
    return this.parameters.accessTtl ?? this.tokenService().getParameters().accessTtl;
  }

  /**
   * The configured issuer, or the origin of the request as computed by the HTTP layer (which only honors the
   * forwarded headers of trusted proxies)
   * @param ctx - web context
   * @returns issuer URL, without trailing slash
   */
  issuer(ctx: WebContext): string {
    return (this.parameters.issuer ?? ctx.getHttpContext().getAbsoluteUrl("/")).replace(/\/$/, "");
  }

  /**
   * @param ctx - web context
   * @param kind - page
   * @returns absolute URL of the page: the configured one, or the built-in page
   */
  pageUrl(ctx: WebContext, kind: "consent" | "device" | "result"): string {
    const configured = {
      consent: this.parameters.consentUrl,
      device: this.parameters.deviceUrl,
      result: this.parameters.resultUrl
    }[kind];
    const path = configured ?? `${this.parameters.url}/${kind === "result" ? "done" : kind}`;
    return /^https?:\/\//.test(path) ? path : `${this.issuer(ctx)}${path}`;
  }

  /**
   * @param ctx - web context
   * @returns path of the pending request cookie: the server url, below the deployment prefix
   */
  protected pendingPath(ctx: WebContext): string {
    return new URL(ctx.getHttpContext().getAbsoluteUrl(this.parameters.url)).pathname;
  }

  /**
   * @returns the operation-id transport, if one is configured
   */
  protected findOperationsTransport(): OperationIdTransport | undefined {
    return Object.values(useCore().getServices()).find(
      (service): service is OperationIdTransport => service instanceof OperationIdTransport
    );
  }

  /**
   * Authorization server metadata (RFC 8414)
   * @param ctx - web context
   */
  async metadata(ctx: WebContext): Promise<void> {
    const issuer = this.issuer(ctx);
    const base = `${issuer}${this.parameters.url}`;
    const operations = this.findOperationsTransport();
    const jwks = useCrypto().getJWKSUrl();
    // The issuer may come from the request Host: never let a shared cache keep it
    ctx.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Host" });
    ctx.write(
      JSON.stringify({
        issuer,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        revocation_endpoint: `${base}/revoke`,
        jwks_uri: jwks ? `${issuer}${jwks}` : undefined,
        device_authorization_endpoint: `${base}/device_authorization`,
        registration_endpoint: this.registrationOpen() ? `${base}/register` : undefined,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: this.scopesSupported(),
        client_id_metadata_document_supported: this.parameters.clientMetadataDocuments,
        webda_result_uri: this.pageUrl(ctx, "result"),
        webda_operations_uri: operations ? `${issuer}${operations.getParameters().url}` : undefined
      })
    );
  }

  /**
   * @returns true when dynamic client registration is open: configured, or a protected resource is registered
   */
  protected registrationOpen(): boolean {
    return (this.parameters.registration ?? (listProtectedResources().length > 0 ? "open" : "off")) === "open";
  }

  /**
   * @param requested - scope string of a registration
   * @returns the requested scope tokens the server advertises, undefined when none
   */
  protected supportedScope(requested: string): string | undefined {
    const supported = parseScope(this.scopesSupported().join(" "));
    const kept = requested.split(/\s+/).filter(token => {
      try {
        return token !== "" && covers(supported, parseScope(token));
      } catch {
        return false;
      }
    });
    return kept.length ? kept.join(" ") : undefined;
  }

  /**
   * Dynamic client registration endpoint (RFC 7591): public clients only, rate limited per client IPv4 address or
   * IPv6 /64 prefix. `404` when registration is off
   * @param ctx - web context
   */
  async register(ctx: WebContext): Promise<void> {
    if (!this.registrationOpen()) {
      ctx.writeHead(404, TOKEN_HEADERS);
      ctx.write(JSON.stringify({ error: "not_found", error_description: "Registration is not enabled" }));
      return;
    }
    let status = 201;
    let payload: Record<string, unknown>;
    try {
      const clientIp = ctx.getHttpContext()?.getClientIp();
      const ip = clientIp ?? "unknown";
      // IPv6 clients share the bucket of their /64; requests without a client address share `ip:unknown`
      const key = rateLimitKey(clientIp);
      const now = Date.now();
      const window = this.parameters.registrationRateWindow * 1000;
      if (this.countAttempts(this.registrationRequests, key, now, window) >= this.parameters.registrationRateLimit) {
        throw new OAuthError("slow_down", "Too many registration requests", 429);
      }
      this.recordAttempt(this.registrationRequests, [key], now);
      let body: unknown;
      try {
        const type = ctx.getHttpContext().getUniqueHeader("content-type", "").split(";")[0].trim().toLowerCase();
        if (type !== "application/json") throw new Error("content type");
        body = JSON.parse(await ctx.getRawInputAsString(MAX_TOKEN_BODY));
      } catch {
        throw new OAuthError("invalid_client_metadata", "A JSON body is required");
      }
      const request = parseRegistration(body, this.parameters.registrationRedirectPatterns);
      const scope = request.scope === undefined ? undefined : this.supportedScope(request.scope);
      const client = await OAuthRegisteredClient.create({
        uuid: `${REGISTERED_PREFIX}${randomToken(24)}`,
        name: request.client_name ?? "Unnamed client",
        clientUri: request.client_uri,
        logoUri: request.logo_uri,
        redirect_uris: request.redirect_uris,
        scope,
        createdAt: now,
        expiresAt: now + this.parameters.registrationUnusedTtl * 1000,
        ip
      } as any);
      payload = {
        client_id: client.uuid,
        client_id_issued_at: Math.floor(now / 1000),
        client_name: client.name,
        // RFC 7591 §3.2.1: the registered metadata, undefined (absent) when not sent
        client_uri: client.clientUri,
        logo_uri: client.logoUri,
        redirect_uris: client.redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope
      };
    } catch (err) {
      const oauth = this.toOAuthError(err);
      status = oauth.getResponseCode();
      payload = oauth.toJSON();
    }
    ctx.writeHead(status, TOKEN_HEADERS);
    ctx.write(JSON.stringify(payload));
  }

  /**
   * @returns the operations a delegated token may be granted: all but the OAuth operations, which manage consent
   * and only serve browser sessions
   */
  protected delegableOperations(): string[] {
    return Object.keys(listOperations()).filter(id => !id.startsWith("OAuth."));
  }

  /**
   * @returns advertised scopes: configured, or `*`, the top-level operation groups and `offline_access`
   */
  protected scopesSupported(): string[] {
    if (this.parameters.scopesSupported) return this.parameters.scopesSupported;
    const groups = new Set(this.delegableOperations().map(id => `${id.split(".")[0]}.*`));
    return ["*", ...groups, OFFLINE_ACCESS];
  }

  /**
   * Authorization endpoint: validate the request, keep it in the pending cookie and send the browser to the login
   * or the consent page.
   *
   * Errors before the client and its redirect_uri are validated render an error page and never redirect
   * @param ctx - web context
   * @returns once the response is written
   */
  async authorize(ctx: WebContext): Promise<void> {
    const p = (name: string): string | undefined => {
      const v = ctx.parameter(name);
      return typeof v === "string" ? v : undefined;
    };
    const client = await this.clients.get(p("client_id")!);
    const redirectUri = p("redirect_uri");
    if (!client || !redirectUri || !this.clients.matchRedirect(client, redirectUri)) {
      return this.errorPage(ctx, 400, "Unknown client or redirect URI");
    }
    const rawState = p("state");
    // An oversized state is not echoed: it could not be kept in the pending cookie anyway
    const state = rawState !== undefined && rawState.length <= MAX_STATE ? rawState : undefined;
    const fail = (error: string, description: string) =>
      this.redirectWith(ctx, redirectUri, { error, error_description: description, state });
    if (rawState !== undefined && state === undefined) return fail("invalid_request", "state is too long");
    if (p("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported");
    const challenge = p("code_challenge");
    if (p("code_challenge_method") !== "S256" || !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
      return fail("invalid_request", "PKCE S256 required");
    }
    let scope: Scope;
    try {
      scope = this.requestedScope(client, p("scope"));
    } catch (err) {
      return fail("invalid_scope", (err as Error).message);
    }
    let resource: string | undefined;
    try {
      // A repeated resource is refused (the router keeps a single value of a repeated query parameter)
      const url = new URL(ctx.getHttpContext().getUrl(), "http://localhost");
      if (url.searchParams.getAll("resource").length > 1) {
        throw new OAuthError("invalid_target", "A single resource is supported");
      }
      resource = this.resolveResource(ctx, client, p("resource"));
    } catch (err) {
      return fail("invalid_target", (err as Error).message);
    }
    const pending: PendingRequest = {
      flow: "code",
      clientId: client.id,
      redirectUri,
      state,
      codeChallenge: challenge,
      scope: formatScope(scope),
      hostname: this.cleanHostname(p("hostname")),
      resource,
      csrf: randomToken(24),
      expires: Date.now() + PENDING_TTL * 1000
    };
    const prompt = p("prompt");
    const session = ctx.getSession();
    // A bearer (scoped) or MFA-pending session cannot drive the authorization endpoint
    if (!session?.isLogged() || session.mfa === "pending" || session.scopes !== undefined) {
      if (prompt === "none") return fail("login_required", "Login required");
      if (!(await writePending(ctx, PENDING_COOKIE, this.pendingPath(ctx), pending))) {
        return fail("invalid_request", "Authorization request is too large");
      }
      const login = this.parameters.loginUrl;
      return this.redirect(
        ctx,
        `${login}${login.includes("?") ? "&" : "?"}redirect=${encodeURIComponent(this.pageUrl(ctx, "consent"))}`
      );
    }
    if (prompt !== "consent") {
      // A remembered grant is per client, not per resource: it never answers for another application
      const remembered = this.isRemoteResource(ctx, resource)
        ? undefined
        : await this.rememberedScope(session.userId!, client.id);
      if (remembered && (await this.rememberedCovers(ctx, remembered, scope))) {
        await this.touchGrant(session.userId!, client.id);
        return this.approveCode(ctx, pending, intersect(scope, remembered));
      }
      if (prompt === "none") return fail("consent_required", "Consent required");
    }
    // Bound to the signed-in user: consent from another user of the browser is refused
    pending.userId = session.userId;
    if (!(await writePending(ctx, PENDING_COOKIE, this.pendingPath(ctx), pending))) {
      return fail("invalid_request", "Authorization request is too large");
    }
    return this.redirect(ctx, this.pageUrl(ctx, "consent"));
  }

  /**
   * Scope of an authorization request
   * @param client - requesting client
   * @param raw - `scope` parameter, the client default scope when absent
   * @returns the parsed scope
   * @throws InvalidScope when too long, malformed, beyond the client allowed scope or without any operation
   */
  protected requestedScope(client: OAuthClient, raw: string | undefined): Scope {
    const value = raw ?? client.defaultScope ?? "";
    if (value.length > MAX_SCOPE) throw new InvalidScope("Scope is too long");
    const scope = parseScope(value);
    if (client.allowedScopes !== undefined && !covers(parseScope(client.allowedScopes), scope)) {
      throw new InvalidScope("Scope exceeds what the client may request");
    }
    if (!operationGlobs(scope).length) throw new InvalidScope("No operation requested");
    return scope;
  }

  /**
   * Resource the tokens of an authorization request are bound to (RFC 8707): only a registered protected resource.
   * Without `resource`, the client default resource; else, for registered and metadata document clients, the only
   * registered resource; static clients without a default resource get tokens bound to no resource. The `resources`
   * of other applications are accepted when named, never chosen by default
   * @param ctx - web context
   * @param client - requesting client
   * @param requested - `resource` parameter
   * @returns the absolute URI of the resource, undefined for tokens bound to no resource
   * @throws OAuthError invalid_target when the resource is not registered or cannot be chosen
   */
  protected resolveResource(ctx: WebContext, client: OAuthClient, requested?: string): string | undefined {
    const known = resolveProtectedResources(this.issuer(ctx));
    const target = requested ?? client.defaultResource;
    if (target !== undefined) {
      if (!known.includes(target) && !this.parameters.resources.includes(target)) {
        throw new OAuthError("invalid_target", "Unknown resource");
      }
      return target;
    }
    if (!client.id.startsWith("dcr_") && !client.metadataDocument) return undefined;
    if (known.length > 1) throw new OAuthError("invalid_target", "A resource parameter is required");
    return known[0];
  }

  /**
   * @param ctx - web context
   * @param resource - resource of a request
   * @returns true for a resource of another application (`resources`): its operations and their permissions are not
   * known here
   */
  protected isRemoteResource(ctx: WebContext, resource: string | undefined): boolean {
    return (
      resource !== undefined &&
      this.parameters.resources.includes(resource) &&
      !resolveProtectedResources(this.issuer(ctx)).includes(resource)
    );
  }

  /**
   * Scope entries offered for a resource of another application: the requested globs as they are, the remote
   * application enforcing its own permissions
   * @param requested - requested scope
   * @returns the requested entries but `offline_access`
   */
  protected remoteEntries(requested: Scope): string[] {
    return requested.filter(s => s !== OFFLINE_ACCESS);
  }

  /**
   * Remembered consent of a user for a client
   * @param userId - user
   * @param clientId - client
   * @returns the remembered scope, undefined when none, expired or when remembering consent is disabled
   */
  protected async rememberedScope(userId: string, clientId: string): Promise<Scope | undefined> {
    if (!this.parameters.rememberConsent) return undefined;
    const ref = OAuthGrant.ref(`${userId}:${clientId}`);
    if (!(await ref.exists())) return undefined;
    const grant = await ref.get();
    if (!(grant.expiresAt > Date.now())) return undefined;
    return parseScope(grant.scope);
  }

  /**
   * Whether a remembered consent answers a request: it covers every operation the request matches that the user can
   * call now (an operation added or made callable since is asked again), grants at least one of them, and
   * `offline_access` when requested. Checked on operations, not globs: a `*` request remembered as group globs is
   * answered
   * @param ctx - web context of the user
   * @param remembered - remembered scope
   * @param requested - requested scope
   * @returns true when the consent page can be skipped
   */
  protected async rememberedCovers(ctx: WebContext, remembered: Scope, requested: Scope): Promise<boolean> {
    if (requested.includes(OFFLINE_ACCESS) && !remembered.includes(OFFLINE_ACCESS)) return false;
    const callable = await this.callableOperations(ctx, requested);
    return callable.length > 0 && callable.every(id => scopeMatches(remembered, id));
  }

  /**
   * Record the use of a remembered consent
   * @param userId - user
   * @param clientId - client
   */
  protected async touchGrant(userId: string, clientId: string): Promise<void> {
    await OAuthGrant.ref(`${userId}:${clientId}`).patch({ lastUsedAt: Date.now() });
  }

  /**
   * @param hostname - untrusted hostname shown on the consent page
   * @returns the hostname without control or format (bidi, zero-width) characters, capped; undefined when empty
   */
  protected cleanHostname(hostname: string | undefined): string | undefined {
    const clean = hostname
      ?.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "")
      .trim()
      .slice(0, MAX_HOSTNAME);
    return clean || undefined;
  }

  /**
   * Pending consent request of the browser
   * @returns the request to display
   */
  @Operation({ id: "OAuth.Consent.Get", hidden: true })
  async consentGet(): Promise<ConsentRequest> {
    const ctx = useContext<WebContext>();
    const pending = await this.requirePending(ctx);
    const client = await this.clients.get(pending.clientId);
    if (!client) throw new WebdaError.BadRequest("Unknown client");
    const requested = parseScope(pending.scope);
    const ops = listOperations();
    const remote = this.isRemoteResource(ctx, pending.resource);
    const callable = remote ? this.remoteEntries(requested) : await this.callableOperations(ctx, requested);
    const userId = ctx.getSession().userId!;
    // Consent is never skipped for the device flow, the remembered scope only pre-selects in the code flow; it is
    // never used for a remote resource
    const remembered = pending.flow === "code" && !remote ? await this.rememberedScope(userId, client.id) : undefined;
    // The decision adds to the remembered grant (step-up): its operations outside the request are carried into the
    // token too, so they are listed as well, bounded by what the client may still be granted
    let carried: string[] = [];
    if (remembered) {
      let kept = remembered.filter(s => s !== OFFLINE_ACCESS);
      if (client.allowedScopes !== undefined) kept = intersect(kept, parseScope(client.allowedScopes));
      carried = (await this.callableOperations(ctx, kept)).filter(id => !callable.includes(id));
    }
    const groups = new Map<string, ConsentRequest["operations"][number]>();
    for (const id of [...callable, ...carried]) {
      const group = id.split(".")[0];
      if (!groups.has(group)) groups.set(group, { group, ids: [] });
      groups.get(group)!.ids.push({
        id,
        summary: ops[id]?.summary,
        preselected: remembered ? scopeMatches(remembered, id) : true,
        // Comes from the remembered grant: the decision cannot withdraw it
        alreadyAllowed: remembered && scopeMatches(remembered, id) ? true : undefined
      });
    }
    return {
      flow: pending.flow,
      client: {
        id: client.id,
        name: client.name,
        logo: client.logo,
        uri: client.client_uri,
        host: client.registered ? this.redirectHost(pending.redirectUri) : this.metadataHost(client),
        verified: !client.registered
      },
      user: { id: userId },
      hostname: pending.hostname,
      operations: [...groups.values()],
      offlineAccess: requested.includes(OFFLINE_ACCESS),
      rememberable: pending.flow === "code" && !remote && this.parameters.rememberConsent,
      csrf: pending.csrf
    };
  }

  /**
   * @param client - requesting client
   * @returns the host publishing a metadata document client, undefined for the others
   */
  protected metadataHost(client: OAuthClient): string | undefined {
    return client.metadataDocument ? new URL(client.id).host : undefined;
  }

  /**
   * @param redirectUri - redirect URI of the pending request
   * @returns where an unverified client redirects: its host, or "local application" for loopback and private-use
   * scheme redirects
   */
  protected redirectHost(redirectUri: string | undefined): string | undefined {
    if (!redirectUri) return undefined;
    try {
      const url = new URL(redirectUri);
      if (url.protocol !== "http:" && url.protocol !== "https:") return LOCAL_APPLICATION;
      if (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
        return LOCAL_APPLICATION;
      }
      return url.host;
    } catch {
      return undefined;
    }
  }

  /**
   * Record the user's decision on the pending request
   * @param allow - grant or deny
   * @param operations - selected operation ids
   * @param csrf - token from OAuth.Consent.Get
   * @param remember - remember the consent for this client
   * @returns where the browser goes next
   */
  @Operation({ id: "OAuth.Consent.Decide", hidden: true })
  async consentDecide(
    allow: boolean,
    operations: string[],
    csrf: string,
    remember?: boolean
  ): Promise<{ redirect: string }> {
    const ctx = useContext<WebContext>();
    const pending = await this.requirePending(ctx);
    if (typeof csrf !== "string" || !sameSecret(csrf, pending.csrf)) {
      throw new WebdaError.Forbidden("Invalid CSRF token");
    }
    if (allow !== true) {
      await this.clearPending(ctx);
      if (pending.flow === "device") {
        await this.denyDevice(pending);
        return { redirect: withQuery(this.pageUrl(ctx, "result"), { status: "error", error: "access_denied" }) };
      }
      return { redirect: withQuery(pending.redirectUri!, { error: "access_denied", state: pending.state }) };
    }
    const requested = parseScope(pending.scope);
    const remote = this.isRemoteResource(ctx, pending.resource);
    const callable = remote ? this.remoteEntries(requested) : await this.callableOperations(ctx, requested);
    // Only operation ids both requested and callable by the user: never a glob; the grant is these plus the
    // still-valid remembered grant (code flow), narrowed to what the client may still be granted. For a remote
    // resource, only requested entries
    const selected = (Array.isArray(operations) ? operations : []).filter(
      (id): id is string => typeof id === "string" && callable.includes(id)
    );
    // A requested glob is kept only when every delegable operation it matches is selected, callable or not: a glob
    // covering operations the user never saw (a later role) would silently widen the grant
    let granted = remote ? [...new Set(selected)] : collapse(selected, requested, this.delegableOperations());
    const client = await this.clients.get(pending.clientId);
    if (!client) throw new WebdaError.BadRequest("Unknown client");
    const identity = identityOf(ctx.getSession());
    // Step-up: the still-valid remembered grant is kept, whether or not the new decision is remembered.
    // offline_access is never carried over: a refresh token is issued only when this request asked for it
    if (pending.flow === "code" && !remote) {
      const earlier = await this.rememberedScope(identity.userId, pending.clientId);
      if (earlier) {
        granted = union(
          earlier.filter(s => s !== OFFLINE_ACCESS),
          granted
        );
      }
    }
    // After the union: an administrator narrowing the client also narrows what was remembered
    if (client.allowedScopes !== undefined) granted = intersect(granted, parseScope(client.allowedScopes));
    if (!operationGlobs(granted).length) throw new WebdaError.BadRequest("Select at least one operation");
    if (requested.includes(OFFLINE_ACCESS)) granted.push(OFFLINE_ACCESS);
    await this.clearPending(ctx);
    if (pending.flow === "device") {
      await this.approveDevice(pending, identity, granted);
      return { redirect: withQuery(this.pageUrl(ctx, "result"), { status: "success", client: pending.clientId }) };
    }
    if (remember === true && !remote && this.parameters.rememberConsent) {
      await this.remember(identity.userId, pending.clientId, granted);
    }
    return { redirect: await this.codeRedirect(pending, identity, granted) };
  }

  /**
   * The pending request of a browser session, bound to its user
   * @param ctx - web context
   * @returns the pending request
   * @throws Unauthorized without a browser (cookie) session logged in
   * @throws BadRequest without a pending request
   * @throws Forbidden when the request belongs to another user
   */
  protected async requirePending(ctx: WebContext): Promise<PendingRequest> {
    const session = ctx.getSession();
    // A bearer (scoped) or MFA-pending session cannot consent: consent comes from a browser session
    if (!session?.isLogged() || session.mfa === "pending" || session.scopes !== undefined)
      throw new WebdaError.Unauthorized("Login required");
    const pending = await readPending(ctx, PENDING_COOKIE);
    if (!pending) throw new WebdaError.BadRequest("No pending authorization request");
    if (pending.userId === undefined) {
      // Started before the login: bind it to the user who reviews it
      pending.userId = session.userId;
      if (!(await writePending(ctx, PENDING_COOKIE, this.pendingPath(ctx), pending))) {
        throw new WebdaError.BadRequest("Authorization request is too large");
      }
    } else if (pending.userId !== session.userId) {
      throw new WebdaError.Forbidden("The authorization request belongs to another user");
    }
    return pending;
  }

  /**
   * @param ctx - web context
   */
  protected async clearPending(ctx: WebContext): Promise<void> {
    await writePending(ctx, PENDING_COOKIE, this.pendingPath(ctx), undefined);
  }

  /**
   * @param ctx - web context of the user
   * @param requested - requested scope
   * @returns the requested operations the user can call, in registration order
   */
  protected async callableOperations(ctx: WebContext, requested: Scope): Promise<string[]> {
    const callable: string[] = [];
    for (const id of expand(requested, this.delegableOperations())) {
      if (await canCallOperation(ctx, id)) callable.push(id);
    }
    return callable;
  }

  /**
   * Remember the consent of a user for a client, adding to the previous one when still valid
   * @param userId - user
   * @param clientId - client
   * @param scope - granted scope
   */
  protected async remember(userId: string, clientId: string, scope: Scope): Promise<void> {
    const uuid = `${userId}:${clientId}`;
    const now = Date.now();
    const update = {
      scope: formatScope(scope),
      lastUsedAt: now,
      expiresAt: now + this.parameters.rememberConsentTtl * 1000
    };
    const ref = OAuthGrant.ref(uuid);
    if (await ref.exists()) {
      const existing = await ref.get();
      if (existing.expiresAt > now) update.scope = formatScope(union(parseScope(existing.scope), scope));
      await ref.patch(update);
    } else {
      await OAuthGrant.create({ uuid, userId, clientId, createdAt: now, ...update } as any);
    }
  }

  /**
   * @param pending - approved request
   * @param identity - identity of the user
   * @param scope - granted scope
   * @returns the client redirect carrying a new authorization code
   */
  protected async codeRedirect(pending: PendingRequest, identity: GrantIdentity, scope: Scope): Promise<string> {
    const code = await this.issueCode(pending, identity, scope);
    return withQuery(pending.redirectUri!, { code, state: pending.state });
  }

  /**
   * Issue an authorization code for an approved request and redirect to the client
   * @param ctx - web context
   * @param pending - pending request
   * @param scope - granted scope
   */
  protected async approveCode(ctx: WebContext, pending: PendingRequest, scope: Scope): Promise<void> {
    this.redirect(ctx, await this.codeRedirect(pending, identityOf(ctx.getSession()), scope));
  }

  /**
   * Create an authorization code, stored hashed
   * @param pending - pending request
   * @param identity - identity of the user
   * @param scope - granted scope
   * @returns the code
   */
  protected async issueCode(pending: PendingRequest, identity: GrantIdentity, scope: Scope): Promise<string> {
    const code = randomToken(32);
    await OAuthCode.create({
      hash: sha256(code),
      clientId: pending.clientId,
      redirectUri: pending.redirectUri!,
      codeChallenge: pending.codeChallenge!,
      scope: formatScope(scope),
      identity,
      name: await this.familyName(pending),
      resource: pending.resource,
      expiresAt: Date.now() + this.parameters.codeTtl * 1000
    } as any);
    return code;
  }

  /**
   * @param pending - approved request
   * @returns display name of the refresh family, e.g. "Webda CLI on remi-mbp"
   */
  protected async familyName(pending: PendingRequest): Promise<string> {
    const client = await this.clients.get(pending.clientId);
    const name = client?.name ?? pending.clientId;
    return pending.hostname ? `${name} on ${pending.hostname}` : name;
  }

  /**
   * Approve a pending device authorization: compare-and-set of its status from `pending`, so a code is decided once
   * @param pending - pending request
   * @param identity - identity of the user
   * @param scope - granted scope
   * @throws BadRequest when the device code is gone, expired or already decided
   */
  protected async approveDevice(pending: PendingRequest, identity: GrantIdentity, scope: Scope): Promise<void> {
    const decided = await this.decideDevice(pending, {
      status: "approved",
      identity,
      grantedScope: formatScope(scope),
      name: await this.familyName(pending)
    });
    if (!decided) throw new WebdaError.BadRequest("The device authorization is no longer pending");
  }

  /**
   * Deny a pending device authorization; a device code gone, expired or already decided is left as it is
   * @param pending - pending request
   */
  protected async denyDevice(pending: PendingRequest): Promise<void> {
    await this.decideDevice(pending, { status: "denied" });
  }

  /**
   * @param pending - pending device request
   * @param update - decision
   * @returns false when the device code is gone, expired, of another client or no longer pending
   */
  protected async decideDevice(pending: PendingRequest, update: Partial<OAuthDeviceCode>): Promise<boolean> {
    const ref = OAuthDeviceCode.ref(pending.userCode!);
    if (!(await ref.exists())) return false;
    const stored: OAuthDeviceCode = await ref.get();
    if (stored.clientId !== pending.clientId || !(stored.expiresAt > Date.now())) return false;
    try {
      await ref.patch(update as any, "status" as any, "pending");
      return true;
    } catch (err) {
      if (!this.isConditionFailure(err) && (await ref.exists())) throw err;
      return false;
    }
  }

  /**
   * Redirect without caching
   * @param ctx - web context
   * @param url - target
   */
  protected redirect(ctx: WebContext, url: string): void {
    ctx.setHeader("Cache-Control", "no-store");
    ctx.redirect(url);
  }

  /**
   * Redirect to a validated URI with extra query parameters, keeping its own
   * @param ctx - web context
   * @param uri - validated redirect URI
   * @param params - parameters, undefined values are skipped
   */
  protected redirectWith(ctx: WebContext, uri: string, params: Record<string, string | undefined>): void {
    const query = new URLSearchParams(
      Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined)
    ).toString();
    this.redirect(ctx, query ? `${uri}${uri.includes("?") ? "&" : "?"}${query}` : uri);
  }

  /**
   * Render an error to the browser, without redirecting
   * @param ctx - web context
   * @param status - HTTP status
   * @param message - message, never derived from the request
   */
  protected errorPage(ctx: WebContext, status: number, message: string): void {
    this.writePage(ctx, status, () => errorHtml(message));
  }

  /**
   * Write a built-in page: not cached, not framed, only its nonce-bound script runs
   * @param ctx - web context
   * @param status - HTTP status
   * @param render - render the page with the nonce of its script
   */
  protected writePage(ctx: WebContext, status: number, render: (nonce: string) => string): void {
    const nonce = newNonce();
    ctx.writeHead(status, pageHeaders(nonce));
    ctx.write(render(nonce));
  }

  /**
   * Serve a browser operation on its route: called through core, so input validation and the operation authorizers
   * apply as on any transport
   * @param ctx - web context
   * @param operationId - operation
   */
  protected async browserOperation(ctx: WebContext, operationId: string): Promise<void> {
    await callOperation(ctx, operationId);
  }

  /**
   * @param ctx - web context
   * @param name - query parameter
   * @returns its value, capped, undefined when absent or not a string
   */
  protected queryParameter(ctx: WebContext, name: string): string | undefined {
    const value = ctx.parameter(name);
    return typeof value === "string" ? value.slice(0, MAX_ECHO) : undefined;
  }

  /**
   * Token endpoint: authorization code, refresh token and device code grants. Accepts form-encoded and JSON bodies;
   * every response, errors included, is JSON and never cached
   * @param ctx - web context
   */
  async token(ctx: WebContext): Promise<void> {
    let status = 200;
    let payload: TokenResponse | { error: string; error_description: string };
    try {
      const body = await this.tokenBody(ctx);
      switch (body.grant_type) {
        case "authorization_code":
          payload = await this.exchangeCode(body);
          break;
        case "refresh_token":
          payload = await this.exchangeRefresh(body);
          break;
        case DEVICE_GRANT:
          payload = await this.exchangeDevice(body);
          break;
        case undefined:
          throw new OAuthError("invalid_request", "grant_type is required");
        default:
          throw new OAuthError("unsupported_grant_type", "Unsupported grant_type");
      }
    } catch (err) {
      const oauth = this.toOAuthError(err);
      status = oauth.getResponseCode();
      payload = oauth.toJSON();
    }
    ctx.writeHead(status, TOKEN_HEADERS);
    ctx.write(JSON.stringify(payload));
  }

  /**
   * @param err - error raised while serving a token request
   * @returns the RFC 6749 error to send: never an internal message
   */
  protected toOAuthError(err: unknown): OAuthError {
    if (err instanceof OAuthError) return err;
    if (err instanceof InvalidScope) {
      return new OAuthError("invalid_scope", "Requested scope is invalid or exceeds the granted scope");
    }
    if (err instanceof TokenInvalid) return new OAuthError("invalid_grant", "Invalid refresh token");
    if (err instanceof InvalidTarget) {
      return new OAuthError("invalid_target", "Requested resource is invalid or differs from the granted one");
    }
    this.log("ERROR", "Token request failed", err);
    return new OAuthError("server_error", "Internal error", 500);
  }

  /**
   * @param ctx - web context
   * @returns the string parameters of a form-encoded or JSON body
   * @throws OAuthError invalid_request on an unreadable body, another content type or a repeated parameter
   */
  protected async tokenBody(ctx: WebContext): Promise<Record<string, string>> {
    const type = ctx.getHttpContext().getUniqueHeader("content-type", "").split(";")[0].trim().toLowerCase();
    let raw: string;
    try {
      raw = await ctx.getRawInputAsString(MAX_TOKEN_BODY);
    } catch {
      throw new OAuthError("invalid_request", "Unreadable request body");
    }
    const body: Record<string, string> = {};
    if (type === "application/x-www-form-urlencoded") {
      for (const [key, value] of new URLSearchParams(raw)) {
        // RFC 6749 §3.2: request parameters must not be included more than once
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          // RFC 8707: several resources are allowed by the spec, a single one is supported here
          if (key === "resource") throw new OAuthError("invalid_target", "A single resource is supported");
          throw new OAuthError("invalid_request", "Repeated parameter");
        }
        body[key] = value;
      }
      return body;
    }
    if (type === "application/json") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new OAuthError("invalid_request", "Malformed JSON body");
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new OAuthError("invalid_request", "Body must be a JSON object");
      }
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") body[key] = value;
        // A resource array (or any other non-string) is refused, never taken as absent
        else if (key === "resource" && value !== undefined && value !== null) {
          throw new OAuthError("invalid_target", "A single resource is supported");
        }
      }
      return body;
    }
    throw new OAuthError("invalid_request", "Unsupported content type");
  }

  /**
   * @returns the token service
   */
  protected tokenService(): TokenService {
    return useService("TokenService") as TokenService;
  }

  /**
   * Exchange an authorization code (RFC 6749 §4.1.3, PKCE RFC 7636 §4.6).
   *
   * The code is consumed by a compare-and-set on `usedAt` before anything else is checked, so it is exchanged at most
   * once whatever the outcome. A code presented again revokes the family issued from it
   * @param body - token request
   * @returns the tokens
   */
  protected async exchangeCode(body: Record<string, string>): Promise<TokenResponse> {
    const { code, code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri } = body;
    if (!code || !verifier || !clientId || !redirectUri) {
      throw new OAuthError("invalid_request", "code, code_verifier, client_id and redirect_uri are required");
    }
    const ref = OAuthCode.ref(sha256(code));
    if (!(await ref.exists())) throw invalidCode();
    const stored: OAuthCode = await ref.get();
    if (stored.usedAt) {
      await this.codeReused(ref);
      throw invalidCode();
    }
    // Compare-and-set: only one caller moves usedAt from undefined to a value
    try {
      await ref.patch({ usedAt: Date.now() } as any, "usedAt" as any, undefined);
    } catch (err) {
      if (!this.isConditionFailure(err)) throw err;
      await this.codeReused(ref);
      throw invalidCode();
    }
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (
      !(stored.expiresAt > Date.now()) ||
      stored.clientId !== clientId ||
      stored.redirectUri !== redirectUri ||
      !PKCE_VERIFIER.test(verifier) ||
      !sameSecret(challenge, stored.codeChallenge)
    ) {
      throw invalidCode();
    }
    // RFC 8707 §2.2: the resource of the token request, when given, is the one consented to
    if (body.resource !== undefined && body.resource !== (stored.resource ?? undefined)) {
      throw new OAuthError("invalid_target", "Requested resource differs from the authorized one");
    }
    const issued = await this.issueTokens(
      stored.identity,
      stored.clientId,
      parseScope(stored.scope),
      stored.name,
      stored.resource ?? undefined
    );
    // Recorded only while the code is not marked reused: a concurrent presentation that marked it first could not
    // see the family, so revoke it here (the tokens are returned but no longer valid)
    try {
      await ref.patch({ family: issued.family } as any, "reusedAt" as any, undefined);
    } catch (err) {
      if (!this.isConditionFailure(err)) throw err;
      await this.tokenService().revokeFamily(issued.family);
    }
    return issued.response;
  }

  /**
   * A used code was presented again: mark it, then revoke the family issued from it once recorded. The exchange that
   * records the family checks the mark afterwards, so the family is revoked whichever runs first
   * @param ref - code reference
   */
  protected async codeReused(ref: ReturnType<typeof OAuthCode.ref>): Promise<void> {
    await ref.patch({ reusedAt: Date.now() } as any);
    const { family } = (await ref.get()) as OAuthCode;
    if (family) await this.tokenService().revokeFamily(family);
  }

  /**
   * @param err - error thrown by a conditional write
   * @returns true if the error is a failed write condition
   */
  protected isConditionFailure(err: any): boolean {
    return /condition/i.test(`${err?.name} ${err?.message}`);
  }

  /**
   * Refresh token grant (RFC 6749 §6): rotation, reuse detection, client binding and narrowing are done by
   * TokenService
   * @param body - token request
   * @returns the tokens, with the rotated refresh token while `offline_access` is kept
   */
  protected async exchangeRefresh(body: Record<string, string>): Promise<TokenResponse> {
    const { refresh_token: refreshToken, client_id: clientId } = body;
    if (!refreshToken || !clientId) throw new OAuthError("invalid_request", "refresh_token and client_id are required");
    if (!(await this.clients.get(clientId))) throw new OAuthError("invalid_client", "Unknown client", 401);
    let requested: Scope | undefined;
    if (body.scope !== undefined) {
      if (body.scope.length > MAX_SCOPE) throw new InvalidScope("Scope is too long");
      requested = parseScope(body.scope);
      if (!operationGlobs(requested).length) throw new InvalidScope("No operation requested");
    }
    const tokens = await this.tokenService().refresh(refreshToken, {
      clientId,
      scope: requested,
      resource: body.resource,
      issuer: this.tokenIssuer()
    });
    if (clientId.startsWith(REGISTERED_PREFIX)) await this.touchRegisteredClient(clientId);
    return this.tokenResponse(tokens, tokens.scope ?? []);
  }

  /**
   * Device code grant (RFC 8628 §3.4, §3.5). The approved code is consumed by a compare-and-set of its status, so it
   * yields tokens once
   * @param body - token request
   * @returns the tokens
   */
  protected async exchangeDevice(body: Record<string, string>): Promise<TokenResponse> {
    const { device_code: deviceCode, client_id: clientId } = body;
    if (!deviceCode || !clientId) throw new OAuthError("invalid_request", "device_code and client_id are required");
    if (!(await this.deviceClient(clientId))) {
      throw new OAuthError("unauthorized_client", "The client may not use the device authorization grant");
    }
    const invalid = () => new OAuthError("invalid_grant", "Invalid device code");
    const parts = splitDeviceCode(deviceCode);
    if (!parts) throw invalid();
    const ref = OAuthDeviceCode.ref(parts.userCode);
    if (!(await ref.exists())) throw invalid();
    const stored: OAuthDeviceCode = await ref.get();
    if (stored.clientId !== clientId || !sameSecret(sha256(parts.secret), stored.secretHash)) throw invalid();
    const now = Date.now();
    if (!(stored.expiresAt > now)) throw new OAuthError("expired_token", "The device code has expired");
    if (stored.status === "consumed") throw invalid();
    if (stored.lastPolledAt && now - stored.lastPolledAt < stored.interval * 1000) {
      await ref.patch({ interval: stored.interval + 5, lastPolledAt: now } as any);
      throw new OAuthError("slow_down", "Polling too fast");
    }
    await ref.patch({ lastPolledAt: now } as any);
    switch (stored.status) {
      case "pending":
        throw new OAuthError("authorization_pending", "The user has not decided yet");
      case "denied":
        await ref.delete();
        throw new OAuthError("access_denied", "The user denied the authorization");
      case "approved":
        break;
      default:
        throw invalid();
    }
    // Compare-and-set: only one poll moves the status from approved to consumed
    try {
      await ref.patch({ status: "consumed" } as any, "status" as any, "approved");
    } catch (err) {
      if (!this.isConditionFailure(err) && (await ref.exists())) throw err;
      throw invalid();
    }
    const issued = await this.issueTokens(
      stored.identity!,
      stored.clientId,
      parseScope(stored.grantedScope!),
      stored.name
    );
    return issued.response;
  }

  /**
   * @param clientId - client_id
   * @returns the client when it is a configured client allowed to use the device flow. Never fetches a metadata
   * document: such clients never get the device flow
   */
  protected async deviceClient(clientId: string | undefined): Promise<OAuthClient | undefined> {
    if (typeof clientId !== "string" || !Object.prototype.hasOwnProperty.call(this.parameters.clients, clientId)) {
      return undefined;
    }
    const client = await this.clients.get(clientId);
    return client?.deviceFlow === true ? client : undefined;
  }

  /**
   * Issue the tokens of a new family for a consented identity
   * @param identity - identity captured at consent
   * @param clientId - client
   * @param scope - granted scope
   * @param name - display name of the family
   * @param resource - resource the tokens are bound to (RFC 8707), none by default
   * @returns the family and the response
   */
  protected async issueTokens(
    identity: GrantIdentity,
    clientId: string,
    scope: Scope,
    name?: string,
    resource?: string
  ): Promise<{ family: string; response: TokenResponse }> {
    const session = new Session();
    session.login(identity.userId, identity.identId, {
      provider: identity.provider,
      amr: identity.amr,
      mfa: identity.mfa,
      mfaAt: identity.mfaAt,
      mfaVerifications: identity.mfaVerifications
    });
    const tokens = await this.tokenService().issue(session, undefined, {
      clientId,
      scope,
      name,
      resource,
      issuer: this.tokenIssuer(),
      accessTtl: this.parameters.accessTtl,
      refreshTtl: this.parameters.refreshTtl
    });
    if (clientId.startsWith(REGISTERED_PREFIX)) await this.touchRegisteredClient(clientId);
    return { family: tokens.family, response: await this.tokenResponse(tokens, scope) };
  }

  /**
   * A registered client was used: extend its lifetime to the idle TTL
   * @param clientId - `dcr_` client_id
   */
  protected async touchRegisteredClient(clientId: string): Promise<void> {
    const now = Date.now();
    const ref = OAuthRegisteredClient.ref(clientId);
    try {
      await ref.patch({ lastUsedAt: now, expiresAt: now + this.parameters.registrationIdleTtl * 1000 } as any);
    } catch (err) {
      // Deleted concurrently (swept): nothing to extend
      if (await ref.exists()) throw err;
    }
  }

  /**
   * @param tokens - issued tokens
   * @param scope - granted scope
   * @returns the response; without `offline_access` the refresh token is withheld and made unusable
   */
  protected async tokenResponse(tokens: IssuedTokens, scope: Scope): Promise<TokenResponse> {
    const offline = scope.includes(OFFLINE_ACCESS);
    if (!offline) {
      // Expired rather than revoked: the record still tells a later revocation how long its access token lives
      await RefreshToken.ref({ hash: sha256(tokens.refreshToken) } as any).patch({ expiresAt: Date.now() - 1 } as any);
    }
    return {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      scope: formatScope(scope),
      ...(offline ? { refresh_token: tokens.refreshToken } : {})
    };
  }

  /**
   * Revocation endpoint (RFC 7009): a refresh or access token issued to the client revokes its whole family. Any other
   * token, unknown, invalid or issued to another client, is ignored with the same `200` response
   * @param ctx - web context
   */
  async revoke(ctx: WebContext): Promise<void> {
    let status = 200;
    let payload: { error: string; error_description: string } | undefined;
    try {
      const { token, client_id: clientId } = await this.tokenBody(ctx);
      if (!token || !clientId) throw new OAuthError("invalid_request", "token and client_id are required");
      if (!(await this.clients.get(clientId))) throw new OAuthError("invalid_client", "Unknown client", 401);
      // token_type_hint is only an optimization (RFC 7009 §2.1): both kinds are always tried
      const family =
        (await this.refreshFamily(token, clientId)) ?? (await this.accessFamily(token, clientId, this.issuer(ctx)));
      if (family) await this.tokenService().revokeFamily(family);
    } catch (err) {
      const oauth = this.toOAuthError(err);
      status = oauth.getResponseCode();
      payload = oauth.toJSON();
    }
    ctx.writeHead(status, TOKEN_HEADERS);
    if (payload) ctx.write(JSON.stringify(payload));
  }

  /**
   * @param token - presented token
   * @param clientId - authenticated client
   * @returns the family of the refresh token, when it is one issued to the client
   */
  protected async refreshFamily(token: string, clientId: string): Promise<string | undefined> {
    const ref = RefreshToken.ref({ hash: sha256(token) } as any);
    if (!(await ref.exists())) return undefined;
    const stored: RefreshToken = await ref.get();
    return stored.clientId === clientId ? stored.family : undefined;
  }

  /**
   * @param token - presented token
   * @param clientId - authenticated client
   * @param issuer - issuer, origin of the protected resources
   * @returns the family of the access token, when it is a valid one issued to the client, bound to no resource or to
   * a registered one
   */
  protected async accessFamily(token: string, clientId: string, issuer: string): Promise<string | undefined> {
    const claims = await this.tokenService().verifyAccess(token, {
      audience: [ACCESS_AUDIENCE, ...resolveProtectedResources(issuer)]
    });
    return claims?.client_id === clientId ? claims.fam : undefined;
  }

  /**
   * @returns the user managing their connected apps
   * @throws Unauthorized without a logged-in session, or with a delegated (scoped) token
   */
  protected connectedAppsUser(): string {
    const session = useContext<WebContext>().getSession();
    // A delegated token cannot list or revoke the other delegations of its user
    if (!session?.isLogged() || session.scopes !== undefined) throw new WebdaError.Unauthorized("Login required");
    return session.userId!;
  }

  /**
   * Connected apps of the user: the live refresh families issued to OAuth clients
   * @returns the current token of each live family
   */
  @Operation({ id: "OAuth.Sessions", rest: { method: "get", path: "oauth/sessions" } })
  async sessions(): Promise<ConnectedSession[]> {
    const userId = this.connectedAppsUser();
    return runAsSystem(async () => {
      const sessions: ConnectedSession[] = [];
      // Families without offline_access have an expired, not revoked, record: they are not live sessions; a token
      // retired by a replay of its predecessor (TokenService grace) is not the family's live one either
      for await (const token of RefreshToken.iterate(
        "userId = ? AND clientId IS NOT NULL AND revokedAt IS NULL AND rotatedAt IS NULL AND retiredAt IS NULL AND expiresAt > ?",
        [userId, Date.now()]
      )) {
        sessions.push({
          family: token.family,
          clientId: token.clientId!,
          name: token.name,
          scope: token.scope,
          createdAt: token.createdAt,
          lastUsedAt: token.lastUsedAt
        });
      }
      return sessions;
    });
  }

  /**
   * Remembered consents of the user
   * @returns the unexpired grants
   */
  @Operation({ id: "OAuth.Grants", rest: { method: "get", path: "oauth/grants" } })
  async grants(): Promise<RememberedGrant[]> {
    const userId = this.connectedAppsUser();
    return runAsSystem(async () => {
      const grants: RememberedGrant[] = [];
      for await (const grant of OAuthGrant.iterate("userId = ? AND expiresAt > ?", [userId, Date.now()])) {
        const { clientId, scope, createdAt, lastUsedAt, expiresAt } = grant;
        grants.push({ clientId, scope, createdAt, lastUsedAt, expiresAt });
      }
      return grants;
    });
  }

  /**
   * Revoke a refresh family of the user, or every family of the user for a client and its remembered consent. A
   * family of another user is ignored
   * @param family - family to revoke
   * @param clientId - client whose families are revoked
   */
  @Operation({ id: "OAuth.Revoke", rest: { method: "post", path: "oauth/revoke-session" } })
  async revokeSession(family?: string, clientId?: string): Promise<void> {
    const userId = this.connectedAppsUser();
    const hasFamily = typeof family === "string" && family !== "";
    const hasClient = typeof clientId === "string" && clientId !== "";
    if (!hasFamily && !hasClient) throw new WebdaError.BadRequest("family or clientId is required");
    await runAsSystem(async () => {
      const families = new Set<string>();
      if (hasFamily) {
        for await (const _ of RefreshToken.iterate("family = ? AND userId = ? LIMIT 1", [family, userId])) {
          families.add(family!);
        }
      }
      if (hasClient) {
        // Expired records too: a family without offline_access still has live access tokens
        for await (const token of RefreshToken.iterate("userId = ? AND clientId = ? AND revokedAt IS NULL", [
          userId,
          clientId
        ])) {
          families.add(token.family);
        }
        await this.forgetGrant(userId, clientId!);
      }
      for (const f of families) await this.tokenService().revokeFamily(f);
    });
  }

  /**
   * Forget the remembered consent of the user for a client: the issued tokens stay valid
   * @param clientId - client
   */
  @Operation({ id: "OAuth.Forget", rest: { method: "post", path: "oauth/forget" } })
  async forget(clientId: string): Promise<void> {
    const userId = this.connectedAppsUser();
    if (typeof clientId !== "string" || !clientId) throw new WebdaError.BadRequest("clientId is required");
    await runAsSystem(() => this.forgetGrant(userId, clientId));
  }

  /**
   * @param userId - user
   * @param clientId - client
   */
  protected async forgetGrant(userId: string, clientId: string): Promise<void> {
    const ref = OAuthGrant.ref(`${userId}:${clientId}`);
    if (await ref.exists()) await ref.delete();
  }

  /**
   * Device authorization endpoint (RFC 8628 §3.1, §3.2): `client_id`, `scope?`, `hostname?`. Every response, errors
   * included, is JSON and never cached.
   *
   * Rate limited: 20 requests per client IP in 10 minutes, then `429` with `{"error": "slow_down"}`
   * @param ctx - web context
   */
  async deviceAuthorization(ctx: WebContext): Promise<void> {
    let status = 200;
    let payload: Record<string, string | number>;
    try {
      // Unauthenticated and storing a device code: rate limited per client IP
      const key = `ip:${ctx.getHttpContext()?.getClientIp() ?? "unknown"}`;
      const now = Date.now();
      if (this.countAttempts(this.deviceRequests, key, now) >= DEVICE_AUTHORIZATION_IP_LIMIT) {
        throw new OAuthError("slow_down", "Too many device authorization requests", 429);
      }
      this.recordAttempt(this.deviceRequests, [key], now);
      const body = await this.tokenBody(ctx);
      const client = await this.deviceClient(body.client_id);
      if (!client) throw new OAuthError("unauthorized_client", "The client may not use the device authorization grant");
      const scope = this.requestedScope(client, body.scope);
      const secret = randomToken(32);
      const ttl = this.parameters.deviceCodeTtl;
      const userCode = await this.createDeviceCode({
        secretHash: sha256(secret),
        clientId: client.id,
        requestedScope: formatScope(scope),
        status: "pending",
        hostname: this.cleanHostname(body.hostname),
        expiresAt: Date.now() + ttl * 1000,
        interval: this.parameters.devicePollInterval
      });
      const formatted = formatUserCode(userCode);
      const verification = this.pageUrl(ctx, "device");
      payload = {
        device_code: `${userCode}.${secret}`,
        user_code: formatted,
        verification_uri: verification,
        verification_uri_complete: withQuery(verification, { user_code: formatted }),
        expires_in: ttl,
        interval: this.parameters.devicePollInterval
      };
    } catch (err) {
      const oauth = this.toOAuthError(err);
      status = oauth.getResponseCode();
      payload = oauth.toJSON();
    }
    ctx.writeHead(status, TOKEN_HEADERS);
    ctx.write(JSON.stringify(payload));
  }

  /**
   * @returns a random user code
   */
  protected newUserCode(): string {
    return generateUserCode();
  }

  /**
   * Store a device code under a free user code: a drawn code already taken is drawn again, a bounded number of times
   * @param data - the device code but its user code
   * @returns the user code
   */
  protected async createDeviceCode(data: Omit<Partial<OAuthDeviceCode>, "userCode">): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      const userCode = this.newUserCode();
      try {
        await OAuthDeviceCode.create({ ...data, userCode } as any);
        return userCode;
      } catch (err) {
        // The create failed on an existing record: draw again
        if (attempt >= USER_CODE_ATTEMPTS || !(await OAuthDeviceCode.ref(userCode).exists())) throw err;
      }
    }
  }

  /**
   * Bind a device code typed by the user to the browser: the pending request then goes through the consent page, which
   * is never skipped for the device flow.
   *
   * Rate limited on failures: 5 per browser session and 20 per client IP in 10 minutes. Every failure (malformed,
   * unknown, expired or already decided code) is the same `404`
   * @param userCode - code displayed by the device, case, spaces and dashes ignored
   * @returns the consent page
   */
  @Operation({ id: "OAuth.Device.Lookup", hidden: true })
  async deviceLookup(userCode: string): Promise<{ redirect: string }> {
    const ctx = useContext<WebContext>();
    const session = ctx.getSession();
    // A bearer (scoped) session cannot consent: consent comes from a browser session
    if (!session?.isLogged() || session.scopes !== undefined) throw new WebdaError.Unauthorized("Login required");
    const keys = [
      `session:${session.uuid ?? `user:${session.userId}`}`,
      `ip:${ctx.getHttpContext()?.getClientIp() ?? "unknown"}`
    ];
    const now = Date.now();
    if (
      this.countLookupFailures(keys[0], now) >= LOOKUP_SESSION_FAILURES ||
      this.countLookupFailures(keys[1], now) >= LOOKUP_IP_FAILURES
    ) {
      throw new WebdaError.TooManyRequests("Too many attempts");
    }
    // Counted before the lookup, so concurrent attempts are all counted; withdrawn on success
    this.recordLookupFailure(keys, now);
    const code = normalizeUserCode(userCode);
    let device: OAuthDeviceCode | undefined;
    if (code) {
      const ref = OAuthDeviceCode.ref(code);
      device = (await ref.exists()) ? await ref.get() : undefined;
    }
    if (!device || device.status !== "pending" || !(device.expiresAt > Date.now())) {
      throw new WebdaError.NotFound("Unknown or expired code");
    }
    this.withdrawLookupFailure(keys, now);
    const pending: PendingRequest = {
      flow: "device",
      clientId: device.clientId,
      scope: device.requestedScope,
      hostname: device.hostname,
      userCode: device.userCode,
      userId: session.userId,
      csrf: randomToken(24),
      expires: Math.min(Date.now() + PENDING_TTL * 1000, device.expiresAt)
    };
    if (!(await writePending(ctx, PENDING_COOKIE, this.pendingPath(ctx), pending))) {
      throw new WebdaError.BadRequest("Authorization request is too large");
    }
    return { redirect: this.pageUrl(ctx, "consent") };
  }

  /**
   * @param key - rate limit key
   * @param now - current time
   * @returns failed lookups of the key in the window
   */
  protected countLookupFailures(key: string, now: number): number {
    return this.countAttempts(this.lookupFailures, key, now);
  }

  /**
   * @param attempts - rate limit state
   * @param key - rate limit key
   * @param now - current time
   * @param window - window (ms)
   * @returns attempts of the key in the window
   */
  protected countAttempts(
    attempts: Map<string, number[]>,
    key: string,
    now: number,
    window: number = LOOKUP_WINDOW
  ): number {
    const times = attempts.get(key)?.filter(t => t > now - window) ?? [];
    if (times.length) attempts.set(key, times);
    else attempts.delete(key);
    return times.length;
  }

  /**
   * @param keys - rate limit keys
   * @param now - time of the failure
   */
  protected recordLookupFailure(keys: string[], now: number): void {
    this.recordAttempt(this.lookupFailures, keys, now);
  }

  /**
   * @param attempts - rate limit state
   * @param keys - rate limit keys
   * @param now - time of the attempt
   */
  protected recordAttempt(attempts: Map<string, number[]>, keys: string[], now: number): void {
    for (const key of keys) {
      const times = attempts.get(key) ?? [];
      times.push(now);
      // Re-inserted last: the map stays ordered by last attempt
      attempts.delete(key);
      attempts.set(key, times);
    }
    while (attempts.size > LOOKUP_MAX_KEYS) {
      attempts.delete(attempts.keys().next().value!);
    }
  }

  /**
   * @param keys - rate limit keys
   * @param time - time of the failure recorded for the attempt
   */
  protected withdrawLookupFailure(keys: string[], time: number): void {
    for (const key of keys) {
      const times = this.lookupFailures.get(key);
      const index = times?.lastIndexOf(time) ?? -1;
      if (index >= 0) times!.splice(index, 1);
    }
  }

  /**
   * Forget the failed lookups out of the window
   * @param now - current time
   */
  protected pruneLookupFailures(now: number): void {
    for (const attempts of [this.lookupFailures, this.deviceRequests]) {
      for (const key of [...attempts.keys()]) this.countAttempts(attempts, key, now);
    }
    const window = this.parameters.registrationRateWindow * 1000;
    for (const key of [...this.registrationRequests.keys()]) {
      this.countAttempts(this.registrationRequests, key, now, window);
    }
  }

  /**
   * Built-in consent page: renders OAuth.Consent.Get, sends OAuth.Consent.Decide
   * @param ctx - web context
   */
  async consentPage(ctx: WebContext): Promise<void> {
    this.writePage(ctx, 200, nonce => consentHtml(this.pendingPath(ctx), nonce));
  }

  /**
   * Built-in device code entry page: sends OAuth.Device.Lookup, which needs a signed-in browser. A signed-out browser
   * goes to the configured login page first, which brings it back here with the code
   * @param ctx - web context
   * @returns once the response is written
   */
  async devicePage(ctx: WebContext): Promise<void> {
    const userCode = this.queryParameter(ctx, "user_code")?.slice(0, USER_CODE_MAX);
    const session = ctx.getSession();
    if (!session?.isLogged() || session.scopes !== undefined) {
      const back = `${this.issuer(ctx)}${this.parameters.url}/device${
        userCode ? `?user_code=${encodeURIComponent(userCode)}` : ""
      }`;
      const login = this.parameters.loginUrl;
      return this.redirect(ctx, `${login}${login.includes("?") ? "&" : "?"}redirect=${encodeURIComponent(back)}`);
    }
    this.writePage(ctx, 200, nonce => deviceHtml(this.pendingPath(ctx), userCode, nonce));
  }

  /**
   * Built-in result page
   * @param ctx - web context
   */
  async resultPage(ctx: WebContext): Promise<void> {
    const status = this.queryParameter(ctx, "status") ?? "error";
    this.writePage(ctx, 200, () => resultHtml(status, this.queryParameter(ctx, "error")));
  }
}
