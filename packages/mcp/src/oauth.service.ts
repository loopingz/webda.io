import { Service, ServiceParameters, WebdaError, type Session, type WebContext } from "@webda/core";
import type { McpAuthenticator } from "./auth.js";

/**
 * McpOAuthAuthenticator parameters
 */
export class McpOAuthAuthenticatorParameters extends ServiceParameters {
  /**
   * Authorization servers advertised in the protected resource metadata; defaults to the request origin
   */
  authorizationServers?: string[];
  /**
   * Path serving the RFC 9728 protected resource metadata
   * @default "/.well-known/oauth-protected-resource"
   */
  resourceMetadataPath: string;
  /**
   * MCP endpoint path, advertised as the `resource`
   * @default "/mcp"
   */
  resourcePath: string;

  /**
   * @param params - raw parameters
   * @returns this with defaults applied
   */
  load(params: any = {}): this {
    super.load(params);
    this.resourceMetadataPath ??= "/.well-known/oauth-protected-resource";
    this.resourcePath ??= "/mcp";
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

  /**
   * Mount the metadata route
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    this.addRoute(this.parameters.resourceMetadataPath, ["GET"], this.metadata, { hidden: true } as any);
    return this;
  }

  /**
   * @param ctx - web context
   * @returns the request origin (protocol + host[:port]), honouring the forwarded host
   */
  protected origin(ctx: WebContext): string {
    const http = ctx.getHttpContext();
    const host = (http.getUniqueHeader("x-forwarded-host") || http.getUniqueHeader("host") || "").split(",")[0].trim();
    if (host && !/[/\\@?#\s]/.test(host)) {
      try {
        return new URL(`${http.getProtocol() || "http:"}//${host}`).origin;
      } catch {
        // fall through
      }
    }
    return http.getAbsoluteUrl("/").replace(/\/$/, "");
  }

  /**
   * Serve the protected resource metadata
   * @param ctx - web context
   */
  async metadata(ctx: WebContext): Promise<void> {
    const origin = this.origin(ctx);
    ctx.setHeader("Content-Type", "application/json");
    ctx.write(
      JSON.stringify({
        resource: `${origin}${this.parameters.resourcePath}`,
        authorization_servers: this.parameters.authorizationServers ?? [origin],
        bearer_methods_supported: ["header"]
      })
    );
  }

  /**
   * @param ctx - web context
   * @returns the bearer session
   * @throws Unauthorized with a `WWW-Authenticate` challenge when there is no valid bearer token
   */
  async authenticate(ctx: WebContext): Promise<Session> {
    const session = ctx.getSession();
    const bearer = /^Bearer\s/i.test(ctx.getHttpContext().getUniqueHeader("authorization") ?? "");
    if (!bearer || !session?.isLogged()) {
      ctx.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${this.origin(ctx)}${this.parameters.resourceMetadataPath}"`
      );
      throw new WebdaError.Unauthorized("Bearer token required");
    }
    return session;
  }
}
