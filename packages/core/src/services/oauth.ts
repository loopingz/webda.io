import { Context, RequestFilter } from "../";
import { Service, ServiceParameters } from "./service";
import { Authentication } from "./authentication";

import { v4 as uuidv4 } from "uuid";

class OAuthServiceParameters extends ServiceParameters {
  url: string;
  scope: string[];
  exposeScope: boolean;
  authorized_uris: string[];
  redirect_uri: string;

  constructor(params: any) {
    super(params);
    this.scope = this.scope ?? ["email"];
    this.exposeScope = this.exposeScope ?? false;
    this.authorized_uris = this.authorized_uris ?? [];
  }
}
export abstract class OAuthService<T extends OAuthServiceParameters = OAuthServiceParameters> extends Service<T>
  implements RequestFilter<Context> {
  _authenticationService: Authentication;

  /**
   * Load parameters
   *
   * @param params
   */
  loadParameters(params: any): ServiceParameters {
    return new OAuthServiceParameters(params);
  }

  async checkRequest(context: Context): Promise<boolean> {
    let regexps = this.getCallbackReferer();
    let valid = false;
    let referer = "";
    for (let i in regexps) {
      valid = referer.match(regexps[i]) !== undefined;
      if (valid) {
        break;
      }
    }
    return valid;
  }

  initRoutes() {
    super.initRoutes();
    this.parameters.url = this.parameters.url || `${this.getDefaultUrl()}{?redirect}`;
    let name = this.getName();

    this.addRoute(this.parameters.url, ["GET"], this._redirect, {
      get: {
        description: `Log with a ${name} account`,
        summary: `Redirect to ${name}`,
        operationId: `logInWith${name}`,
        responses: {
          "302": "",
          "400": "Missing token"
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
            "204": "",
            "400": "Missing token"
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
            "204": "",
            "400": "Missing token"
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
            "204": "",
            "400": "Missing token"
          }
        }
      });
    }
  }

  _scope(ctx: Context) {
    ctx.write(this.parameters.scope || ["email"]);
  }

  hasToken(): boolean {
    return false;
  }

  _redirect(ctx: Context) {
    // implement default behavior
    let redirect_uri = this.parameters.redirect_uri || `${ctx.getHttpContext().getAbsoluteUrl()}/callback`;

    if (this.parameters.authorized_uris) {
      if (this.parameters.authorized_uris.indexOf(redirect_uri) < 0) {
        // The redirect_uri is not authorized , might be forging HOST request
        throw 401;
      }
    }
    // Generate 2 random uuid: nonce and state
    ctx.getSession().state = uuidv4();
    //
    ctx.getSession().redirect = ctx.getHttpContext().getHeaders().referer;
    ctx.redirect(this.generateAuthUrl(redirect_uri, ctx.getSession().state));
  }

  generateAuthUrl(redirect_uri: string, state: string) {
    return ``;
  }

  async _token(context: Context) {
    throw 404;
  }

  async _callback(ctx: Context) {}

  async handleReturn(ctx: Context, identId: string, profile: any) {
    if (this._authenticationService) {
      // Should call the onIdentLogin()
      await this._authenticationService.onIdentLogin(ctx, this.getName().toLowerCase(), identId, profile);
    } else {
      // Login in session
      ctx.getSession().login(identId, identId);
      // Store the profile retrieved
      ctx.getSession().profile = profile;
    }
  }

  abstract getDefaultUrl(): string;

  abstract getCallbackReferer(): RegExp[];

  abstract getName(): string;
}
