import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { HttpContext, StreamingOperationContext, toPublicChunk } from "@webda/core";
import type { GrpcStream } from "./grpc-stream.js";

/**
 * A gRPC message for a value: objects as they are, anything else as `{ value }`, `__` keys removed
 * @param value - an operation result or streamed chunk
 * @returns the message
 */
export function toGrpcMessage(value: unknown): Record<string, unknown> {
  const plain = toPublicChunk(value);
  return typeof plain === "object" && plain !== null && !Array.isArray(plain)
    ? (plain as Record<string, unknown>)
    : { value: plain };
}

/**
 * The context of one gRPC call: request metadata as HTTP headers (so useContext().getHttpContext() works and the
 * session loads), the unary request message as input, and streamed output sent message by message.
 */
export class GrpcOperationContext extends StreamingOperationContext {
  private message?: Buffer;

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

  /**
   * The response is over
   * @override
   */
  protected get connectionEnded(): boolean {
    const response = this.response as { writableEnded?: boolean; destroyed?: boolean };
    return Boolean(response.writableEnded || response.destroyed);
  }

  /**
   * One gRPC message per chunk
   * @override
   */
  protected sendChunk(chunk: any): boolean {
    return this.stream.send(toGrpcMessage(chunk));
  }

  /**
   * Wait for the response buffer to empty, or the response to close or fail
   * @override
   */
  protected async waitForDrain(signal: AbortSignal): Promise<void> {
    await Promise.race([
      once(this.response, "drain", { signal }),
      once(this.response, "close", { signal }),
      once(this.response, "error", { signal }).then(([error]) => {
        throw error;
      })
    ]);
  }
}
