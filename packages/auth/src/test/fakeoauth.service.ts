import type { ResolvedIdentity } from "@webda/core";
import { TokenInvalid } from "../errors.js";
import { OAuthProvider, OAuthProviderParameters } from "../oauth/oauth.service.js";

/**
 * OAuth provider used by the specs: no network, codes and tokens describe the identity
 *
 * A code (or token) is `<sub>,<email>,<verified 0|1>[,<provider override>]`; `bad` throws TokenInvalid, `boom` a plain
 * Error. Every exchange is recorded in `calls`.
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
  calls: { method: string; value: string; redirectUri?: string }[] = [];

  /**
   * @param state - state
   * @param redirectUri - callback url
   * @param scope - scopes
   * @returns the fake authorization url
   */
  getAuthorizationUrl(state: string, redirectUri: string, scope: string[]): string {
    const url = new URL("https://idp.example/authorize");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", scope.join(" "));
    url.searchParams.set("client_id", this.parameters.client_id);
    return url.toString();
  }

  /**
   * @param value - code or token
   * @returns the identity it describes
   */
  protected identityOf(value: string): ResolvedIdentity {
    if (value === "bad") throw new TokenInvalid();
    if (value === "boom") throw new Error("secret internal failure");
    const [sub, email, verified, provider] = value.split(",");
    return {
      provider: provider ?? this.providerName,
      providerUid: sub,
      email: email || undefined,
      emailVerified: verified === "1",
      profile: { name: `Fake ${sub}` },
      tokens: { access_token: `at-${sub}` },
      amr: ["oauth"]
    };
  }

  /**
   * @param code - code
   * @param redirectUri - callback url
   * @returns identity
   */
  async handleCallback(code: string, redirectUri: string): Promise<ResolvedIdentity> {
    this.calls.push({ method: "callback", value: code, redirectUri });
    return this.identityOf(code);
  }

  /**
   * @param token - token
   * @returns identity
   */
  async handleToken(token: string): Promise<ResolvedIdentity> {
    this.calls.push({ method: "token", value: token });
    return this.identityOf(token);
  }
}
