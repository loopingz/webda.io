import { Context, RequestFilter } from "../";
import { Service } from "./service";
import { Authentication } from "./authentication";

import { v4 as uuidv4 } from "uuid";

export abstract class OAuthService extends Service implements RequestFilter {
  _authenticationService: Authentication;

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
  /*
    getCallbackUrl(ctx: Context) {
      let provider = ctx.parameter("provider");
      if (this._params.providers[provider].callbackURL) {
        return this._params.providers[provider].callbackURL;
      }
      // TODO Issue with specified port for now
      var url = ctx.getHttpContext().getFullUrl();
  
      if (url.endsWith("/callback")) {
        return url;
      }
      return url + "/callback";
    }
  */
  initRoutes() {
    super.initRoutes();
    this._params.url = this._params.url || `${this.getDefaultUrl()}{?redirect}`;

    this._addRoute(this._params.url, ["GET"], this._redirect, {
      get: {
        description: "Log with a Google account",
        summary: "Redirect to your Google Application OAuth consent screen",
        operationId: "logInWithGoogle",
        responses: {
          "302": "",
          "400": "Missing token"
        }
      }
    });

    this._addRoute(
      this._params.url + "/callback{?code,oauth_token,oauth_verifier,*otherQuery}",
      ["GET"],
      this._callback,
      {
        get: {
          description: "Get result from Google Authentication",
          summary: "Use the token provide to validate with Google the user",
          operationId: "callbackFromGoogle",
          responses: {
            "204": "",
            "400": "Missing token"
          }
        }
      }
    );

    if (this.hasToken()) {
      this._addRoute(this._params.url + "/token", ["POST"], this._token, {
        post: {
          description: "Log with a Google Auth token",
          summary: "Use the token provide to validate with Google the user",
          operationId: "verifyGoogleToken",
          responses: {
            "204": "",
            "400": "Missing token"
          }
        }
      });
    }

    if (this._params.exposeScope) {
      this._addRoute(this._params.url + "/scope", ["GET"], this._scope, {
        get: {
          description: "List Google auth scope for this apps",
          summary: "Retrieve the scope intended to be used with this auth",
          operationId: "getGoogleScope",
          responses: {
            "204": "",
            "400": "Missing token"
          }
        }
      });
    }
  }

  _scope(ctx: Context) {
    ctx.write(this._params.scope || ["email"]);
  }

  hasToken(): boolean {
    return false;
  }

  _redirect(ctx: Context) {
    // implement default behavior
    let redirect_uri = this._params.redirect_uri || `${ctx.getHttpContext().getFullUrl()}/callback`;
    this.log("INFO");
    if (this._params.authorized_uris) {
      if (this._params.authorized_uris.indexOf(redirect_uri) < 0) {
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
      await this._authenticationService.onIdentLogin(ctx, "google", identId, profile);
    } else {
      // Login in session
      ctx.getSession().login(identId, identId);
      // Store the profile retrieved
      ctx.getSession().profile = profile;
    }
  }

  abstract getDefaultUrl(): string;

  abstract getCallbackReferer(): RegExp[];
}
