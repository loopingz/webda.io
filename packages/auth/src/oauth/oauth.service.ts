import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  type AsyncEventUnknown,
  type AuthResult,
  CookieOptions,
  type ProviderInfo,
  type ResolvedIdentity,
  registerOperation,
  Route,
  runAsSystem,
  runWithContext,
  SecureCookie,
  Service,
  ServiceParameters,
  useContext,
  useCrypto,
  useDynamicService,
  type WebContext,
  WebdaError
} from "@webda/core";
import { type AuthProvider, useAuthentication } from "../provider.js";
import { IdentLinkedElsewhere, TokenInvalid, UnsupportedMediaType } from "../errors.js";

/**
 * Credentials as returned by an OAuth token endpoint (google-auth-library `Credentials` shape): `id_token`,
 * `access_token`, `refresh_token`, `expiry_date`, `token_type`, `scope`... Values are not typed by the schema
 * (providers send nulls); providers check what they use.
 */
export interface OAuthTokens {
  /** Any provider field */
  [key: string]: any;
}

/**
 * Input of the `Auth.<Provider>.Token` operations: `token`, or the provider credentials `tokens`
 * @WebdaSchema
 */
export interface OAuthTokenRequest {
  /**
   * Token issued by the provider to the client (an ID token for OpenID Connect providers)
   */
  token?: string;
  /**
   * Credentials obtained by the client from the provider (v3 body; its `id_token` is verified)
   */
  tokens?: OAuthTokens;
}

/** Parameters of an authorization request */
export interface OAuthAuthorizationRequest {
  /** Random state to send back on the callback */
  state: string;
  /** Callback url */
  redirectUri: string;
  /** Scopes to request */
  scope: string[];
  /** PKCE code challenge (base64url SHA-256 of the verifier) */
  codeChallenge: string;
  /** PKCE method */
  codeChallengeMethod: "S256";
  /** OpenID Connect nonce: the ID token of the callback must carry it */
  nonce: string;
}

/** Parameters of a code exchange */
export interface OAuthCallbackRequest {
  /** Authorization code */
  code: string;
  /** redirect_uri of the authorization request */
  redirectUri: string;
  /** PKCE code verifier */
  codeVerifier: string;
  /** Nonce of the authorization request: providers returning an ID token must check it */
  nonce: string;
}

/** Browser redirects of the OAuth callback */
export interface OAuthRedirects {
  /**
   * Where a successful login lands when the login did not carry an allowed `redirect` parameter
   * @default "/"
   */
  success?: string;
  /**
   * Where a failed login or callback lands, with `?reason=<CODE>` (required)
   */
  failure?: string;
}

/** OAuthProvider parameters */
export class OAuthProviderParameters extends ServiceParameters {
  /**
   * Route prefix of the login (`<url>`) and callback (`<url>/callback`) routes
   * @default "/auth/<providerName>"
   */
  url?: string;
  /**
   * OAuth client id
   */
  client_id: string;
  /**
   * OAuth client secret
   */
  client_secret?: string;
  /**
   * Scopes requested from the provider (the default depends on the provider)
   */
  scope?: string[];
  /**
   * Callback url registered at the provider
   * @default "<absolute url of the request>/callback"; set it explicitly behind a proxy
   */
  redirect_uri?: string;
  /**
   * Allowed post-login targets for the `redirect` query parameter of the login route: absolute http(s) urls, a
   * target matches when it has the same origin and its path is the listed path or below it
   * @default []
   */
  authorized_uris?: string[];
  /**
   * Browser redirects of the callback
   */
  redirects?: OAuthRedirects;
  /** Only these email domains may use this provider (see ProviderEmailPolicy) */
  allowedEmailDomains?: string[];
  /** Whether the verification of the email is believed (see ProviderEmailPolicy) */
  trustEmailVerification?: boolean | string[];

