declare module "hawk" {
  interface Credentials {
    id: string;
    key: string;
    algorithm: string;
  }

  interface Request {
    method: string;
    url: string;
    host: string;
    port: number;
    authorization?: string;
    payload?: string | Buffer;
    contentType?: string;
  }

  interface Authentication {
    credentials: Credentials;
    artifacts: Record<string, unknown>;
  }

  export const server: {
    /**
     * Authenticate an incoming request.
     * @param request - parsed request attributes
     * @param credentials - resolve credentials by key id
     * @returns authenticated credentials and signing artifacts
     */
    authenticate(request: Request, credentials: (id: string) => Promise<Credentials>): Promise<Authentication>;
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
      options: { payload: string; contentType: string }
    ): string;
  };
}
