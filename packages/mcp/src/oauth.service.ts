import {
  listOperations,
  OFFLINE_ACCESS,
  registerProtectedResource,
  Service,
  ServiceParameters,
  WebdaError,
  unregisterProtectedResource,
  useService,
  type Session,
  type WebContext
} from "@webda/core";
import type { McpAuthenticator } from "./auth.js";
import { isDelegable } from "./server.js";

/**
 * McpOAuthAuthenticator parameters
 */
export class McpOAuthAuthenticatorParameters extends ServiceParameters {
  /**
   * Authorization servers advertised in the protected resource metadata; defaults to `publicUrl` when set, otherwise
   * the request origin (with the application prefix)
   */
  authorizationServers?: string[];
  /**
   * Path serving the RFC 9728 protected resource metadata
   * @default "/.well-known/oauth-protected-resource"
   */
  resourceMetadataPath: string;
  /**
   * Scopes advertised in the protected resource metadata (`scopes_supported`); defaults to what the Webda authorization
   * server advertises: `*`, the top-level operation groups (`<Group>.*`) and `offline_access`
   */
  scopesSupported?: string[];
  /**
   * Canonical public origin of the application (absolute, e.g. `https://mcp.example.com`): the token audience and the
   * advertised resource are derived from it instead of the request headers. Set it in production, notably behind a proxy
   */
  publicUrl?: string;

  /**
   * @param params - raw parameters
   * @returns this with defaults applied
   */
  load(params: any = {}): this {
    super.load(params);
    this.resourceMetadataPath ??= "/.well-known/oauth-protected-resource";
    if (this.publicUrl) {
      this.publicUrl = this.publicUrl.replace(/\/+$/, "");
    }
    return this;
  }
}

/**
 * MCP authenticator requiring an OAuth bearer token (RFC 9728 protected resource).
 *
 * It only knows the authorization server by URL: it does not depend on `@webda/oauth`.
 * Scope enforcement is done by core on every operation call.
 *
 * @WebdaModda McpOAuthAuthenticator
 */
