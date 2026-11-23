declare module "hawk" {
  /**
   * Credentials interface
   */
  interface Credentials {
    /**
     * Unique identifier
     */
    id: string;
    /**
     * Key
     */
    key: string;
    /**
     * Algorithm
     */
    algorithm: string;
  }

  /**
   * Request interface
   */
  interface Request {
    /**
     * Method
     */
    method: string;
    /**
     * URL
     */
    url: string;
    /**
     * Host
     */
    host: string;
    /**
     * Port
     */
    port: number;
    /**
     * Authorization
     */
    authorization?: string;
    /**
     * Payload
     */
    payload?: string | Buffer;
    /**
     * Content type
     */
    contentType?: string;
  }

  /**
   * Authentication interface
   */
  interface Authentication {
    /**
     * Credentials
     */
    credentials: Credentials;
    /**
     * Artifacts
     */
    artifacts: Record<string, unknown>;
  }

  export const server: {
    /**
     * Authenticate an incoming request.
     * @param request - parsed request attributes
     * @param credentials - resolve credentials by key id
     * @returns authenticated credentials and signing artifacts
     */
    authenticate(
      request: Request,
      credentials: (id: string) => Promise<Credentials>,
      options?: {
        /**
         * Permitted clock skew in seconds
         */
        timestampSkewSec?: number;
        /**
         * Payload to verify against the hash of the Authorization header; requires the hash when set
         */
        payload?: string | Buffer;
        /**
         * Reject a reused nonce by throwing
         */
        nonceFunc?: (key: string, nonce: string, ts: string) => Promise<void>;
      }
    ): Promise<Authentication>;
    /**
     * Verify a payload against the hash of authenticated artifacts
     * @param payload - the payload
     * @param credentials - credentials used for authentication
     * @param artifacts - authenticated request artifacts
     * @param contentType - the payload content type
     * @throws Error if the hash does not match
     */
    authenticatePayload(
      payload: string | Buffer,
      credentials: Credentials,
      artifacts: Record<string, unknown>,
      contentType?: string
    ): void;
    /**
     * Sign the response to an authenticated request.
     * @param credentials - credentials used for authentication
     * @param artifacts - authenticated request artifacts
     * @param options - response payload and content type
     * @returns the Server-Authorization header
     */
    header(
      credentials: Credentials,
      artifacts: Record<string, unknown>,
      options: { payload: string | Buffer; contentType: string }
    ): string;
  };
}
