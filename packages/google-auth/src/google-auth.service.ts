import type { ResolvedIdentity } from "@webda/core";
import { EmailDomainNotAllowed, OAuthProvider, OAuthProviderParameters, TokenInvalid } from "@webda/auth";
import { type Credentials, OAuth2Client, type TokenPayload } from "google-auth-library";

/**
 * Google login parameters
 * https://developers.google.com/identity/protocols/oauth2/openid-connect
 */
export class GoogleParameters extends OAuthProviderParameters {
  /**
   * Google OAuth client id (web application)
   */
  declare client_id: string;
  /**
   * Google OAuth client secret
   */
  declare client_secret: string;
  /**
   * Scopes requested from Google
   * @default ["openid", "email", "profile"]
   */
  declare scope?: string[];
  /**
   * Type of access: "offline" also returns a refresh token (stored in the ident tokens)
   * @default "online"
   */
  access_type?: "online" | "offline";
  /**
   * Other client ids whose ID tokens `Auth.Google.Token` accepts (for example Android/iOS client ids)
   * @default []
   */
  audiences?: string[];
  /**
   * Only accept Google Workspace accounts of this domain (the `hd` claim of the ID token); also sent as a hint to
   * the account chooser
   */
  hostedDomain?: string;
  /**
   * Additional authorization url parameters (for example `prompt`, `login_hint`); cannot override `state`,
   * `redirect_uri`, `scope`, `access_type`, `response_type` nor `hd`
   * See https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters
   */
  auth_options?: Record<string, any>;

  /**
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.access_type ??= "online";
    this.scope ??= ["openid", "email", "profile"];
    this.audiences ??= [];
    return this;
  }
}

/**
 * Sign in with Google (OpenID Connect)
 *
 * The browser flow (`GET /auth/google`, `GET /auth/google/callback`) exchanges the code and verifies the returned ID
 * token for `client_id`. `Auth.Google.Token` accepts a Google ID token (never an access token) whose audience is
 * `client_id` or one of `audiences`.
 * @WebdaModda GoogleAuthentication
 */
export class GoogleAuthentication<T extends GoogleParameters = GoogleParameters> extends OAuthProvider<T> {
  static Parameters = GoogleParameters;

  readonly providerName = "google";

  /**
   * @param redirectUri - callback url
   * @returns a Google OAuth client
   */
  protected getClient(redirectUri?: string): OAuth2Client {
    return new OAuth2Client({
      clientId: this.parameters.client_id,
      clientSecret: this.parameters.client_secret,
      redirectUri
    });
  }

  /**
   * @param state - state
   * @param redirectUri - callback url
   * @param scope - scopes
   * @returns the Google authorization url
   */
  getAuthorizationUrl(state: string, redirectUri: string, scope: string[]): string {
    const { auth_options, access_type, hostedDomain } = this.parameters;
    return this.getClient(redirectUri).generateAuthUrl({
      ...(auth_options ?? {}),
      access_type,
      scope,
      state,
      redirect_uri: redirectUri,
      response_type: "code",
      ...(hostedDomain ? { hd: hostedDomain } : {})
    });
  }

  /**
   * Exchange the code and verify the returned ID token for `client_id`
   * @param code - authorization code
   * @param redirectUri - redirect_uri of the authorization request
   * @returns the identity
   */
  async handleCallback(code: string, redirectUri: string): Promise<ResolvedIdentity> {
    let tokens: Credentials;
    try {
      ({ tokens } = await this.getClient(redirectUri).getToken({ code, redirect_uri: redirectUri }));
    } catch (err) {
      this.log("WARN", "Google code exchange failed", (err as any)?.message);
      throw new TokenInvalid("Code exchange failed");
    }
    if (!tokens?.id_token) {
      throw new TokenInvalid("Google returned no ID token: the 'openid' scope is required");
    }
    const payload = await this.verifyIdToken(tokens.id_token, [this.parameters.client_id]);
    return this.toIdentity(payload, tokens);
  }

  /**
   * Verify a Google ID token sent by a client
   * @param token - ID token
   * @returns the identity
   */
  async handleToken(token: string): Promise<ResolvedIdentity> {
    const payload = await this.verifyIdToken(token, [this.parameters.client_id, ...(this.parameters.audiences ?? [])]);
    return this.toIdentity(payload);
  }

  /**
   * Verify an ID token: signature, expiry, issuer (google-auth-library), audience and hosted domain
   * @param idToken - ID token
   * @param audiences - accepted audiences
   * @returns the payload
   * @throws TokenInvalid when the token does not verify
   * @throws EmailDomainNotAllowed when `hostedDomain` is set and the token is not from that domain
   */
  protected async verifyIdToken(idToken: string, audiences: string[]): Promise<TokenPayload> {
    const audience = audiences.filter(a => typeof a === "string" && a);
    // Without audience the library would skip the check: never verify without one
    if (!audience.length) {
      throw new TokenInvalid("No audience configured");
    }
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.getClient().verifyIdToken({
        idToken,
        audience: audience.length === 1 ? audience[0] : audience
      });
      payload = ticket.getPayload();
    } catch (err) {
      this.log("WARN", "Google ID token verification failed", (err as any)?.message);
      throw new TokenInvalid();
    }
    if (!payload?.sub) {
      throw new TokenInvalid("ID token has no subject");
    }
    const hostedDomain = this.parameters.hostedDomain?.trim().toLowerCase();
    if (hostedDomain && payload.hd?.toLowerCase() !== hostedDomain) {
      throw new EmailDomainNotAllowed("Google account is not from the hosted domain");
    }
    return payload;
  }

  /**
   * @param payload - verified ID token payload
   * @param tokens - tokens of the code exchange
   * @returns the identity
   */
  protected toIdentity(payload: TokenPayload, tokens?: Credentials): ResolvedIdentity {
    return {
      provider: this.providerName,
      providerUid: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      profile: { name: payload.name, picture: payload.picture, locale: payload.locale, hd: payload.hd },
      tokens,
      amr: ["oauth"]
    };
  }
}

export default GoogleAuthentication;
