import type { OIDCIssuer } from "../issuer.service.js";
import type { SourcedToken, TokenSource } from "./source.js";

/**
 * Tokens minted by this application OIDCIssuer
 */
export class SelfSignedTokenSource implements TokenSource {
  /**
   * @param issuer - get the issuer service
   */
  constructor(protected issuer: () => OIDCIssuer) {}

  /**
   * @override
   */
  async getToken(audience: string): Promise<SourcedToken> {
    return this.issuer().mint(audience);
  }
}
