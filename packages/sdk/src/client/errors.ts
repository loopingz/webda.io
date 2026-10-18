/**
 * The error every transport raises: HTTP status, GraphQL extension code or gRPC status mapped to HTTP-like codes
 */
export class SdkError extends Error {
  /**
   * @param status - HTTP-like status, 0 for a network error or an unreachable server
   * @param message - error message
   * @param options - error details
   * @param options.code - application error code when the server sent one
   * @param options.body - the raw response body
   * @param options.transport - name of the transport that raised the error
   * @param options.cause - the underlying error
   */
  constructor(
    public readonly status: number,
    message: string,
    options: { code?: string; body?: unknown; transport?: string; cause?: unknown } = {}
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SdkError";
    this.code = options.code;
    this.body = options.body;
    this.transport = options.transport;
  }

  /** Application error code, when the server sent one */
  readonly code?: string;
  /** Raw response body */
  readonly body?: unknown;
  /** Transport that raised the error */
  readonly transport?: string;

  /**
   * @returns true when the server could not be reached
   */
  isOffline(): boolean {
    return this.status === 0;
  }
}
