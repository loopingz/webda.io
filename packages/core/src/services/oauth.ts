import { Core } from "../core";
import { Context, EventWithContext, RequestFilter } from "../index";
import { Authentication } from "./authentication";
import { Service, ServiceParameters } from "./service";

export interface EventOAuthToken extends EventWithContext {
  /**
   * Provider from
   */
  provider: string;
  /**
   * token if we got a post of a JWT token
   * callback if it was by http url
   */
  type: "token" | "callback";
  /**
   * Profile comming from the provider
   */
  [key: string]: any;
}

/**
 * OAuth return definition
 */
export interface OAuthReturn {
  profile: any;
  identId: string;
}

export class OAuthServiceParameters extends ServiceParameters {
  /**
   * URL to use for expose
   *
   * The default value varying based on implementation
   * It should by default be the provider name in lowercase
   */
  url?: string;
  /**
   * Scope to request on OAuth flow
   *
   * @defaut ["email"]
   */
  scope?: string[];
  /**
   * If set to true it will add a ${url}/scope
   * So client can anticipate the requested scope
   *
   * This is useful when using the client api to generate
   * token. This way the service can request the wanted scope
   *
   * @default false
   */
  exposeScope?: boolean;
  /**
   * List of URIs authorized for redirect post authorization
   *
   * @default []
   */
  authorized_uris?: string[];
  /**
   * Default redirect_uri
   *
   * @default ${url}/callback
   */
  redirect_uri?: string;
  /**
   * Allow direct connection without a referer
   *
   * @default false
   */
  no_referer: boolean;

  /**
   * Name of the authentication service to use if exist
   * @default Authentication
   */
  authenticationService: string;

  constructor(params: any) {
    super(params);
    this.scope ??= ["email"];
    this.exposeScope ??= false;
    this.authenticationService ??= "Authentication";
  }
}

export type OAuthEvents = {
  "OAuth.Callback": EventOAuthToken;
};

/**
 * OAuth Session variables
 */
export interface OAuthSession {
  /**
   * Store within an oauth object
   */
  oauth?: {
    /**
     * state sent
     */
    state?: string;
    /**
     * redirect after auth
     */
    redirect?: string;
    /**
     * Profile retrieved
     */
    profile?: any;
  };
}

/**
 * OAuth service implementing the default OAuth workflow
 * It is abstract as it does not manage any provider as is
 */
