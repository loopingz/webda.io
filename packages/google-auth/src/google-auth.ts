import {
  OAuthEvents,
  OAuthService,
  OAuthServiceParameters,
  OAuthSession,
  RequestFilter,
  WebContext,
  WebdaError
} from "@webda/core";
import { Credentials, OAuth2Client } from "google-auth-library";
import * as http from "http";

export interface EventGoogleOAuthToken {
  /**
   * Tokens retrieved from Google
   */
  tokens: Credentials;
  /**
   * Request context
   */
  context: WebContext;
}

/**
 * Credentials to manage Google Auth
 * https://developers.google.com/identity/protocols/oauth2
 */
export class GoogleParameters extends OAuthServiceParameters {
  /**
   * Google Auth Client id
   */
  client_id: string;
  /**
   * Google Auth Client secret
   */
  client_secret: string;
  /**
   * Google Project ID
   */
  project_id?: string;

  /**
   * Type of access for Google token
   *
   * online by default
   */
  access_type?: "online" | "offline";
  // See: https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters
  auth_options?: any;
  redirects: {
    // Use redirect
    use_referer: boolean;
    // Whitelist authorized url with regexp
    whitelist: string[];
    // Set default redirect per referer
    defaults: { [key: string]: string };
  };

  constructor(params) {
    super(params);
    this.access_type = this.access_type || "online";
  }
}

type GoogleAuthEvents = OAuthEvents & {
  "GoogleAuth.Tokens": EventGoogleOAuthToken;
};
/**
 * Manage Google Authentication
 *
 * @WebdaModda
 */
export default class GoogleAuthentication<T extends GoogleParameters = GoogleParameters>
  extends OAuthService<T, GoogleAuthEvents>
  implements RequestFilter<WebContext>
{
  protected _client: OAuth2Client;

  /**
   * Return provider name
   * @returns
   */
  getName() {
    return "google";
  }

  /**
   * Allow every accounts.google.
   */
  getCallbackReferer(): RegExp[] {
    return [/accounts\.google\.[a-z]+$/];
  }

  /**
   * Get OAuth callback query parameters
   * @returns
   */
  getCallbackQueryParams(): { name: string; required: boolean }[] {
    return [
      {
        name: "code",
        required: true
      },
      {
        name: "scope",
        required: true
      },
      {
        name: "state",
        required: true
      },
      {
        name: "authuser",
        required: false
      },
      {
        name: "hd",
        required: false
      },
      {
        name: "prompt",
        required: false
      }
    ];
  }

  /**
   * Expose on /google by default
   */
  getDefaultUrl() {
    return "/google";
  }

  /**
   * We manage Google Auth Token
   */
  hasToken() {
    return true;
  }

  /**
   * @inheritdoc
   */
  loadParameters(params: any): GoogleParameters {
    return new GoogleParameters(params);
  }

  /**
   *
   * @param redirect_uri
   * @param state
   */
  generateAuthUrl(redirect_uri: string, state: string, _ctx: WebContext) {
    let oauthClient = this.getOAuthClient(redirect_uri);
    return oauthClient.generateAuthUrl({
      access_type: this.parameters.access_type,
      scope: this.parameters.scope,
      redirect_uri,
      response_type: "code",
      state,
      ...this.parameters.auth_options
    });
  }

  /**
   * Return a google oauth client
   * @param redirect_uri
   */
  getOAuthClient(redirect_uri?: string): OAuth2Client {
    return new OAuth2Client(this.parameters.client_id, this.parameters.client_secret, redirect_uri);
  }

  /**
   * @inheritdoc
   */
  async handleCallback(ctx: WebContext) {
    // Verify state are equal
    if (ctx.getParameters().state !== ctx.getSession<OAuthSession>().oauth?.state) {
      this.log("WARN", `Bad State ${ctx.getParameters().state} !== ${ctx.getSession<OAuthSession>().oauth?.state}`);
      throw new WebdaError.Forbidden("Bad State");
    }
    let code: string = ctx.getParameters().code;
    let redirect_uri = ctx.getHttpContext().getAbsoluteUrl(`${this.parameters.url}/callback`);
    let oauthClient = this.getOAuthClient(redirect_uri);
    let profile, identId;
    // Now that we have the code, use that to acquire tokens.
    try {
      const r = await oauthClient.getToken(code);
      this.emitSync("GoogleAuth.Tokens", { tokens: r.tokens, context: ctx });
      profile = await this.getUserInfo(r.tokens.id_token);
      identId = profile.sub;
    } catch (err) {
      this.log("ERROR", err);
      throw new WebdaError.Forbidden("OAuth Error");
    }
    return {
      identId,
      profile
    };
  }

  /**
   * Retrieve the user profile based on the token
   * @param token
   * @returns
   */
  async getUserInfo(token: string) {
    const oauthClient = this.getOAuthClient();
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: this.parameters.client_id
    });
    return ticket.getPayload();
  }

  /**
   * Verify a Google Auth Token
   */
  async handleToken(context: WebContext) {
    let tokens = (await context.getRequestBody()).tokens;
    if (!tokens) {
      throw new WebdaError.BadRequest("No tokens provided");
    }
    const profile = await this.getUserInfo(tokens.id_token);
    return {
      identId: profile.sub,
      profile
    };
  }

  /**
   * Retrieve Google Client
   *
   * Redirecting to the webbrowser for the OAuth validation
   * Store the token in user store afterwards
   */
  async getLocalClient(
    token: Credentials,
    open: (url: string) => void,
    storeToken: (token: Credentials) => Promise<void>
  ): Promise<OAuth2Client> {
    if (this._client) {
      return this._client;
    }

    const oAuth2Client = this.getOAuthClient();

    if (token) {
      oAuth2Client.setCredentials(token);
      this._client = oAuth2Client;
      return oAuth2Client;
    }
    // Generate the url that will be used for the consent dialog.
    const authorizeUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: this.parameters.scope,
      redirect_uri: "http://localhost:3000/oauth2callback"
    });

    // Open an http server to accept the oauth callback. In this simple example, the
    // only request to our webserver is to /oauth2callback?code=<code>
    return new Promise((resolve, reject) => {
      const server = http
        .createServer(async (req, res) => {
          if (req.url.indexOf("/oauth2callback") > -1) {
            try {
              // acquire the code from the querystring, and close the web server.
              const code = new URL(req.url, `http://localhost:3000`).searchParams.get("code");
              if (code) {
                res.end("Authentication successful! Please return to the console.");
              } else {
                res.end("Authentication unsuccessful! Please return to the console.");
                return reject("Failed");
              }

              // Now that we have the code, use that to acquire tokens.
              const r = await oAuth2Client.getToken(code);
              // Make sure to set the credentials on the OAuth2 client.
              storeToken(r.tokens);
              oAuth2Client.setCredentials(r.tokens);
              this._client = oAuth2Client;
              this.log("INFO", "Google Authentication finished.");
              return resolve(this._client);
            } catch (err) {
              console.log(err);
              reject(err);
            } finally {
              server.close();
            }
          }
        })
        .listen(3000, () => {
          // open the browser to the authorize url to start the workflow
          this.log("INFO", "Launching your browser for Google API Permission");
          open(authorizeUrl);
        });
    });
  }
}

export { GoogleAuthentication };
