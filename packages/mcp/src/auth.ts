import type { Session, WebContext } from "@webda/core";

/**
 * Resolve the caller of an MCP HTTP request.
 *
 * Implementations throw `WebdaError.Unauthorized` to reject the request.
 * Configure a service implementing it through the McpService `authenticator`
 * parameter; spec 2 adds an OAuth bearer-token implementation.
 */
export interface McpAuthenticator {
  /**
   * @param ctx - the HTTP request context
   * @returns the caller session
   */
  authenticate(ctx: WebContext): Promise<Session>;
}

/**
 * Default authenticator: the Webda session already loaded for the request
 * (cookie session, filled by RequestFilters); anonymous callers get an empty session.
 */
export class SessionAuthenticator implements McpAuthenticator {
  /**
   * @param ctx - the HTTP request context
   * @returns the request session
   */
  async authenticate(ctx: WebContext): Promise<Session> {
    return ctx.getSession();
  }
}
