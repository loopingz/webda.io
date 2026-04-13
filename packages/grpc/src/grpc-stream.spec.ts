import { suite, test } from "@webda/test";
import * as assert from "assert";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { GrpcStream, GrpcStatus, GrpcMethodDef } from "./grpc-stream.js";

/**
 * Create a mock IncomingMessage-like object (EventEmitter + readable stream)
 */
function createMockRequest(): EventEmitter & { headers: Record<string, string> } {
  const req = new PassThrough() as any;
  req.headers = { "content-type": "application/grpc" };
  return req;
}

/**
 * Create a mock ServerResponse-like object that captures writes and trailers
 */
function createMockResponse(): {
  res: any;
  written: Buffer[];
  headers: Record<string, string>;
  trailers: Record<string, string> | null;
  ended: boolean;
} {
  const state = {
    written: [] as Buffer[],
    headers: {} as Record<string, string>,
    trailers: null as Record<string, string> | null,
    ended: false,
    res: null as any
  };

  state.res = {
    setHeader(key: string, value: string) {
      state.headers[key] = value;
    },
    write(data: Buffer) {
      state.written.push(Buffer.from(data));
    },
    addTrailers(t: Record<string, string>) {
      state.trailers = t;
    },
    end() {
      state.ended = true;
    }
  };

  return state;
}

/**
 * Create a simple JSON-based method definition for testing
 */
function createJsonMethodDef(): GrpcMethodDef<any, any> {
  return {
    requestSerialize: (msg: any) => Buffer.from(JSON.stringify(msg)),
    requestDeserialize: (buf: Buffer) => JSON.parse(buf.toString()),
    responseSerialize: (msg: any) => Buffer.from(JSON.stringify(msg)),
    responseDeserialize: (buf: Buffer) => JSON.parse(buf.toString()),
    requestStream: false,
    responseStream: false
  };
}

/**
 * Create a gRPC frame from a message buffer
 * Format: 1 byte compressed flag + 4 bytes big-endian length + payload
 */
function createGrpcFrame(data: Buffer): Buffer {
  const frame = Buffer.alloc(5 + data.length);
  frame.writeUInt8(0, 0); // Not compressed
  frame.writeUInt32BE(data.length, 1);
  data.copy(frame, 5);
  return frame;
}

@suite
class GrpcStreamTest {
  @test
  constructorSetsHeaders() {
    const req = createMockRequest();
    const { res, headers } = createMockResponse();
    const def = createJsonMethodDef();

    new GrpcStream(req as any, res, def);

    assert.strictEqual(headers["Content-Type"], "application/grpc");
    assert.strictEqual(headers["Grpc-Accept-Encoding"], "identity");
    assert.strictEqual(headers["Grpc-Encoding"], "identity");
  }

  @test
  async onMessageReceivesDeserializedMessage() {
    const req = createMockRequest();
    const { res } = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, res, def);

    const received: any[] = [];
    stream.onMessage(msg => {
      received.push(msg);
    });

    const payload = Buffer.from(JSON.stringify({ hello: "world" }));
    const frame = createGrpcFrame(payload);
    req.emit("data", frame);

