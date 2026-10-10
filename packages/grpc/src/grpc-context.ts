import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { HttpContext, WebContext, WebdaError } from "@webda/core";
import { JSONUtils } from "@webda/utils";
import type { GrpcStream } from "./grpc-stream.js";

/**
 * A gRPC message for a value: objects as they are, anything else as `{ value }`, `__` keys removed
 * @param value - an operation result or streamed chunk
 * @returns the message
 */
export function toGrpcMessage(value: unknown): Record<string, unknown> {
  const plain = value === undefined ? undefined : JSON.parse(JSONUtils.stringify(value, undefined, 0, true));
  return typeof plain === "object" && plain !== null && !Array.isArray(plain) ? plain : { value: plain };
}

/**
 * The context of one gRPC call: request metadata as HTTP headers (so useContext().getHttpContext() works and the
 * session loads), the unary request message as input, and streamed output sent message by message.
 */
export class GrpcOperationContext extends WebContext {
  private message?: Buffer;
  private cancelled = false;

  /**
   * @param httpContext - request line and metadata
   * @param stream - the gRPC stream of the call
   * @param response - the HTTP/2 response (drain/close events)
   */
  constructor(
    httpContext: HttpContext,
    private readonly stream: GrpcStream,
    private readonly response: ServerResponse
  ) {
    super(httpContext);
  }

  /**
   * @returns whether the client went away
   */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * The single request message of a unary or server-streaming call
   * @param message - decoded message
   * @returns this
   */
  setMessage(message: unknown): this {
    this.message = Buffer.from(JSON.stringify(message ?? {}));
    return this;
  }

  /**
   * @override
   */
  async getRawInput(limit: number = 10 * 1024 * 1024): Promise<Buffer> {
    return (this.message ?? Buffer.from("{}")).subarray(0, limit);
  }

  /**
   * `getInput()` reads the body through this method, not through `getRawInput()`
   * @override
   */
  async getRawInputAsString(limit?: number): Promise<string> {
    return (await this.getRawInput(limit)).toString();
  }

  /** The client went away: the next write or drain throws. */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Streamed chunks go out immediately; a non-streamed result is buffered as usual
   * @override
   */
  // @ts-ignore same signature as WebContext.write
  public write(output: any, encoding?: string, cb?: (error: Error) => void): boolean {
    if (!this.getExtension("operationStreaming")) return super.write(output, encoding, cb);
    if (this.cancelled) throw new WebdaError.OperationCancelledError();
    return this.stream.send(toGrpcMessage(output));
  }

  /**
   * @override
   */
  async drained(): Promise<void> {
    if (this.cancelled) throw new WebdaError.OperationCancelledError();
    await Promise.race([once(this.response, "drain"), once(this.response, "close")]);
    if (this.cancelled) throw new WebdaError.OperationCancelledError();
  }
}
