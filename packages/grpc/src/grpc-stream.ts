import type { Http2ServerRequest, Http2ServerResponse } from "node:http2";
import type { IncomingMessage, ServerResponse } from "node:http";
import { useLog } from "@webda/workout";

/** Largest accepted gRPC message (declared frame length), same as the gRPC default of 4 MiB */
export const GRPC_MAX_MESSAGE_SIZE = 4 * 1024 * 1024;

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
  private failed = false;
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

    // Parse incoming gRPC frames (1-byte flag + 4-byte big-endian length + payload); a chunk may hold part of a
    // header, several frames, or both
    req.on("data", (data: Buffer) => {
      if (this.failed) return;
      this.chunk = this.chunk ? Buffer.concat([this.chunk, data]) : data;
      while (this.chunk.length >= 5) {
        const compressed = this.chunk.readUInt8(0);
        const length = this.chunk.readUInt32BE(1);
        // Reject on the header alone: never buffer an oversized or compressed body
        if (compressed) return this.fail(GrpcStatus.UNIMPLEMENTED, "compressed messages are not supported");
        if (length > GRPC_MAX_MESSAGE_SIZE) {
          return this.fail(GrpcStatus.RESOURCE_EXHAUSTED, `message exceeds ${GRPC_MAX_MESSAGE_SIZE} bytes`);
        }
        if (this.chunk.length < 5 + length) break;
        const message = this.chunk.subarray(5, 5 + length);
        this.chunk = this.chunk.subarray(5 + length);
        let decoded: RequestType;
        try {
          decoded = this.definition.requestDeserialize(message);
        } catch (err) {
          return this.fail(GrpcStatus.INVALID_ARGUMENT, `cannot decode message: ${(err as Error)?.message}`);
        }
        try {
          const result = this.onMessageHandler?.(decoded);
          if (result && typeof (result as Promise<void>).catch === "function") {
            (result as Promise<void>).catch(err => this.fail(GrpcStatus.INTERNAL, "message handler failed", err));
          }
        } catch (err) {
          return this.fail(GrpcStatus.INTERNAL, "message handler failed", err);
        }
      }
      if (this.chunk.length === 0) this.chunk = null;
    });

    req.on("end", () => {
      this.onEndHandler?.();
    });

    // "close" also fires after a normal end: only a close before the response ended is a cancellation
    req.on("close", () => {
      if (!(this.response as any).writableEnded) this.onCancelHandler?.();
    });
  }

  /**
   * Stop processing the stream and end it with an error status
   * @param status - gRPC status code
   * @param message - status message
   * @param err - optional underlying error to log
   */
  private fail(status: number, message: string, err?: unknown): void {
    if (err) useLog("ERROR", `gRPC stream: ${message}`, err);
    if (this.failed) return;
    this.failed = true;
    this.chunk = null;
    this.end(status, message);
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
   * @returns false when the response buffer is full (wait for "drain")
   */
  send(message: ResponseType): boolean {
    const responseBuffer = this.definition.responseSerialize(message);
    const frame = Buffer.alloc(5 + responseBuffer.length);
    frame.writeUInt8(0, 0); // Not compressed
    frame.writeUInt32BE(responseBuffer.length, 1);
    responseBuffer.copy(frame, 5);
    return this.response.write(frame) !== false;
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
