import type { ResolvedIdentity } from "@webda/core";
import { TokenInvalid } from "../errors.js";
import {
  type OAuthAuthorizationRequest,
  type OAuthCallbackRequest,
  OAuthProvider,
  OAuthProviderParameters,
  type OAuthTokenRequest
} from "../oauth/oauth.service.js";

/**
 * OAuth provider used by the specs: no network, codes and tokens describe the identity
 *
 * A code (or token) is `<sub>,<email>,<verified 0|1>[,<provider override>]`; `bad` throws TokenInvalid, a value
 * starting with `boom` a plain Error whose message contains the value. Every exchange is recorded in `calls`.
 */
export class FakeOAuthProvider extends OAuthProvider {
  readonly providerName = "fake";

  /**
   * Registered with addModda (no module metadata): build the parameters like a compiled modda would
   * @param params - raw parameters
   * @returns the loaded parameters
   */
  static createConfiguration(params: any): OAuthProviderParameters {
    return new OAuthProviderParameters().load(params);
  }

  /** Recorded exchanges */
  calls: { method: string; value: string; request?: any }[] = [];

  /**
   * @param request - authorization request
   * @returns the fake authorization url
   */
  getAuthorizationUrl(request: OAuthAuthorizationRequest): string {
    const url = new URL("https://idp.example/authorize");
    url.searchParams.set("state", request.state);
    url.searchParams.set("redirect_uri", request.redirectUri);
    url.searchParams.set("scope", request.scope.join(" "));
    url.searchParams.set("client_id", this.parameters.client_id);
    url.searchParams.set("code_challenge", request.codeChallenge);
    url.searchParams.set("code_challenge_method", request.codeChallengeMethod);
    url.searchParams.set("nonce", request.nonce);
    return url.toString();
  }

  /**
   * @param value - code or token
   * @param tokens - tokens to attach
   * @returns the identity it describes
   */
  protected identityOf(value: string, tokens?: any): ResolvedIdentity {
    if (value === "bad") throw new TokenInvalid();
    if (value?.startsWith("boom")) throw new Error(`secret internal failure: ${value}`);
    const [sub, email, verified, provider] = value.split(",");
    return {
      provider: provider ?? this.providerName,
      providerUid: sub,
      email: email || undefined,
      emailVerified: verified === "1",
      profile: { name: `Fake ${sub}` },
      tokens: tokens ?? { access_token: `at-${sub}` },
      amr: ["oauth"]
    };
  }

  /**
   * @param request - callback request
   * @returns identity
   */
  async handleCallback(request: OAuthCallbackRequest): Promise<ResolvedIdentity> {
    this.calls.push({ method: "callback", value: request.code, request });
    return this.identityOf(request.code);
  }

  /**
   * @param request - token request
   * @returns identity
   */
  async handleToken(request: OAuthTokenRequest): Promise<ResolvedIdentity> {
    const value = request.token ?? request.tokens?.id_token;
    this.calls.push({ method: "token", value, request });
    return this.identityOf(value, request.tokens);
  }
}
