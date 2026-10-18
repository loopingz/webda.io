import { OIDCConfigurationError } from "../errors.js";
import { fetchToken, type SourcedToken, type TokenSource } from "./source.js";

/**
 * GitHub Actions OIDC token, the workflow needs `permissions: id-token: write`
 */
export class GitHubActionsTokenSource implements TokenSource {
  /**
   * @param timeout - request timeout in milliseconds
   * @param env - environment holding ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN
   */
  constructor(
    protected timeout: number,
    protected env: NodeJS.ProcessEnv = process.env
  ) {}

  /**
   * @override
   */
  async getToken(audience: string): Promise<SourcedToken> {
    const url = this.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const requestToken = this.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!url || !requestToken) {
      throw new OIDCConfigurationError(
        "ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set: add `permissions: id-token: write`"
      );
    }
    return fetchToken(
      `${url}${url.includes("?") ? "&" : "?"}audience=${encodeURIComponent(audience)}`,
      { headers: { Authorization: `Bearer ${requestToken}`, Accept: "application/json" } },
      async res => (await res.json())?.value,
      this.timeout
    );
  }
}
