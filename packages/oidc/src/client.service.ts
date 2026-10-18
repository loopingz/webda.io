import { Service, ServiceParameters, useDynamicService } from "@webda/core";
import { OIDCConfigurationError } from "./errors.js";
import type { OIDCIssuer } from "./issuer.service.js";
import { FileTokenSource } from "./sources/file.js";
import { GCPMetadataTokenSource } from "./sources/gcpmetadata.js";
import { GitHubActionsTokenSource } from "./sources/githubactions.js";
import { SelfSignedTokenSource } from "./sources/selfsigned.js";
import type { SourcedToken, TokenSource } from "./sources/source.js";

/**
 * Parameters of the OIDC client
 */
export class OIDCClientParameters extends ServiceParameters {
  /**
   * Token source
   *
   * - `self`: minted by this application OIDCIssuer
   * - `file`: read from `tokenFile`, like a Kubernetes projected service account token
   * - `gcp-metadata`: identity token of the GCP default service account
   * - `github-actions`: GitHub Actions OIDC token
   * @default "self"
   */
  source: "self" | "file" | "gcp-metadata" | "github-actions";
  /**
   * For "file": path of the projected token
   *
   * @example /var/run/secrets/tokens/webda
   */
  tokenFile?: string;
  /**
   * For "self": name of the OIDCIssuer service
   *
   * @default "OIDCIssuer"
   */
  issuerService: string;
  /**
   * Refresh margin in seconds before the token expiration
   *
   * @default 60
   */
  refreshMargin: number;
  /**
   * Timeout of the token requests in milliseconds
   *
   * @default 5000
   */
  requestTimeout: number;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.source ??= "self";
    this.issuerService ??= "OIDCIssuer";
    this.refreshMargin ??= 60;
    this.requestTimeout ??= 5000;
    return this;
  }
}

/**
 * Options of {@link OIDCClient.fetch}
 */
export type OIDCFetchInit = RequestInit & {
  /**
   * Token audience
   *
   * @default the url origin
   */
  audience?: string;
};

/**
 * Get workload tokens to call other applications
 *
 * Tokens are cached per audience until `exp - refreshMargin`, concurrent requests share one fetch.
 *
 * @WebdaModda OIDCClient
 */
export class OIDCClient<T extends OIDCClientParameters = OIDCClientParameters> extends Service<T> {
  /**
   * Where the tokens come from
   */
  protected source: TokenSource;
  /**
   * Cached tokens by audience
   */
  protected tokens = new Map<string, SourcedToken>();
  /**
   * In-flight token requests by audience
   */
  protected pending = new Map<string, Promise<SourcedToken>>();

  /**
   * Create the token source
   * @returns this
   */
  resolve(): this {
    super.resolve();
    this.source = this.createSource();
    this.tokens.clear();
    this.pending.clear();
    return this;
  }

  /**
   * @returns the configured token source
   */
  protected createSource(): TokenSource {
    const { source, tokenFile, issuerService, requestTimeout } = this.parameters;
    switch (source) {
      case "self":
        return new SelfSignedTokenSource(() => {
          const issuer = useDynamicService<OIDCIssuer>(issuerService);
          if (!issuer) {
            throw new OIDCConfigurationError(`${this.getName()}: service ${issuerService} not found`);
          }
          return issuer;
        });
      case "file":
        if (!tokenFile) {
          throw new OIDCConfigurationError(`${this.getName()}: tokenFile is required for the file source`);
        }
        return new FileTokenSource(tokenFile);
      case "gcp-metadata":
        return new GCPMetadataTokenSource(requestTimeout);
      case "github-actions":
        return new GitHubActionsTokenSource(requestTimeout);
      default:
        throw new OIDCConfigurationError(`${this.getName()}: unknown source ${source}`);
    }
  }

  /**
   * Get a token for an audience
   * @param audience - the target audience
   * @returns the JWT
   */
  async getToken(audience: string): Promise<string> {
    const cached = this.tokens.get(audience);
    if (cached && cached.expiresAt - this.parameters.refreshMargin * 1000 > Date.now()) {
      return cached.token;
    }
    let pending = this.pending.get(audience);
    if (!pending) {
      pending = this.source
        .getToken(audience)
        .then(token => {
          this.tokens.set(audience, token);
          return token;
        })
        .finally(() => this.pending.delete(audience));
      this.pending.set(audience, pending);
    }
    return (await pending).token;
  }

  /**
   * Forget the cached tokens
   */
  clearCache(): void {
    this.tokens.clear();
  }

  /**
   * `fetch` with an `Authorization: Bearer` workload token
   * @param url - the url to call
   * @param init - fetch options and the token audience
   * @returns the response
   */
  async fetch(url: string | URL, init: OIDCFetchInit = {}): Promise<Response> {
    const { audience, ...options } = init;
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${await this.getToken(audience ?? new URL(url).origin)}`);
    return fetch(url, { ...options, headers });
  }
}
