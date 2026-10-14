import { fetchToken, type SourcedToken, type TokenSource } from "./source.js";

/**
 * Identity token of the GCP default service account, from the metadata server
 */
export class GCPMetadataTokenSource implements TokenSource {
  /**
   * @param timeout - request timeout in milliseconds
   * @param host - metadata server host
   */
  constructor(
    protected timeout: number,
    protected host: string = "metadata.google.internal"
  ) {}

  /**
   * @override
   */
  async getToken(audience: string): Promise<SourcedToken> {
    return fetchToken(
      `http://${this.host}/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}&format=full`,
      { headers: { "Metadata-Flavor": "Google" } },
      res => res.text(),
      this.timeout
    );
  }
}
