import {
  covers,
  formatScope,
  intersect,
  InvalidScope,
  listOperations,
  OFFLINE_ACCESS,
  OperationIdTransport,
  operationGlobs,
  parseScope,
  type Scope,
  Service,
  useCore,
  type WebContext,
  WebdaError
} from "@webda/core";
import { ClientRegistry } from "./clients.js";
import { randomToken } from "./devicecode.js";
import { type GrantIdentity, OAuthGrant } from "./models.model.js";
import { OAuthServerParameters } from "./parameters.js";
import { type PendingRequest, PENDING_TTL, writePending } from "./pending.js";

/** Name of the pending request cookie */
export const PENDING_COOKIE = "webda_oauth_pending";
/** Maximum length of the `state` parameter */
const MAX_STATE = 512;
/** Maximum length of the `scope` parameter */
const MAX_SCOPE = 2048;
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

/**
 * OAuth 2.1 authorization server issuing scoped TokenService tokens to native and MCP clients
 *
 * Routes:
 * - `GET /.well-known/oauth-authorization-server`: server metadata (RFC 8414)
 * - `GET <url>/authorize`: authorization endpoint (code flow, PKCE S256 only)
 *
 * @WebdaModda OAuthServer
 */
export class OAuthServer<T extends OAuthServerParameters = OAuthServerParameters> extends Service<T> {
  /** Client resolution */
  clients: ClientRegistry;

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
    ctx.writeHead(200, { "Content-Type": "application/json" });
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
   * @returns advertised scopes: configured, or `*`, the top-level operation groups and `offline_access`
   */
  protected scopesSupported(): string[] {
    if (this.parameters.scopesSupported) return this.parameters.scopesSupported;
    const groups = new Set(Object.keys(listOperations()).map(id => `${id.split(".")[0]}.*`));
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
      const raw = p("scope") ?? client.defaultScope ?? "";
      if (raw.length > MAX_SCOPE) throw new InvalidScope("Scope is too long");
      scope = parseScope(raw);
      if (client.allowedScopes !== undefined && !covers(parseScope(client.allowedScopes), scope)) {
        throw new InvalidScope("Scope exceeds what the client may request");
      }
    } catch (err) {
      return fail("invalid_scope", (err as Error).message);
    }
    if (!operationGlobs(scope).length) return fail("invalid_scope", "No operation requested");
    const pending: PendingRequest = {
      flow: "code",
      clientId: client.id,
      redirectUri,
      state,
      codeChallenge: challenge,
      scope: formatScope(scope),
      hostname: p("hostname")?.slice(0, 64),
      csrf: randomToken(24),
      expires: Date.now() + PENDING_TTL * 1000
    };
    const prompt = p("prompt");
    const session = ctx.getSession();
    // A bearer (scoped) session cannot drive the authorization endpoint: consent comes from a browser session
    if (!session?.isLogged() || session.scopes !== undefined) {
      if (prompt === "none") return fail("login_required", "Login required");
      await writePending(ctx, PENDING_COOKIE, this.pendingPath(ctx), pending);
      const login = this.parameters.loginUrl;
      return this.redirect(
        ctx,
        `${login}${login.includes("?") ? "&" : "?"}redirect=${encodeURIComponent(this.pageUrl(ctx, "consent"))}`
      );
    }
    if (prompt !== "consent") {
      const remembered = await this.rememberedScope(session.userId!, client.id);
      if (remembered && covers(remembered, scope)) {
        return this.approveCode(ctx, pending, intersect(scope, remembered));
      }
      if (prompt === "none") return fail("consent_required", "Consent required");
    }
    await writePending(ctx, PENDING_COOKIE, this.pendingPath(ctx), pending);
    return this.redirect(ctx, this.pageUrl(ctx, "consent"));
  }

  /**
   * Remembered consent of a user for a client; its use is recorded
   * @param userId - user
   * @param clientId - client
   * @returns the remembered scope, undefined when none, expired or when remembering consent is disabled
   */
  protected async rememberedScope(userId: string, clientId: string): Promise<Scope | undefined> {
    if (!this.parameters.rememberConsent) return undefined;
    const ref = OAuthGrant.ref(`${userId}:${clientId}`);
    if (!(await ref.exists())) return undefined;
    const grant = await ref.get();
    const now = Date.now();
    if (!(grant.expiresAt > now)) return undefined;
    await ref.patch({ lastUsedAt: now });
    return parseScope(grant.scope);
  }

  /**
   * Issue an authorization code for an approved request and redirect to the client
   * @param _ctx - web context
   * @param _pending - pending request
   * @param _scope - granted scope
   */
  protected async approveCode(_ctx: WebContext, _pending: PendingRequest, _scope: Scope): Promise<void> {
    throw new WebdaError.CodeError("NOT_IMPLEMENTED", "Authorization code approval is not implemented yet");
  }

  /**
   * Create an authorization code
   * @param _pending - pending request
   * @param _identity - identity of the user
   * @param _scope - granted scope
   * @returns the code
   */
  protected async issueCode(_pending: PendingRequest, _identity: GrantIdentity, _scope: Scope): Promise<string> {
    throw new WebdaError.CodeError("NOT_IMPLEMENTED", "Authorization code issuance is not implemented yet");
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
   * Token endpoint
   * @param _ctx - web context
   */
  async token(_ctx: WebContext): Promise<void> {
    throw new WebdaError.NotFound("Not implemented");
  }

  /**
   * Revocation endpoint
   * @param _ctx - web context
   */
  async revoke(_ctx: WebContext): Promise<void> {
    throw new WebdaError.NotFound("Not implemented");
  }

  /**
   * Device authorization endpoint
   * @param _ctx - web context
   */
  async deviceAuthorization(_ctx: WebContext): Promise<void> {
    throw new WebdaError.NotFound("Not implemented");
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
