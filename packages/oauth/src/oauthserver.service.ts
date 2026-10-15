import { createHash, timingSafeEqual } from "node:crypto";
import {
  canCallOperation,
  collapse,
  covers,
  expand,
  formatScope,
  intersect,
  type IssuedTokens,
  InvalidScope,
  listOperations,
  OFFLINE_ACCESS,
  Operation,
  OperationIdTransport,
  operationGlobs,
  parseScope,
  RefreshToken,
  RESTOperationsTransport,
  runAsSystem,
  type Scope,
  scopeMatches,
  Service,
  Session,
  TokenInvalid,
  type TokenService,
  useContext,
  useCore,
  useService,
  type WebContext,
  WebdaError
} from "@webda/core";
import { OAuthError } from "./errors.js";
import { ClientRegistry } from "./clients.js";
import {
  formatUserCode,
  generateUserCode,
  normalizeUserCode,
  randomToken,
  sha256,
  splitDeviceCode
} from "./devicecode.js";
import { type GrantIdentity, OAuthCode, OAuthDeviceCode, OAuthGrant } from "./models.model.js";
import { type OAuthClient, OAuthServerParameters } from "./parameters.js";
import { type PendingRequest, PENDING_TTL, readPending, writePending } from "./pending.js";

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
/** Attempts at drawing a free user code */
const USER_CODE_ATTEMPTS = 5;
/** Window of the device lookup rate limit (ms) */
const LOOKUP_WINDOW = 10 * 60 * 1000;
/** Failed device lookups allowed per browser session in the window */
const LOOKUP_SESSION_FAILURES = 5;
/** Failed device lookups allowed per client IP in the window */
const LOOKUP_IP_FAILURES = 20;
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
  "hostname"
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
  client: { id: string; name: string; logo?: string; uri?: string; host?: string };
  /** Signed-in user */
  user: { id: string; name?: string };
  /** Hostname of the device requesting access */
  hostname?: string;
  /** Requested operations the user can call, by first segment */
  operations: { group: string; ids: { id: string; summary?: string; preselected: boolean }[] }[];
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
 * Operations (browser session, pending request cookie): `OAuth.Device.Lookup`, `OAuth.Consent.Get`,
 * `OAuth.Consent.Decide`. Their REST
 * hints sit below `/oauth`, the default `url`, so the pending cookie reaches them through a REST transport at `/`
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

  /** @override */
  resolve(): this {
    super.resolve();
    if (!this.parameters.loginUrl) {
      throw new WebdaError.CodeError("OAUTH_LOGIN_URL", "OAuthServer requires the 'loginUrl' parameter");
    }
    this.clients = new ClientRegistry(this.parameters);
    const url = this.parameters.url;
    this.addRoute("/.well-known/oauth-authorization-server", ["GET"], this.metadata, { hidden: true });
    this.addRoute(`${url}/authorize{?${AUTHORIZE_PARAMS.map(p => `${p}?`).join(",")}}`, ["GET"], this.authorize, {
      hidden: true
    });
    this.addRoute(`${url}/token`, ["POST"], this.token, { hidden: true });
    this.addRoute(`${url}/revoke`, ["POST"], this.revoke, { hidden: true });
    this.addRoute(`${url}/device_authorization`, ["POST"], this.deviceAuthorization, { hidden: true });
    this.addRoute(`${url}/consent`, ["GET"], this.consentPage, { hidden: true });
    this.addRoute(`${url}/device`, ["GET"], this.devicePage, { hidden: true });
    this.addRoute(`${url}/done`, ["GET"], this.resultPage, { hidden: true });
    return this;
  }

  /** @override */
  async init(): Promise<this> {
    await super.init();
    // The consent operations only see the pending cookie when their REST route is below its path
    const rest = Object.values(useCore().getServices()).find(
      (service): service is RESTOperationsTransport => service instanceof RESTOperationsTransport
    );
    const consent = rest ? `${rest.getParameters().url}oauth/consent` : undefined;
    if (consent && !consent.startsWith(`${this.parameters.url}/`)) {
      this.log(
        "WARN",
        `The REST routes of the consent operations (${consent}/...) are outside the pending request cookie path ` +
          `(${this.parameters.url}): browsers will not send it there`
      );
    }
    const sweep = () => this.sweep().catch(err => this.log("WARN", "OAuth sweep failed", err));
    await sweep();
    this.sweepTimer = setInterval(sweep, this.parameters.codeTtl * 10 * 1000);
    this.sweepTimer.unref();
    return this;
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
        // A re-consent since the read extended the grant: it survives
        try {
          await grant.ref().delete("expiresAt" as any, grant.expiresAt as any);
          return true;
        } catch (err) {
          if (!this.isConditionFailure(err)) throw err;
          return false;
        }
      }
    );
    return removed;
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
    // The issuer may come from the request Host: never let a shared cache keep it
    ctx.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Host" });
    ctx.write(
      JSON.stringify({
        issuer,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        revocation_endpoint: `${base}/revoke`,
        device_authorization_endpoint: `${base}/device_authorization`,
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
    const pending: PendingRequest = {
      flow: "code",
      clientId: client.id,
      redirectUri,
      state,
      codeChallenge: challenge,
      scope: formatScope(scope),
      hostname: this.cleanHostname(p("hostname")),
      csrf: randomToken(24),
      expires: Date.now() + PENDING_TTL * 1000
    };
    const prompt = p("prompt");
    const session = ctx.getSession();
    // A bearer (scoped) session cannot drive the authorization endpoint: consent comes from a browser session
    if (!session?.isLogged() || session.scopes !== undefined) {
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
      const remembered = await this.rememberedScope(session.userId!, client.id);
      if (remembered && covers(remembered, scope)) {
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
  @Operation({ id: "OAuth.Consent.Get", rest: { method: "get", path: "oauth/consent/request" } })
  async consentGet(): Promise<ConsentRequest> {
    const ctx = useContext<WebContext>();
    const pending = await this.requirePending(ctx);
    const client = await this.clients.get(pending.clientId);
    if (!client) throw new WebdaError.BadRequest("Unknown client");
    const requested = parseScope(pending.scope);
    const ops = listOperations();
    const callable = await this.callableOperations(ctx, requested);
    const userId = ctx.getSession().userId!;
    // Consent is never skipped for the device flow, the remembered scope only pre-selects in the code flow
    const remembered = pending.flow === "code" ? await this.rememberedScope(userId, client.id) : undefined;
    const groups = new Map<string, ConsentRequest["operations"][number]>();
    for (const id of callable) {
      const group = id.split(".")[0];
      if (!groups.has(group)) groups.set(group, { group, ids: [] });
      groups.get(group)!.ids.push({
        id,
        summary: ops[id]?.summary,
        preselected: remembered ? scopeMatches(remembered, id) : true
      });
    }
    return {
      flow: pending.flow,
      client: {
        id: client.id,
        name: client.name,
        logo: client.logo,
        uri: client.client_uri,
        host: client.metadataDocument ? new URL(client.id).host : undefined
      },
      user: { id: userId },
      hostname: pending.hostname,
      operations: [...groups.values()],
      offlineAccess: requested.includes(OFFLINE_ACCESS),
      rememberable: pending.flow === "code" && this.parameters.rememberConsent,
      csrf: pending.csrf
    };
  }

  /**
   * Record the user's decision on the pending request
   * @param allow - grant or deny
   * @param operations - selected operation ids
   * @param csrf - token from OAuth.Consent.Get
   * @param remember - remember the consent for this client
   * @returns where the browser goes next
   */
  @Operation({ id: "OAuth.Consent.Decide", rest: { method: "post", path: "oauth/consent/decide" } })
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
    const callable = await this.callableOperations(ctx, requested);
    // Only operation ids both requested and callable by the user: never a glob, never more than requested
    const selected = (Array.isArray(operations) ? operations : []).filter(
      (id): id is string => typeof id === "string" && callable.includes(id)
    );
    // A requested glob is kept only when every delegable operation it matches is selected, callable or not: a glob
    // covering operations the user never saw (a later role) would silently widen the grant
    let granted = collapse(selected, requested, this.delegableOperations());
    const client = await this.clients.get(pending.clientId);
    if (!client) throw new WebdaError.BadRequest("Unknown client");
    if (client.allowedScopes !== undefined) granted = intersect(granted, parseScope(client.allowedScopes));
    if (!operationGlobs(granted).length) throw new WebdaError.BadRequest("Select at least one operation");
    if (requested.includes(OFFLINE_ACCESS)) granted.push(OFFLINE_ACCESS);
    await this.clearPending(ctx);
    const identity = identityOf(ctx.getSession());
    if (pending.flow === "device") {
      await this.approveDevice(pending, identity, granted);
      return { redirect: withQuery(this.pageUrl(ctx, "result"), { status: "success", client: pending.clientId }) };
    }
    if (remember === true && this.parameters.rememberConsent) {
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
    // A bearer (scoped) session cannot consent: consent comes from a browser session
    if (!session?.isLogged() || session.scopes !== undefined) throw new WebdaError.Unauthorized("Login required");
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
   * Remember the consent of a user for a client, replacing the previous one
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
    ctx.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    ctx.write(message);
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
    const issued = await this.issueTokens(stored.identity, stored.clientId, parseScope(stored.scope), stored.name);
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
    const tokens = await this.tokenService().refresh(refreshToken, { clientId, scope: requested });
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
   * @returns the family and the response
   */
  protected async issueTokens(
    identity: GrantIdentity,
    clientId: string,
    scope: Scope,
    name?: string
  ): Promise<{ family: string; response: TokenResponse }> {
    const session = new Session();
    session.login(identity.userId, identity.identId, {
      provider: identity.provider,
      amr: identity.amr,
      mfa: identity.mfa
    });
    const tokens = await this.tokenService().issue(session, undefined, {
      clientId,
      scope,
      name,
      accessTtl: this.parameters.accessTtl,
      refreshTtl: this.parameters.refreshTtl
    });
    return { family: tokens.family, response: await this.tokenResponse(tokens, scope) };
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
      const family = (await this.refreshFamily(token, clientId)) ?? (await this.accessFamily(token, clientId));
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
   * @returns the family of the access token, when it is a valid one issued to the client
   */
  protected async accessFamily(token: string, clientId: string): Promise<string | undefined> {
    const claims = await this.tokenService().verifyAccess(token);
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
      // Families without offline_access have an expired, not revoked, record: they are not live sessions
      for await (const token of RefreshToken.iterate(
        "userId = ? AND clientId IS NOT NULL AND revokedAt IS NULL AND rotatedAt IS NULL AND expiresAt > ?",
        [userId, Date.now()]
      )) {
        sessions.push({
          family: token.family,
          clientId: token.clientId!,
          name: token.name,
          scope: token.scope,
          createdAt: (token as any).createdAt,
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
   * included, is JSON and never cached
   * @param ctx - web context
   */
  async deviceAuthorization(ctx: WebContext): Promise<void> {
    let status = 200;
    let payload: Record<string, string | number>;
    try {
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
  @Operation({ id: "OAuth.Device.Lookup", rest: { method: "post", path: "oauth/device/lookup" } })
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
    const times = this.lookupFailures.get(key)?.filter(t => t > now - LOOKUP_WINDOW) ?? [];
    if (times.length) this.lookupFailures.set(key, times);
    else this.lookupFailures.delete(key);
    return times.length;
  }

  /**
   * @param keys - rate limit keys
   * @param now - time of the failure
   */
  protected recordLookupFailure(keys: string[], now: number): void {
    for (const key of keys) {
      const times = this.lookupFailures.get(key) ?? [];
      times.push(now);
      // Re-inserted last: the map stays ordered by last failure
      this.lookupFailures.delete(key);
      this.lookupFailures.set(key, times);
    }
    while (this.lookupFailures.size > LOOKUP_MAX_KEYS) {
      this.lookupFailures.delete(this.lookupFailures.keys().next().value!);
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
    for (const key of [...this.lookupFailures.keys()]) this.countLookupFailures(key, now);
  }

  /**
   * Built-in consent page
   * @param _ctx - web context
   */
  async consentPage(_ctx: WebContext): Promise<void> {
    throw new WebdaError.NotFound("Not implemented");
  }

  /**
   * Built-in device code entry page
   * @param _ctx - web context
   */
  async devicePage(_ctx: WebContext): Promise<void> {
    throw new WebdaError.NotFound("Not implemented");
  }

  /**
   * Built-in result page
   * @param _ctx - web context
   */
  async resultPage(_ctx: WebContext): Promise<void> {
    throw new WebdaError.NotFound("Not implemented");
  }
}