    assert.strictEqual(received.length, 1);
    assert.deepStrictEqual(received[0], { hello: "world" });
  }

  @test
  async sendCreatesProperGrpcFrame() {
    const req = createMockRequest();
    const { res, written } = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, res, def);

    stream.send({ result: "ok" });

    assert.strictEqual(written.length, 1);
    const frame = written[0];

    // Verify frame structure: 1 byte compression + 4 bytes length + payload
    assert.strictEqual(frame.readUInt8(0), 0, "Compression flag should be 0");
    const payloadLength = frame.readUInt32BE(1);
    const payload = frame.subarray(5, 5 + payloadLength);
    const decoded = JSON.parse(payload.toString());
    assert.deepStrictEqual(decoded, { result: "ok" });
  }

  @test
  async endWritesTrailersWithGrpcStatus() {
    const req = createMockRequest();
    const { res, trailers, ended } = createMockResponse();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, mock.res, def);

    stream.end(0);

    assert.ok(mock.ended, "Response should be ended");
    assert.ok(mock.trailers !== null, "Trailers should be set");
    assert.strictEqual(mock.trailers!["grpc-status"], "0");
    assert.strictEqual(mock.trailers!["grpc-message"], undefined, "No message for OK status");
  }

  @test
  async endWithMessageEncodesURIComponent() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, mock.res, def);

    stream.end(13, "Internal server error");

    assert.ok(mock.trailers !== null);
    assert.strictEqual(mock.trailers!["grpc-status"], "13");
    assert.strictEqual(mock.trailers!["grpc-message"], encodeURIComponent("Internal server error"));
  }

  @test
  async endDefaultStatusIsZero() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, mock.res, def);

    stream.end(); // No arguments

    assert.strictEqual(mock.trailers!["grpc-status"], "0");
  }

  @test
  async sendUnarySendsMessageThenEnds() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, mock.res, def);

    stream.sendUnary({ data: "response" });

    // Should have written one frame
    assert.strictEqual(mock.written.length, 1);
    const payload = mock.written[0].subarray(5);
    assert.deepStrictEqual(JSON.parse(payload.toString()), { data: "response" });

    // Should have ended with status 0
    assert.ok(mock.ended);
    assert.strictEqual(mock.trailers!["grpc-status"], "0");
  }

  @test
  async sendErrorEndsWithErrorStatus() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, mock.res, def);

    stream.sendError(GrpcStatus.NOT_FOUND, "Resource not found");

    assert.ok(mock.ended);
    assert.strictEqual(mock.trailers!["grpc-status"], "5");
    assert.strictEqual(mock.trailers!["grpc-message"], encodeURIComponent("Resource not found"));
    // Should NOT have written any data frames
    assert.strictEqual(mock.written.length, 0);
  }

  @test
  async multipleMessagesInOneChunk() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, mock.res, def);

    const received: any[] = [];
    stream.onMessage(msg => {
      received.push(msg);
    });

    const payload1 = Buffer.from(JSON.stringify({ id: 1 }));
    const payload2 = Buffer.from(JSON.stringify({ id: 2 }));
    const frame1 = createGrpcFrame(payload1);
    const frame2 = createGrpcFrame(payload2);

    // Send both frames in a single data event
    const combined = Buffer.concat([frame1, frame2]);
    req.emit("data", combined);

    assert.strictEqual(received.length, 2);
    assert.deepStrictEqual(received[0], { id: 1 });
    assert.deepStrictEqual(received[1], { id: 2 });
  }

  @test
  async splitChunksPartialMessage() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, mock.res, def);

    const received: any[] = [];
    stream.onMessage(msg => {
      received.push(msg);
    });

    const payload = Buffer.from(JSON.stringify({ key: "value" }));
    const frame = createGrpcFrame(payload);

    // Split the frame at an arbitrary point (midway through the payload)
    const splitPoint = 8; // After header + a few bytes of payload
    const part1 = frame.subarray(0, splitPoint);
    const part2 = frame.subarray(splitPoint);

    // Emit first part — incomplete message
    req.emit("data", part1);
    assert.strictEqual(received.length, 0, "Should not deliver incomplete message");

    // Emit second part — completes the message
    req.emit("data", part2);
    assert.strictEqual(received.length, 1, "Should deliver message after all parts arrive");
    assert.deepStrictEqual(received[0], { key: "value" });
  }

  @test
  async onEndHandlerCalledWhenRequestEnds() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, mock.res, def);

    let endCalled = false;
    stream.onEnd(() => {
      endCalled = true;
    });

    req.emit("end");

    assert.ok(endCalled, "onEnd handler should be called");
  }

  @test
  async onCancelHandlerCalledWhenRequestCloses() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, mock.res, def);

    let cancelCalled = false;
    stream.onCancel(() => {
      cancelCalled = true;
    });

    req.emit("close");

    assert.ok(cancelCalled, "onCancel handler should be called");
  }

  @test
  chainingReturnsSameInstance() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    const stream = new GrpcStream(req as any, mock.res, def);

    const result = stream
      .onMessage(() => {})
      .onEnd(() => {})
      .onCancel(() => {});

    assert.strictEqual(result, stream, "Chaining methods should return the same instance");
  }

  @test
  async endHandlesResponseWithoutAddTrailers() {
    const req = createMockRequest();
    const def = createJsonMethodDef();

    // Create a response that does NOT have addTrailers
    const res = {
      setHeader() {},
      write() {},
      end() {}
      // no addTrailers
    };

    const stream = new GrpcStream(req as any, res as any, def);

    // Should not throw even without addTrailers
    stream.end(0);
  }

  @test
  async noMessageHandlerDoesNotThrow() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    // Create stream without registering onMessage
    new GrpcStream(req as any, mock.res, def);

    const payload = Buffer.from(JSON.stringify({ test: true }));
    const frame = createGrpcFrame(payload);

    // Should not throw when no handler is registered
    req.emit("data", frame);
  }

  @test
  async noEndHandlerDoesNotThrow() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    // No onEnd registered
    new GrpcStream(req as any, mock.res, def);

    // Should not throw
    req.emit("end");
  }

  @test
  async noCancelHandlerDoesNotThrow() {
    const req = createMockRequest();
    const mock = createMockResponse();
    const def = createJsonMethodDef();

    // No onCancel registered
    new GrpcStream(req as any, mock.res, def);

    // Should not throw
    req.emit("close");
  }
}

@suite
class GrpcStatusTest {
  @test
  statusCodeValues() {
    assert.strictEqual(GrpcStatus.OK, 0);
    assert.strictEqual(GrpcStatus.CANCELLED, 1);
    assert.strictEqual(GrpcStatus.UNKNOWN, 2);
    assert.strictEqual(GrpcStatus.INVALID_ARGUMENT, 3);
    assert.strictEqual(GrpcStatus.DEADLINE_EXCEEDED, 4);
    assert.strictEqual(GrpcStatus.NOT_FOUND, 5);
    assert.strictEqual(GrpcStatus.ALREADY_EXISTS, 6);
    assert.strictEqual(GrpcStatus.PERMISSION_DENIED, 7);
    assert.strictEqual(GrpcStatus.RESOURCE_EXHAUSTED, 8);
    assert.strictEqual(GrpcStatus.FAILED_PRECONDITION, 9);
    assert.strictEqual(GrpcStatus.ABORTED, 10);
    assert.strictEqual(GrpcStatus.OUT_OF_RANGE, 11);
    assert.strictEqual(GrpcStatus.UNIMPLEMENTED, 12);
    assert.strictEqual(GrpcStatus.INTERNAL, 13);
    assert.strictEqual(GrpcStatus.UNAVAILABLE, 14);
    assert.strictEqual(GrpcStatus.DATA_LOSS, 15);
    assert.strictEqual(GrpcStatus.UNAUTHENTICATED, 16);
  }

  @test
  okSymbol() {
    assert.ok(typeof GrpcStream.OK === "symbol", "OK should be a symbol");
    assert.strictEqual(GrpcStream.OK.toString(), "Symbol(OK)");
  }
}
