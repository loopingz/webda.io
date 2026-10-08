import { timingSafeEqual } from "node:crypto";
import { type AuthResult, type EventWithContext, type ResolvedIdentity, useContext, WebdaError } from "@webda/core";
import {
  EmailDomainNotAllowed,
  type OAuthAuthorizationRequest,
  type OAuthCallbackRequest,
  OAuthProvider,
  OAuthProviderParameters,
  type OAuthTokenRequest,
  safeErrorReason,
  TokenInvalid
} from "@webda/auth";
import { CodeChallengeMethod, type Credentials, OAuth2Client, type TokenPayload } from "google-auth-library";

/** Emitted with the Google credentials of a successful login */
export interface EventGoogleOAuthToken extends EventWithContext {
  /**
   * Credentials: from the code exchange (browser flow), or as sent to `Auth.Google.Token` (`tokens`, or
   * `{ id_token }` for a bare token). Only the ID token is verified: treat the other values as client-provided on
   * the token operation
   */
  tokens: Credentials;
}

/** Events of GoogleAuthentication */
export type GoogleAuthEvents = {
  "GoogleAuth.Tokens": EventGoogleOAuthToken;
};

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
   * Type of access: "offline" also returns a refresh token (stored encrypted in the ident tokens)
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
   * `redirect_uri`, `scope`, `access_type`, `response_type`, `code_challenge*`, `nonce` nor `hd`
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
 * The browser flow (`GET /auth/google`, `GET /auth/google/callback`) uses PKCE and a nonce, exchanges the code and
 * verifies the returned ID token for `client_id`. `Auth.Google.Token` accepts a Google ID token, as `token` or as
 * the `id_token` of `tokens` (v3 body), whose audience is `client_id` or one of `audiences` (never an access
 * token). Credentials are stored encrypted on the ident and emitted with `GoogleAuth.Tokens` after the login.
 * @WebdaModda GoogleAuthentication
 */
export class GoogleAuthentication<T extends GoogleParameters = GoogleParameters> extends OAuthProvider<
  T,
  GoogleAuthEvents
> {
  static Parameters = GoogleParameters;

  readonly providerName = "google";

  /** Client verifying ID tokens: one per service so the Google certificates cache is reused */
  protected verifier: OAuth2Client;

  /** @override */
  async init(): Promise<this> {
    await super.init();
    this.verifier = new OAuth2Client({ clientId: this.parameters.client_id });
    return this;
  }

  /**
   * @param redirectUri - callback url
   * @returns a Google OAuth client for the authorization url and the code exchange
   */
  protected getClient(redirectUri?: string): OAuth2Client {
    return new OAuth2Client({
      clientId: this.parameters.client_id,
      clientSecret: this.parameters.client_secret,
      redirectUri
    });
  }

  /**
   * @param request - authorization request
   * @returns the Google authorization url
   */
  getAuthorizationUrl(request: OAuthAuthorizationRequest): string {
    const { auth_options, access_type, hostedDomain } = this.parameters;
    return this.getClient(request.redirectUri).generateAuthUrl({
      ...(auth_options ?? {}),
      access_type,
      scope: request.scope,
      state: request.state,
      redirect_uri: request.redirectUri,
      response_type: "code",
      code_challenge_method: CodeChallengeMethod.S256,
      code_challenge: request.codeChallenge,
      nonce: request.nonce,
      ...(hostedDomain ? { hd: hostedDomain } : {})
    } as any);
  }

  /**
   * Exchange the code with the PKCE verifier, verify the returned ID token for `client_id` and its nonce
   * @param request - code exchange
   * @returns the identity, with the credentials of the exchange
   */
  async handleCallback(request: OAuthCallbackRequest): Promise<ResolvedIdentity> {
    let tokens: Credentials;
    try {
      ({ tokens } = await this.getClient(request.redirectUri).getToken({
        code: request.code,
        codeVerifier: request.codeVerifier,
        redirect_uri: request.redirectUri
      }));
    } catch (err) {
      this.log("WARN", "Google code exchange failed:", safeErrorReason(err));
      throw new TokenInvalid("Code exchange failed");
    }
    if (!tokens?.id_token) {
      throw new TokenInvalid("Google returned no ID token: the 'openid' scope is required");
    }
    const payload = await this.verifyIdToken(tokens.id_token, [this.parameters.client_id]);
    if (typeof payload.nonce !== "string" || !sameSecret(payload.nonce, request.nonce)) {
      throw new TokenInvalid("ID token nonce mismatch");
    }
    return this.toIdentity(payload, tokens);
  }

  /**
   * Verify a Google ID token sent by a client, as `token` or `tokens.id_token`
   * @param request - token request
   * @returns the identity, with the credentials sent in `tokens`
   */
  async handleToken(request: OAuthTokenRequest): Promise<ResolvedIdentity> {
    const fromTokens = request.tokens?.id_token;
    if (request.token && fromTokens !== undefined && fromTokens !== request.token) {
      throw new WebdaError.BadRequest("token and tokens.id_token differ");
    }
    const idToken = request.token ?? fromTokens;
    if (typeof idToken !== "string" || !idToken) {
      throw new TokenInvalid("A Google ID token is required");
    }
    const payload = await this.verifyIdToken(idToken, [
      this.parameters.client_id,
      ...(this.parameters.audiences ?? [])
    ]);
    return this.toIdentity(payload, request.tokens as Credentials);
  }

  /**
   * Emit `GoogleAuth.Tokens` once the login succeeded
   * @param identity - the identity
   * @param _result - the result
   * @param source - browser callback or token operation
   * @param request - the token operation request
   */
  protected async onAuthenticated(
    identity: ResolvedIdentity,
    _result: AuthResult,
    source: "callback" | "token",
    request?: OAuthTokenRequest
  ): Promise<void> {
    const tokens = source === "token" ? (request?.tokens ?? { id_token: request?.token }) : identity.tokens;
    await this.emit("GoogleAuth.Tokens", { tokens, context: useContext() } as EventGoogleOAuthToken);
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
    this.verifier ??= new OAuth2Client({ clientId: this.parameters.client_id });
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.verifier.verifyIdToken({
        idToken,
        audience: audience.length === 1 ? audience[0] : audience
      });
      payload = ticket.getPayload();
    } catch (err) {
      // The library messages contain the token or its payload: only the error class is logged
      this.log("WARN", "Google ID token verification failed:", safeErrorReason(err));
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
   * @param tokens - credentials to store
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

/**
 * Constant-time comparison
 * @param a - received value
 * @param b - expected value
 * @returns true when equal
 */
function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default GoogleAuthentication;
