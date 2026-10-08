import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  type AuthResult,
  type ProviderInfo,
  type ResolvedIdentity,
  registerOperation,
  Route,
  runWithContext,
  Service,
  ServiceParameters,
  useDynamicService,
  type WebContext,
  WebdaError
} from "@webda/core";
import { type AuthProvider, useAuthentication } from "../provider.js";
import { TokenInvalid } from "../errors.js";

/**
 * Input of the `Auth.<Provider>.Token` operations
 * @WebdaSchema
 */
export interface OAuthTokenRequest {
  /**
   * Token issued by the provider to the client (an ID token for OpenID Connect providers)
   */
  token: string;
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

/** Pending login stored in the session, per provider */
interface PendingLogin {
  /** Random state sent to the provider */
  state: string;
  /** Post-login target, already checked against authorized_uris */
  redirect?: string;
  /** redirect_uri sent to the provider: the code exchange must use the same */
  redirectUri: string;
  /** Expiry timestamp (ms) */
  expires: number;
}

/** Validity of a pending login */
const STATE_TTL = 10 * 60 * 1000;

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
 * Base of the OAuth 2.0 / OpenID Connect login providers
 *
 * Exposes, under `url` (default `/auth/<providerName>`):
 * - `GET <url>{?redirect}`: starts a login, stores a random single-use `state` (10 min) in the session and redirects
 *   to the provider; `redirect` must match `authorized_uris`
 * - `GET <url>/callback`: checks the state, exchanges the code (`handleCallback`), hands the identity to
 *   `Authentication.complete()` then redirects; never throws, failures go to `redirects.failure?reason=<CODE>`
 * - operation `Auth.<Provider>.Token` (`POST auth/<providerName>/token`, body `{ token }`) for non-browser clients
 *
 * Subclasses implement `providerName`, `getAuthorizationUrl`, `handleCallback` and `handleToken`; the provider of the
 * returned identities is always forced to `providerName`.
 */
export abstract class OAuthProvider<T extends OAuthProviderParameters = OAuthProviderParameters>
  extends Service<T>
  implements AuthProvider
{
  static Parameters = OAuthProviderParameters;

  /** Unique provider name, used in ident keys ("google") */
  abstract readonly providerName: string;

  /**
   * Build the authorization url of the provider
   * @param state - random state to send back on the callback
   * @param redirectUri - callback url
   * @param scope - scopes to request
   * @returns the url to redirect the browser to
   */
  abstract getAuthorizationUrl(state: string, redirectUri: string, scope: string[]): string | Promise<string>;

  /**
   * Exchange an authorization code and verify the result
   * @param code - authorization code from the callback
   * @param redirectUri - redirect_uri used for the authorization request
   * @returns the identity proven by the provider
   * @throws an HttpError (for example TokenInvalid) whose code is used as the failure reason
   */
  abstract handleCallback(code: string, redirectUri: string): Promise<ResolvedIdentity>;

  /**
   * Verify a token presented by a non-browser client
   * @param token - token
   * @returns the identity proven by the provider
   * @throws TokenInvalid when the token cannot be verified
   */
  abstract handleToken(token: string): Promise<ResolvedIdentity>;

  /**
   * @returns false when the provider works without client secret (public clients)
   */
  protected requiresClientSecret(): boolean {
    return true;
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
   * @param token - token
   * @returns the auth result
   */
  async token(token: string): Promise<AuthResult> {
    if (typeof token !== "string" || !token) {
      throw new WebdaError.BadRequest("token is required");
    }
    let identity: ResolvedIdentity;
    try {
      identity = this.ownIdentity(this.checkIdentity(await this.handleToken(token)));
    } catch (err) {
      if (httpErrorCode(err)) throw err;
      // Fail closed: an unexpected verification failure is an invalid token
      this.log("WARN", `${this.providerName} token verification failed`, (err as any)?.message);
      throw new TokenInvalid();
    }
    return useAuthentication().complete(identity);
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
   * Check a post-login target against `authorized_uris`: same origin, and the listed path or below it
   * @param redirect - candidate
   * @returns the normalised url, undefined when not allowed
   */
  protected allowedRedirect(redirect: unknown): string | undefined {
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
   * @param ctx - web context
   * @returns the session, created when missing
   */
  protected sessionOf(ctx: WebContext): any {
    return ctx.getSession<any>() ?? ctx.newSession();
  }

  /**
   * Remove and return the pending login of this provider
   * @param ctx - web context
   * @returns the pending login, if any
   */
  protected consumePending(ctx: WebContext): PendingLogin | undefined {
    const session = this.sessionOf(ctx);
    const all = session.oauth;
    const pending: PendingLogin | undefined = all?.[this.providerName];
    if (pending) {
      const rest = { ...all };
      delete rest[this.providerName];
      // Assigned (not deleted) so the session is marked dirty and saved
      session.oauth = Object.keys(rest).length ? rest : undefined;
    }
    return pending;
  }

  /**
   * @param ctx - web context
   * @param reason - failure code
   */
  protected fail(ctx: WebContext, reason: string): void {
    ctx.redirect(withQuery(this.parameters.redirects.failure, { reason }));
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
      const state = randomBytes(32).toString("base64url");
      const redirectUri = this.getRedirectUri(ctx);
      const url = await this.getAuthorizationUrl(state, redirectUri, this.parameters.scope ?? []);
      const session = this.sessionOf(ctx);
      const pending: PendingLogin = { state, redirect, redirectUri, expires: Date.now() + STATE_TTL };
      session.oauth = { ...(session.oauth ?? {}), [this.providerName]: pending };
      ctx.redirect(url);
    } catch (err) {
      this.log("ERROR", `Cannot start ${this.providerName} login`, (err as any)?.message);
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
      const pending = this.consumePending(ctx);
      const state = ctx.parameter("state");
      if (!pending || typeof state !== "string" || Date.now() > pending.expires || !sameSecret(state, pending.state)) {
        this.fail(ctx, "STATE_MISMATCH");
        return;
      }
      const code = ctx.parameter("code");
      if (ctx.parameter("error") !== undefined || typeof code !== "string" || !code) {
        this.fail(ctx, "PROVIDER_ERROR");
        return;
      }
      const result = await runWithContext(ctx, async () => {
        const identity = this.ownIdentity(this.checkIdentity(await this.handleCallback(code, pending.redirectUri)));
        return useAuthentication().complete(identity);
      });
      const target = pending.redirect ?? this.parameters.redirects.success ?? "/";
      ctx.redirect(result.status === "mfa_required" ? withQuery(target, { mfa: "required" }) : target);
    } catch (err) {
      const code = httpErrorCode(err);
      if (!code) {
        this.log("ERROR", `${this.providerName} callback failed`, (err as any)?.message);
      }
      this.fail(ctx, code ?? "OAUTH_ERROR");
    }
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