export class McpOAuthAuthenticator<T extends McpOAuthAuthenticatorParameters = McpOAuthAuthenticatorParameters>
  extends Service<T>
  implements McpAuthenticator
{
  /**
   * @param params - raw parameters
   * @returns typed parameters
   */
  static createConfiguration(params: any = {}): McpOAuthAuthenticatorParameters {
    return new McpOAuthAuthenticatorParameters().load(params);
  }

  /** MCP endpoint paths protected by this authenticator, bound by the McpService using it */
  protected resources: string[] = [];

  /**
   * Called by the McpService using this authenticator: the resource is the endpoint it serves
   * @param path - MCP endpoint path (application relative)
   */
  bindResource(path: string): void {
    if (!this.resources.includes(path)) {
      this.resources.push(path);
    }
  }

  /**
   * Mount the metadata routes: the base path, and the RFC 9728 path-suffixed form per resource
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    const base = this.parameters.resourceMetadataPath;
    this.addRoute(base, ["GET"], this.metadata, { hidden: true } as any);
    for (const resource of this.resources) {
      this.addRoute(`${base}${resource}`, ["GET"], this.metadata, { hidden: true } as any);
    }
    const publicUrl = this.parameters.publicUrl;
    for (const path of this.resources) {
      registerProtectedResource({ path, uri: publicUrl ? publicUrl + path : undefined });
    }
    if (!publicUrl) {
      this.log(
        "WARN",
        "McpOAuthAuthenticator: publicUrl is not set, the token audience is derived from the request host (development only)"
      );
    }
    return this;
  }

  /**
   * Unregister the protected resources
   */
  async stop(): Promise<void> {
    for (const path of this.resources) {
      unregisterProtectedResource(path);
    }
    await super.stop();
  }

  /**
   * @param ctx - web context
   * @param path - application path
   * @returns `publicUrl` + path when configured, else the request based absolute URL
   */
  protected resourceUri(ctx: WebContext, path: string): string {
    const publicUrl = this.parameters.publicUrl;
    return publicUrl ? publicUrl + path : this.absolute(ctx, path);
  }

  /**
   * @param ctx - web context
   * @returns the absolute protected resource metadata URL for the resource the request targets
   */
  resourceMetadataUrl(ctx: WebContext): string {
    return this.resourceUri(ctx, this.metadataPath(this.resourceFor(ctx)));
  }

  /**
   * @param ctx - web context
   * @param path - application path
   * @returns the absolute URL of an application path, keeping the request prefix
   */
  protected absolute(ctx: WebContext, path: string): string {
    const http = ctx.getHttpContext();
    const host = (http.getUniqueHeader("x-forwarded-host") || http.getUniqueHeader("host") || "").split(",")[0].trim();
    if (host && !/[/\\@?#\s]/.test(host)) {
      try {
        return `${new URL(`${http.getProtocol() || "http:"}//${host}`).origin}${http.prefix}${path}`;
      } catch {
        // fall through
      }
    }
    return http.getAbsoluteUrl(path);
  }

  /**
   * @param ctx - web context
   * @returns the MCP endpoint path the request targets
   */
  protected resourceFor(ctx: WebContext): string {
    const path = ctx.getHttpContext().getRelativeUri().split("?")[0];
    const base = this.parameters.resourceMetadataPath;
    if (path.startsWith(base) && path.length > base.length) {
      return path.substring(base.length);
    }
    return this.resources.find(r => path === r) ?? this.resources[0] ?? "/mcp";
  }

  /**
   * @param resource - MCP endpoint path
   * @returns the metadata path for it: suffixed form when several resources share this authenticator
   */
  protected metadataPath(resource: string): string {
    const base = this.parameters.resourceMetadataPath;
    return this.resources.length > 1 ? `${base}${resource}` : base;
  }

  /**
   * Serve the protected resource metadata
   * @param ctx - web context
   */
  async metadata(ctx: WebContext): Promise<void> {
    const resource = this.resourceFor(ctx);
    ctx.setHeader("Content-Type", "application/json");
    ctx.setHeader("Cache-Control", "no-store");
    ctx.setHeader("Vary", "Host");
    ctx.write(
      JSON.stringify({
        resource: this.resourceUri(ctx, resource),
        authorization_servers: this.parameters.authorizationServers ?? [this.resourceUri(ctx, "")],
        scopes_supported: this.scopesSupported(),
        bearer_methods_supported: ["header"]
      })
    );
  }

  /**
   * The scopes are operation globs: the default is computed from the operation registry like the Webda authorization
   * server does, without depending on it. The OAuth operations are never delegated
   * @returns advertised scopes
   */
  protected scopesSupported(): string[] {
    if (this.parameters.scopesSupported) return this.parameters.scopesSupported;
    const groups = new Set(
      Object.keys(listOperations())
        .filter(isDelegable)
        .map(id => `${id.split(".")[0]}.*`)
    );
    return ["*", ...groups, OFFLINE_ACCESS];
  }

  /**
   * @param ctx - web context
   * @returns the bearer session
   * @throws Unauthorized with a `WWW-Authenticate` challenge when there is no valid bearer token for this resource
   */
  async authenticate(ctx: WebContext): Promise<Session> {
    const header = ctx.getHttpContext().getUniqueHeader("authorization") ?? "";
    const token = /^Bearer\s/i.test(header) ? header.slice(7).trim() : undefined;
    const session = token
      ? await useService("SessionManager").sessionFromAccessToken(token, {
          audience: this.resourceUri(ctx, this.resourceFor(ctx))
        })
      : undefined;
    if (!session?.isLogged()) {
      ctx.setHeader(
        "WWW-Authenticate",
        `Bearer${token ? ' error="invalid_token",' : ""} resource_metadata="${this.resourceMetadataUrl(ctx)}"`
      );
      throw new WebdaError.Unauthorized("Bearer token required");
    }
    // Operations called by the MCP tools read the context session
    ctx.setSession(session);
    return session;
  }
}