  /**
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.authorized_uris ??= [];
    this.redirects = { success: "/", ...(this.redirects ?? {}) };
    return this;
  }
}

/** Pending login, kept in an encrypted cookie between the login and the callback */
interface PendingLogin {
  /** Provider that started it */
  provider: string;
  /** Random state sent to the provider */
  state: string;
  /** PKCE code verifier */
  verifier: string;
  /** OpenID Connect nonce */
  nonce: string;
  /** Post-login target, already checked against authorized_uris */
  redirect?: string;
  /** redirect_uri sent to the provider: the code exchange must use the same */
  redirectUri: string;
  /** Expiry timestamp (ms) */
  expires: number;
}

/** Validity of a pending login, in seconds */
const PENDING_TTL = 600;

/**
 * Maximum length of a login `redirect`: the pending login cookie must stay a single cookie (SecureCookie splits
 * values above ~4 KB, and the encrypted cookie is about 1.8 times the size of its content)
 */
const REDIRECT_MAX = 1024;

/**
 * @param err - any error
 * @returns the code of a WebdaError.HttpError, undefined for anything else
 */
function httpErrorCode(err: any): string | undefined {
  return typeof err?.getResponseCode === "function" &&
    typeof err?.code === "string" &&
    /^[A-Z][A-Z0-9_]*$/.test(err.code)
    ? err.code
    : undefined;
}

/**
 * Loggable reason of an error: library messages may contain tokens or their payload, so only a short code or the
 * error class name is kept
 * @param err - any error
 * @returns a reason without any part of the message
 */
export function safeErrorReason(err: any): string {
  const safe = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(value);
  const name = safe(err?.name) ? err.name : "Error";
  const code = err?.code;
  if (safe(code) || (typeof code === "number" && Number.isFinite(code))) {
    return `${name}(${code})`;
  }
  return name;
}

/** Credentials keys kept from a client `tokens` body */
const TOKEN_KEYS = ["id_token", "access_token", "refresh_token", "expiry_date", "token_type", "scope"];

/** Maximum length of a kept credentials value */
const TOKEN_VALUE_MAX = 4096;

/**
 * Keep only the known credentials keys, as bounded strings or finite numbers
 * @param tokens - client provided credentials
 * @returns the sanitised credentials
 */
export function sanitizeTokens(tokens: OAuthTokens): OAuthTokens {
  const out: OAuthTokens = {};
  for (const key of TOKEN_KEYS) {
    const value = tokens?.[key];
    if (
      (typeof value === "string" && value.length <= TOKEN_VALUE_MAX) ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * @param url - absolute or relative url
 * @param params - query parameters to add
 * @returns the url with the parameters appended
 */
function withQuery(url: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  const hash = url.indexOf("#");
  const [base, fragment] = hash < 0 ? [url, ""] : [url.substring(0, hash), url.substring(hash)];
  return `${base}${base.includes("?") ? "&" : "?"}${query}${fragment}`;
}

/**
 * @param url - candidate
 * @returns the parsed url when it is an absolute http(s) url without credentials
 */
function parseHttpUrl(url: unknown): URL | undefined {
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Constant-time comparison of two secrets
 * @param a - received value
 * @param b - expected value
 * @returns true when equal
 */
function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * @param bytes - entropy
 * @returns a random base64url string
 */
function randomSecret(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Base of the OAuth 2.0 / OpenID Connect login providers
 *
 * Exposes, under `url` (default `/auth/<providerName>`):
 * - `GET <url>{?redirect}`: starts a login with a random `state`, a PKCE (S256) verifier and an OpenID `nonce`, kept
 *   in a dedicated encrypted cookie (10 min, HttpOnly, SameSite=Lax, path `url`), then redirects to the provider;
 *   `redirect` must match `authorized_uris`
 * - `GET <url>/callback`: consumes that cookie, checks the state, exchanges the code (`handleCallback`) and hands
 *   the identity to `Authentication.complete()`; never throws, failures go to `redirects.failure?reason=<CODE>`
 * - operation `Auth.<Provider>.Token` (`POST auth/<providerName>/token`, JSON body `{ token }` or `{ tokens }`) for
 *   non-browser clients; it never links an identity to the session user
 *
 * Subclasses implement `providerName`, `getAuthorizationUrl`, `handleCallback` and `handleToken`; the provider of the
 * returned identities is always forced to `providerName`.
 */
export abstract class OAuthProvider<
  T extends OAuthProviderParameters = OAuthProviderParameters,
  E extends AsyncEventUnknown = {}
>
  extends Service<T, E>
  implements AuthProvider
{
  static Parameters = OAuthProviderParameters;

  /** Unique provider name, used in ident keys ("google") */
  abstract readonly providerName: string;

  /**
   * Build the authorization url of the provider, sending the PKCE challenge and the nonce
   * @param request - authorization request
   * @returns the url to redirect the browser to
   */
  abstract getAuthorizationUrl(request: OAuthAuthorizationRequest): string | Promise<string>;

  /**
   * Exchange an authorization code (with the PKCE verifier) and verify the result, including the nonce of an ID
   * token
   * @param request - code exchange
   * @returns the identity proven by the provider
   * @throws an HttpError (for example TokenInvalid) whose code is used as the failure reason
   */
  abstract handleCallback(request: OAuthCallbackRequest): Promise<ResolvedIdentity>;

  /**
   * Verify a token presented by a non-browser client
   * @param request - `token` and/or `tokens` (at least one is present)
   * @returns the identity proven by the provider
   * @throws TokenInvalid when the token cannot be verified
   */
  abstract handleToken(request: OAuthTokenRequest): Promise<ResolvedIdentity>;

  /**
   * Called after a successful `Authentication.complete()` (status ok or mfa_required)
   * @param _identity - the identity
   * @param _result - the result
   * @param _source - browser callback or token operation
   * @param _request - the token operation request (token operation only)
   */
  protected async onAuthenticated(
    _identity: ResolvedIdentity,
    _result: AuthResult,
    _source: "callback" | "token",
    _request?: OAuthTokenRequest
  ): Promise<void> {
    // Hook for providers
  }

  /**
   * @returns false when the provider works without client secret (public clients)
   */
  protected requiresClientSecret(): boolean {
    return true;
  }

  /**
   * @returns the name of the pending login cookie
   */
  protected getCookieName(): string {
    return `webda_oauth_${this.providerName}`;
  }

  /** @override */
  resolve(): this {
    super.resolve();
    this.parameters.url ??= `/auth/${this.providerName}`;
    return this;
  }

  /** @override */
  async init(): Promise<this> {
    await super.init();
    const name = `${this.constructor.name} '${this.getName()}'`;
    const params = this.parameters;
    if (!params.client_id) {
      throw new Error(`${name} requires the 'client_id' parameter`);
    }
    if (this.requiresClientSecret() && !params.client_secret) {
      throw new Error(`${name} requires the 'client_secret' parameter`);
    }
    if (!params.redirects?.failure) {
      throw new Error(`${name} requires the 'redirects.failure' parameter`);
    }
    if (!useDynamicService("Authentication")) {
      throw new Error(`${name} requires the Authentication service`);
    }
    for (const uri of params.authorized_uris ?? []) {
      if (!parseHttpUrl(uri)) {
        throw new Error(`${name}: authorized_uris entries must be absolute http(s) urls, got '${uri}'`);
      }
    }
    return this;
  }

  /**
   * Register `Auth.<Provider>.Token`: its id and path depend on the provider name
   * @override
   */
  initOperations(): void {
    super.initOperations();
    const name = this.providerName;
    const id = this.getOperationId(`Auth.${name.substring(0, 1).toUpperCase()}${name.substring(1)}.Token`);
    if (!id) return;
    registerOperation(id, {
      service: this.getName(),
      method: "token",
      // Schemas are compiled per class: a shared named schema serves every provider
      input: "Webda/OAuthTokenRequest",
      summary: `Log in with a ${name} token`,
      tags: ["Authentication"],
      rest: { method: "post", path: `auth/${name}/token` }
    } as any);
  }

  /**
   * @returns public info
   */
  getPublicInfo(): ProviderInfo {
    return { name: this.providerName, type: "oauth", startUrl: this.parameters.url ?? `/auth/${this.providerName}` };
  }

  /**
   * Log in with a token obtained by the client from the provider
   *
   * Requires a JSON request (a cross-site form or `text/plain` POST is refused). A request carrying a logged-in
   * session never links the identity to that user: an identity owned by another user is refused
   * (IDENT_LINKED_ELSEWHERE), a new or unowned one gets a fresh session.
   * @param token - token (an ID token for OpenID Connect providers)
   * @param tokens - credentials obtained from the provider (v3 body)
   * @returns the auth result
   */
  async token(token?: string, tokens?: OAuthTokens): Promise<AuthResult> {
    const ctx = useContext<any>();
    this.requireJson(ctx);
    if (token !== undefined && (typeof token !== "string" || !token)) {
      throw new WebdaError.BadRequest("token must be a non-empty string");
    }
    if (tokens !== undefined && (tokens === null || typeof tokens !== "object" || Array.isArray(tokens))) {
      throw new WebdaError.BadRequest("tokens must be an object");
    }
    if (!token && !tokens) {
      throw new WebdaError.BadRequest("token or tokens is required");
    }
    // Only known credentials keys are verified, stored or published
    tokens = tokens ? sanitizeTokens(tokens) : undefined;
    let identity: ResolvedIdentity;
    try {
      identity = this.ownIdentity(this.checkIdentity(await this.handleToken({ token, tokens })));
    } catch (err) {
      if (httpErrorCode(err)) throw err;
      // Fail closed: an unexpected verification failure is an invalid token
      this.log("WARN", `${this.providerName} token verification failed:`, safeErrorReason(err));
      throw new TokenInvalid();
    }
    await this.leaveForeignSession(ctx, identity);
    const result = await useAuthentication().complete(identity);
    await this.onAuthenticated(identity, result, "token", { token, tokens });
    return result;
  }

  /**
   * Refuse a request that is not JSON: cross-site requests can only send form or `text/plain` bodies without a
   * preflight
   * @param ctx - operation context
   * @throws UnsupportedMediaType when the HTTP request is not `application/json`
   */
  protected requireJson(ctx: any): void {
    const http = ctx?.getHttpContext?.();
    if (!http) return;
    const type = `${http.getUniqueHeader?.("content-type", "") ?? ""}`;
    if (!/^application\/json\s*(;|$)/i.test(type.trim())) {
      throw new UnsupportedMediaType();
    }
  }

  /**
   * The token operation never links: with a logged-in session, an identity owned by another user is refused and a
   * new or unowned one starts a fresh session
   * @param ctx - operation context
   * @param identity - verified identity
   * @throws IdentLinkedElsewhere when the identity belongs to another user than the session one
   */
  protected async leaveForeignSession(ctx: any, identity: ResolvedIdentity): Promise<void> {
    if (!ctx?.getSession?.()?.isLogged()) return;
    const current = ctx.getCurrentUserId();
    const ident = await runAsSystem(() =>
      (useAuthentication() as any).findIdent(identity.provider, identity.providerUid)
    );
    const owner = ident?.getUser()?.toString();
    if (owner === current) return;
    if (owner) {
      throw new IdentLinkedElsewhere();
    }
    ctx.newSession();
  }

  /**
   * @param identity - identity returned by the subclass
   * @returns the identity
   * @throws TokenInvalid when it has no subject
   */
  protected checkIdentity(identity: ResolvedIdentity): ResolvedIdentity {
    if (!identity?.providerUid || typeof identity.providerUid !== "string") {
      throw new TokenInvalid("Provider returned no subject");
    }
    return identity;
  }

  /**
   * @param identity - identity returned by the subclass
   * @returns the identity, always attributed to this provider
   */
  protected ownIdentity(identity: ResolvedIdentity): ResolvedIdentity {
    return {
      ...identity,
      provider: this.providerName,
      amr: identity.amr?.length ? identity.amr : ["oauth"]
    };
  }

  /**
   * Check a post-login target against `authorized_uris`: same origin, and the listed path or below it; an encoded
   * slash or backslash in the path is refused
   * @param redirect - candidate
   * @returns the normalised url, undefined when not allowed
   */
  protected allowedRedirect(redirect: unknown): string | undefined {
    if (typeof redirect !== "string" || redirect.length > REDIRECT_MAX || /%2f|%5c/i.test(redirect.split(/[?#]/)[0])) {
      return undefined;
    }
    const target = parseHttpUrl(redirect);
    if (!target) return undefined;
    for (const uri of this.parameters.authorized_uris ?? []) {
      const allowed = parseHttpUrl(uri);
      if (!allowed || allowed.origin !== target.origin) continue;
      const path = allowed.pathname;
      if (target.pathname === path || target.pathname.startsWith(path.endsWith("/") ? path : `${path}/`)) {
        return target.href;
      }
    }
    return undefined;
  }

  /**
   * @param ctx - web context
   * @returns the callback url sent to the provider
   */
  protected getRedirectUri(ctx: WebContext): string {
    return this.parameters.redirect_uri ?? ctx.getHttpContext().getAbsoluteUrl(`${this.parameters.url ?? ""}/callback`);
  }

  /**
   * Set (or clear, without value) the pending login cookie, scoped to the callback path: the path of the effective
   * redirect_uri, which includes any deployment prefix (API Gateway stage, path-stripping proxy) the routes do not see
   * @param ctx - web context
   * @param redirectUri - callback url
   * @param value - encrypted pending login
   */
  protected sendPendingCookie(ctx: WebContext, redirectUri: string, value?: string): void {
    const callback = parseHttpUrl(redirectUri);
    const options = new CookieOptions(
      {
        name: this.getCookieName(),
        path: callback?.pathname || "/",
        maxAge: value ? PENDING_TTL : 0,
        sameSite: "lax",
        httpOnly: true
      },
      ctx.getHttpContext()
    );
    // Secure when the request or the callback is https
    options.secure = options.secure || callback?.protocol === "https:";
    if (value) {
      SecureCookie.sendCookie(ctx, this.getCookieName(), value, options);
    } else {
      ctx.cookie(this.getCookieName(), "", options);
    }
  }

  /**
   * Read and clear the pending login cookie
   * @param ctx - web context
   * @returns the pending login, undefined when absent, invalid, expired or of another provider
   */
  protected async consumePending(ctx: WebContext): Promise<PendingLogin | undefined> {
    const raw = ctx.getHttpContext()?.getCookies?.()?.[this.getCookieName()];
    // Always cleared, on the path it was set on (the callback): single use
    this.sendPendingCookie(ctx, this.getRedirectUri(ctx));
    if (typeof raw !== "string" || !raw) return undefined;
    let pending: PendingLogin;
    try {
      pending = await useCrypto().decrypt(raw);
    } catch {
      return undefined;
    }
    if (
      !pending ||
      pending.provider !== this.providerName ||
      typeof pending.state !== "string" ||
      typeof pending.verifier !== "string" ||
      typeof pending.nonce !== "string" ||
      !(Date.now() <= pending.expires)
    ) {
      return undefined;
    }
    return pending;
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
   * @param ctx - web context
   * @param reason - failure code
   */
  protected fail(ctx: WebContext, reason: string): void {
    this.redirect(ctx, withQuery(this.parameters.redirects.failure, { reason }));
  }

  /**
   * Start a login: redirect the browser to the provider
   * @param ctx - web context
   */
  @Route(".{?redirect?}", ["GET"], {
    get: {
      summary: "Start an OAuth login",
      description: "Redirects to the provider; `redirect` must match the provider authorized_uris",
      responses: { "302": { description: "Redirect to the provider, or to redirects.failure" } }
    }
  })
  async login(ctx: WebContext): Promise<void> {
    try {
      const requested = ctx.parameter("redirect");
      let redirect: string | undefined;
      if (requested !== undefined && requested !== "") {
        redirect = this.allowedRedirect(requested);
        if (!redirect) {
          this.fail(ctx, "REDIRECT_NOT_ALLOWED");
          return;
        }
      }
      const pending: PendingLogin = {
        provider: this.providerName,
        state: randomSecret(32),
        verifier: randomSecret(32),
        nonce: randomSecret(24),
        redirect,
        redirectUri: this.getRedirectUri(ctx),
        expires: Date.now() + PENDING_TTL * 1000
      };
      const url = await this.getAuthorizationUrl({
        state: pending.state,
        redirectUri: pending.redirectUri,
        scope: this.parameters.scope ?? [],
        codeChallenge: createHash("sha256").update(pending.verifier).digest("base64url"),
        codeChallengeMethod: "S256",
        nonce: pending.nonce
      });
      this.sendPendingCookie(ctx, pending.redirectUri, await useCrypto().encrypt(pending));
      this.redirect(ctx, url);
    } catch (err) {
      this.log("ERROR", `Cannot start ${this.providerName} login:`, safeErrorReason(err));
      this.fail(ctx, "OAUTH_ERROR");
    }
  }

  /**
   * Provider callback: verify the state, exchange the code, complete the login and redirect; never throws
   * @param ctx - web context
   */
  @Route("./callback{?code?,state?,error?}", ["GET"], {
    get: {
      summary: "OAuth callback",
      description: "Completes the login started by the login route",
      responses: { "302": { description: "Redirect to the login target, or to redirects.failure?reason=CODE" } }
    }
  })
  async callback(ctx: WebContext): Promise<void> {
    try {
      const pending = await this.consumePending(ctx);
      const state = ctx.parameter("state");
      if (!pending || typeof state !== "string" || !sameSecret(state, pending.state)) {
        this.fail(ctx, "STATE_MISMATCH");
        return;
      }
      const code = ctx.parameter("code");
      if (ctx.parameter("error") !== undefined || typeof code !== "string" || !code) {
        this.fail(ctx, "PROVIDER_ERROR");
        return;
      }
      const result = await runWithContext(ctx, async () => {
        const identity = this.ownIdentity(
          this.checkIdentity(
            await this.handleCallback({
              code,
              redirectUri: pending.redirectUri,
              codeVerifier: pending.verifier,
              nonce: pending.nonce
            })
          )
        );
        const res = await useAuthentication().complete(identity);
        await this.onAuthenticated(identity, res, "callback");
        return res;
      });
      const target = pending.redirect ?? this.parameters.redirects.success ?? "/";
      this.redirect(ctx, result.status === "mfa_required" ? withQuery(target, { mfa: "required" }) : target);
    } catch (err) {
      const code = httpErrorCode(err);
      if (!code) {
        this.log("ERROR", `${this.providerName} callback failed:`, safeErrorReason(err));
      }
      this.fail(ctx, code ?? "OAUTH_ERROR");
    }
  }
}
