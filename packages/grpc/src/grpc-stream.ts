import type { Http2ServerRequest, Http2ServerResponse } from "node:http2";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Parsed gRPC method definition with serializer/deserializer functions.
 */
export interface GrpcMethodDef<Req = any, Res = any> {
  requestSerialize: (msg: Req) => Buffer;
  requestDeserialize: (buf: Buffer) => Req;
  responseSerialize: (msg: Res) => Buffer;
  responseDeserialize: (buf: Buffer) => Res;
  requestStream: boolean;
  responseStream: boolean;
}

/**
 * gRPC bidirectional stream handler.
 *
 * Manages frame parsing (5-byte header: compressed flag + 4-byte big-endian length),
 * message deserialization, and response framing for HTTP/2 gRPC streams.
 *
 * Supports all four gRPC patterns:
 * - Unary (single request, single response)
 * - Server streaming (single request, stream of responses)
 * - Client streaming (stream of requests, single response)
 * - Bidirectional streaming (stream of requests, stream of responses)
 */
export class GrpcStream<RequestType = any, ResponseType = any> {
  /** Sentinel value indicating successful stream setup */
  static OK = Symbol("OK");

  private onMessageHandler: (message: RequestType) => void | Promise<void>;
  private onEndHandler?: () => void;
  private onCancelHandler?: () => void;
  private chunk: Buffer | null = null;
  private messageLength = 0;
  private request: IncomingMessage | Http2ServerRequest;
  private response: ServerResponse | Http2ServerResponse;
  private definition: GrpcMethodDef<RequestType, ResponseType>;

  /**
   * Create a new GrpcStream to handle a single gRPC request/response lifecycle.
   * @param req - the incoming HTTP/2 request carrying the gRPC frames
   * @param res - the HTTP/2 response used to write gRPC frames and trailers
   * @param definition - protobuf method definition providing serialize/deserialize functions
   */
  constructor(
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse | Http2ServerResponse,
    definition: GrpcMethodDef<RequestType, ResponseType>
  ) {
    this.request = req;
    this.response = res;
    this.definition = definition;

    // Set gRPC response headers
    this.response.setHeader("Content-Type", "application/grpc");
    this.response.setHeader("Grpc-Accept-Encoding", "identity");
    this.response.setHeader("Grpc-Encoding", "identity");

    // Parse incoming gRPC frames
    req.on("data", (data: Buffer) => {
      if (this.chunk === null) {
        this.messageLength = data.readUInt32BE(1);
        this.chunk = data;
      } else {
        this.chunk = Buffer.concat([this.chunk, data]);
      }
      // Check if we have a complete message
      while (this.chunk && this.chunk.length >= 5 + this.messageLength) {
        const message = this.chunk.subarray(5, 5 + this.messageLength);
        const deserialized = this.definition.requestDeserialize(message);
        this.onMessageHandler?.(deserialized);
        // Advance to next frame
        this.chunk = this.chunk.subarray(5 + this.messageLength);
        if (this.chunk.length >= 5) {
          this.messageLength = this.chunk.readUInt32BE(1);
        } else if (this.chunk.length === 0) {
          this.chunk = null;
        }
      }
    });

    req.on("end", () => {
      this.onEndHandler?.();
    });

    req.on("close", () => {
      this.onCancelHandler?.();
    });
  }

  /**
   * Register handler for incoming messages
   * @param handler - callback invoked with each deserialized request message
   * @returns this instance for chaining
   */
  onMessage(handler: (message: RequestType) => void | Promise<void>): this {
    this.onMessageHandler = handler;
    return this;
  }

  /**
   * Register handler for stream end (client finished sending)
   * @param handler - callback invoked when the client closes the send side of the stream
   * @returns this instance for chaining
   */
  onEnd(handler: () => void): this {
    this.onEndHandler = handler;
    return this;
  }

  /**
   * Register handler for stream cancellation (client disconnected)
   * @param handler - callback invoked when the underlying connection is closed by the client
   * @returns this instance for chaining
   */
  onCancel(handler: () => void): this {
    this.onCancelHandler = handler;
    return this;
  }

  /**
   * Send a response message with gRPC framing.
   * @param message - the response message to serialize and send
   * @returns void
   */
  send(message: ResponseType): void {
    const responseBuffer = this.definition.responseSerialize(message);
    const frame = Buffer.alloc(5 + responseBuffer.length);
    frame.writeUInt8(0, 0); // Not compressed
    frame.writeUInt32BE(responseBuffer.length, 1);
    responseBuffer.copy(frame, 5);
    this.response.write(frame);
  }

  /**
   * End the response with gRPC status trailers.
   * @param status - gRPC status code (0 = OK)
   * @param message - optional status message included in grpc-message trailer
   * @returns void
   */
  end(status: number = 0, message?: string): void {
    const trailers: Record<string, string> = { "grpc-status": String(status) };
    if (message) {
      trailers["grpc-message"] = encodeURIComponent(message);
    }
    (this.response as any).addTrailers?.(trailers);
    this.response.end();
  }

  /**
   * Send a single unary response and close the stream.
   * @param message - the response message to serialize and send before closing
   * @returns void
   */
  sendUnary(message: ResponseType): void {
    this.send(message);
    this.end(0);
  }

  /**
   * Send an error response and close the stream.
   * @param status - gRPC status code indicating the error type
   * @param message - human-readable error message included in grpc-message trailer
   * @returns void
   */
  sendError(status: number, message: string): void {
    this.end(status, message);
  }
}

/** gRPC status codes */
export const GrpcStatus = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16
} as const;