export abstract class OAuthService<
    T extends OAuthServiceParameters = OAuthServiceParameters,
    E extends OAuthEvents = OAuthEvents
  >
  extends Service<T, E>
  implements RequestFilter<Context>
{
  _authenticationService: Authentication;

  /**
   * Ensure default parameter url
   */
  constructor(webda: Core, name: string, params?: any) {
    super(webda, name, params);
    this.parameters.url = this.parameters.url || `${this.getDefaultUrl()}`;
  }

  /**
   * Load parameters
   *
   * @param params
   */
  loadParameters(params: any): ServiceParameters {
    let result = new OAuthServiceParameters(params);
    if (result.authorized_uris === undefined) {
      this.log("WARN", "Not defining authorized_uris is a security risk");
    }
    return result;
  }

  /**
   * Allow callback referer to access this url no matter what
   * @param context
   * @returns
   */
  async checkRequest(context: Context): Promise<boolean> {
    // Only authorize url from this service
    if (!context.getHttpContext().getRelativeUri().startsWith(this.parameters.url)) {
      return false;
    }
    let regexps = this.getCallbackReferer();
    let valid = false;
    let referer = context.getHttpContext().getUniqueHeader("referer", "");
    if (this.parameters.no_referer && referer === "") {
      return true;
    }
    for (let i in regexps) {
      valid = referer.match(regexps[i]) !== null;
      if (valid) {
        break;
      }
    }
    return valid;
  }

  /**
   * Resolve dynamic dependancy
   */
  resolve(): this {
    super.resolve();
    this._authenticationService = this.getService(this.parameters.authenticationService);
    return this;
  }

  /**
   * Add routes for the authentication
   */
  initRoutes() {
    super.initRoutes();
    let name = this.getName();

    this.addRoute(`${this.parameters.url}{?redirect}`, ["GET"], this._redirect, {
      get: {
        description: `Log with a ${name} account`,
        summary: `Redirect to ${name}`,
        operationId: `logInWith${name}`,
        responses: {
          "302": {
            description: ""
          },
          "400": {
            description: "Missing token"
          }
        }
      }
    });

    this.addRoute(
      this.parameters.url + "/callback{?code,oauth_token,oauth_verifier,*otherQuery}",
      ["GET"],
      this._callback,
      {
        get: {
          description: `Get result from ${name} Authentication`,
          summary: `Use the token provide to validate with ${name} the user`,
          operationId: `callbackFrom${name}`,
          responses: {
            "204": {
              description: ""
            },
            "400": {
              description: "Missing token"
            }
          }
        }
      }
    );

    if (this.hasToken()) {
      this.addRoute(this.parameters.url + "/token", ["POST"], this._token, {
        post: {
          description: `Log with a ${name} token`,
          summary: `Use the token provide to validate with ${name} the user`,
          operationId: `verify${name}Token`,
          responses: {
            "204": {
              description: ""
            },
            "400": {
              description: "Missing token"
            }
          }
        }
      });
    }

    if (this.parameters.exposeScope) {
      this.addRoute(this.parameters.url + "/scope", ["GET"], this._scope, {
        get: {
          description: `List ${name} auth scope for this apps`,
          summary: "Retrieve the scope intended to be used with this auth",
          operationId: `get${name}Scope`,
          responses: {
            "204": {
              description: ""
            },
            "400": {
              description: "Missing token"
            }
          }
        }
      });
    }
  }

  /**
   * Expose the scope used by the authentication
   * @param ctx
   */
  _scope(ctx: Context) {
    ctx.write(this.parameters.scope);
  }

  /**
   * Define if this provider allow authentication by tokens
   * @returns
   */
  hasToken(): boolean {
    return false;
  }

  /**
   * Redirect to the OAuth provider
   *
   * The calling url must be and authorized_uris if defined
   * @param ctx
   */
  _redirect(ctx: Context) {
    // implement default behavior
    let redirect_uri = this.parameters.redirect_uri || `${ctx.getHttpContext().getAbsoluteUrl()}/callback`;
    let redirect = ctx.getParameters().redirect || ctx.getHttpContext().getHeaders().referer;

    if (this.parameters.authorized_uris) {
      // Might want to use regexp here
      if (this.parameters.authorized_uris.indexOf(redirect) < 0) {
        if (ctx.getHttpContext().getHeaders().referer || !this.parameters.no_referer) {
          // The redirect_uri is not authorized , might be forging HOST request
          throw 401;
        }
      }
    }
    const session = ctx.getSession<OAuthSession>();
    session.oauth ??= {};
    // Generate 2 random uuid: nonce and state
    session.oauth.state = this.getWebda().getUuid("base64");
    // Redirect to the calling uri
    session.oauth.redirect = redirect;
    ctx.redirect(this.generateAuthUrl(redirect_uri, session.oauth.state, ctx));
  }

  /**
   * Handle a token return
   *
   * This is private to avoid any override
   * @param context
   */
  private async _token(context: Context) {
    const res = await this.handleToken(context);
    await this.handleReturn(context, res.identId, res.profile);
    await this.emitSync("OAuth.Callback", <EventOAuthToken>{
      ...res,
      type: "token",
      provider: this.getName(),
      context
    });
  }

  /**
   * Handle a standard url callback
   *
   * This is private to avoid any override
   * @param ctx
   */
  private async _callback(ctx: Context) {
    const res = await this.handleCallback(ctx);
    await this.handleReturn(ctx, res.identId, res.profile);
    await this.emitSync("OAuth.Callback", {
      ...res,
      type: "callback",
      provider: this.getName(),
      context: ctx
    });
  }

  /**
   * Once approved by the OAuth provider this will do the common task
   * @param ctx
   * @param identId
   * @param profile
   */
  async handleReturn(ctx: Context, identId: string, profile: any, _tokens: any = undefined) {
    // If no identId has been provided error
    if (!identId) {
      throw 403;
    }

    const session = ctx.getSession<OAuthSession>();
    session.oauth ??= {};
    // If authentication service then create a User/Ident couple
    if (this._authenticationService) {
      // Should call the onIdentLogin()
      await this._authenticationService.onIdentLogin(ctx, this.getName().toLowerCase(), identId, profile);
    } else {
      // Login in session
      ctx.getSession().login(identId, identId);
      // Store the profile retrieved
      session.oauth.profile = profile;
    }

    // Redirect to our targets
    if (session.oauth.redirect) {
      ctx.redirect(session.oauth.redirect);
    } else {
      ctx.write("Your authentication is successful");
    }
    // Clean variables from session
    session.oauth.state = undefined;
    session.oauth.redirect = undefined;
  }

  /**
   * Return default url for the provider
   */
  abstract getDefaultUrl(): string;

  /**
   * Return the different sources of url from the provider
   */
  abstract getCallbackReferer(): RegExp[];

  /**
   * Return the name of the provider
   */
  abstract getName(): string;

  /**
   * Generate the authorization url to the provider
   *
   * @param redirect_uri to redirect to
   * @param state random state
   * @param ctx Context of request
   */
  abstract generateAuthUrl(redirect_uri: string, state: string, ctx: Context);

  /**
   * Verify a token from a provider
   *
   * @param ctx
   */
  abstract handleToken(ctx: Context): Promise<OAuthReturn>;

  /**
   * Manage the return of a provider
   * @param ctx
   */
  abstract handleCallback(ctx: Context): Promise<OAuthReturn>;
}
