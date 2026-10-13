import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkError } from "../errors.js";
import type { OperationDescriptor } from "../types.js";
import { GrpcTransport, grpcError } from "./index.js";

/** A readable call of grpc-js: its messages, `cancel()` recorded */
class FakeCall extends Readable {
  cancelled = 0;
  written: unknown[] = [];
  ended = false;

  constructor(
    messages: unknown[] = [],
    protected readonly reply?: (call: FakeCall, message: any) => void
  ) {
    super({ objectMode: true, read() {} });
    for (const message of messages) this.push(message);
  }

  cancel(): void {
    this.cancelled++;
    this.destroy();
  }

  write(message: unknown): boolean {
    this.written.push(message);
    this.reply?.(this, message);
    return true;
  }

  end(): this {
    this.ended = true;
    this.push(null);
    this.emit("status", { code: 0, details: "" });
    return this;
  }

  /**
   * Fail the call as grpc-js does: the status, then the error of the stream
   * @param code - gRPC status code
   * @param details - status details
   */
  fail(code: number, details: string): void {
    this.emit("status", { code, details });
    this.destroy(Object.assign(new Error(details), { code, details }));
  }
}

/** The client of grpc-js: each request records its arguments and returns what the test prepared */
class FakeClient {
  requests: Array<{ kind: string; path: string; args: unknown[] }> = [];
  unary: (message: any, callback: (err: any, response?: unknown) => void) => void = (message, callback) =>
    callback(null, message);
  clientStream?: FakeCall;
  clientStreamCallback?: (err: any, response?: unknown) => void;
  serverStream: FakeCall = new FakeCall();
  bidi: FakeCall = new FakeCall();
  closed = 0;

  makeUnaryRequest(path: string, _ser: unknown, _de: unknown, message: unknown, metadata: unknown, _o: unknown, cb) {
    this.requests.push({ kind: "unary", path, args: [message, metadata] });
    const call = new FakeCall();
    this.unary(message, cb);
    return call;
  }

  makeClientStreamRequest(path: string, _ser: unknown, _de: unknown, metadata: unknown, _o: unknown, cb) {
    this.requests.push({ kind: "client", path, args: [metadata] });
    this.clientStreamCallback = cb;
    this.clientStream = new FakeCall();
    this.clientStream.end = function end(this: FakeCall) {
      this.ended = true;
      cb(null, { total: this.written.reduce((sum: number, m: any) => sum + (m.value ?? 0), 0) });
      return this;
    };
    return this.clientStream;
  }

  makeServerStreamRequest(path: string, _ser: unknown, _de: unknown, message: unknown, metadata: unknown) {
    this.requests.push({ kind: "server", path, args: [message, metadata] });
    return this.serverStream;
  }

  makeBidiStreamRequest(path: string, _ser: unknown, _de: unknown, metadata: unknown) {
    this.requests.push({ kind: "bidi", path, args: [metadata] });
    return this.bidi;
  }

  close(): void {
    this.closed++;
  }
}

/** Metadata of grpc-js */
class FakeMetadata {
  values: Record<string, string> = {};
  set(key: string, value: string): void {
    this.values[key] = value;
  }
}

/** The transport over the fakes: `load()` resolves them instead of importing grpc-js */
class FakeGrpcTransport extends GrpcTransport {
  fake = new FakeClient();

  protected load(): any {
    const method = (rpc: string) => ({ path: `/webda.FixtureService/${rpc}` });
    return Promise.resolve({
      grpc: { Metadata: FakeMetadata },
      client: this.fake,
      definition: {
        [`${this.options.package ?? "webda"}.FixtureService`]: {
          Echo: method("Echo"),
          Ticks: method("Ticks"),
          Sum: method("Sum"),
          Connect: method("Connect")
        }
      }
    });
  }
}

/**
 * @param rpc - the rpc of the FixtureService
 * @param streaming - the streaming mode
 * @param output - the output schema
 * @returns the operation
 */
function op(rpc: string, streaming: OperationDescriptor["streaming"] = "none", output = "Out"): OperationDescriptor {
  return { id: `Fixture.${rpc}`, input: "In", output, streaming, grpc: { service: "FixtureService", rpc } };
}

describe("grpcError", () => {
  it("maps gRPC errors to SdkError", () => {
    const sdk = new SdkError(418, "teapot");
    expect(grpcError(sdk)).toBe(sdk);
    // Not a gRPC status: a network error
    expect([grpcError(undefined).status, grpcError(undefined).message]).toEqual([0, "gRPC error"]);
    const network = grpcError(new Error("socket hang up"));
    expect([network.status, network.message, network.code, network.transport]).toEqual([
      0,
      "socket hang up",
      undefined,
      "grpc"
    ]);
    // The details first, then the message, then the status name
    expect(grpcError({ code: 5, details: "No such thing", message: "5 NOT_FOUND: No such thing" }).message).toBe(
      "No such thing"
    );
    expect(grpcError({ code: 7, message: "denied" })).toMatchObject({ status: 403, message: "denied" });
    expect(grpcError({ code: 16 })).toMatchObject({ status: 401, message: "UNAUTHENTICATED", code: "UNAUTHENTICATED" });
    expect(grpcError({ code: 14 })).toMatchObject({ status: 0, code: "UNAVAILABLE" });
    expect(grpcError({ code: 14 }).isOffline()).toBe(true);
    // An unknown status
    expect(grpcError({ code: 99 })).toMatchObject({ status: 500, message: "gRPC error", code: "99" });
  });
});

describe("GrpcTransport", () => {
  afterEach(() => {
    vi.doUnmock("@grpc/grpc-js");
  });

  it("supports the operations GrpcService serves", () => {
    const transport = new GrpcTransport({ address: "127.0.0.1:1", protoFile: "app.proto" });
    expect(transport.supports(op("Echo"))).toBe(true);
    expect(transport.supports({ ...op("Echo"), grpc: undefined })).toBe(false);
  });

  it("makes unary calls with the input as a message and the headers as metadata", async () => {
    const transport = new FakeGrpcTransport({
      address: "fake",
      protoFile: "app.proto",
      headers: async () => ({ Authorization: "Bearer a", "X-Both": "options" })
    });
    const { fake } = transport;
    expect(await transport.call(op("Echo"), { text: "hi" }, { headers: { "X-Both": "call" } })).toEqual({
      text: "hi"
    });
    expect(fake.requests[0].path).toBe("/webda.FixtureService/Echo");
    expect((fake.requests[0].args[1] as FakeMetadata).values).toEqual({ authorization: "Bearer a", "x-both": "call" });
    // Nothing is an empty message, a scalar or an array is wrapped in `value`
    await transport.call(op("Echo"), undefined, {});
    await transport.call(op("Echo"), null, {});
    await transport.call(op("Echo"), 3, {});
    await transport.call(op("Echo"), [1, 2], {});
    expect(fake.requests.slice(1).map(r => r.args[0])).toEqual([{}, {}, { value: 3 }, { value: [1, 2] }]);
    // A void output: google.protobuf.Empty is undefined, anything else is the message
    expect(await transport.call(op("Echo", "none", "void"), {}, {})).toBeUndefined();
    expect(await transport.call(op("Echo", "none", "void"), { kept: 1 }, {})).toEqual({ kept: 1 });
    fake.unary = (_message, callback) => callback(null, null);
    expect(await transport.call(op("Echo", "none", "void"), {}, {})).toBeNull();
    // Errors are mapped
    fake.unary = (_message, callback) => callback({ code: 5, details: "Nothing to echo" });
    await expect(transport.call(op("Echo"), {}, {})).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Nothing to echo"
    });
    // Aborting the signal cancels the call
    let call!: FakeCall;
    fake.unary = function unary(this: FakeClient) {
      // Never answers
    };
    const makeUnary = fake.makeUnaryRequest.bind(fake);
    fake.makeUnaryRequest = (...args: any[]) => (call = (makeUnary as any)(...args));
    const controller = new AbortController();
    void transport.call(op("Echo"), {}, { signal: controller.signal });
    await vi.waitFor(() => expect(call).toBeDefined());
    controller.abort();
    expect(call.cancelled).toBe(1);
  });

  it("refuses an rpc the proto does not have", async () => {
    const transport = new FakeGrpcTransport({ address: "fake", protoFile: "app.proto" });
    // Not in the service
    await expect(transport.call(op("Missing"), {}, {})).rejects.toMatchObject({
      status: 501,
      code: "UNIMPLEMENTED",
      message: "rpc FixtureService/Missing of Fixture.Missing is not in app.proto"
    });
    // Not in the package
    const other = new FakeGrpcTransport({ address: "fake", protoFile: "app.proto", package: "other" });
    expect(await other.call(op("Echo"), { a: 1 }, {})).toEqual({ a: 1 });
    await expect(other.call({ ...op("Echo"), grpc: { service: "Nope", rpc: "Echo" } }, {}, {})).rejects.toThrow(
      /rpc Nope\/Echo/
    );
  });

  it("streams the messages of a client stream from an (async) iterable or a single message", async () => {
    const transport = new FakeGrpcTransport({ address: "fake", protoFile: "app.proto" });
    const { fake } = transport;
    expect(await transport.call(op("Sum", "client"), [{ value: 1 }, { value: 2 }], {})).toEqual({ total: 3 });
    expect(await transport.call(op("Sum", "client"), new Set([{ value: 4 }, { value: 5 }]), {})).toEqual({ total: 9 });
    async function* values() {
      yield { value: 10 };
      yield 7;
    }
    expect(await transport.call(op("Sum", "client"), values(), {})).toEqual({ total: 17 });
    expect(fake.clientStream!.written).toEqual([{ value: 10 }, { value: 7 }]); // a scalar is wrapped
    // One message
    expect(await transport.call(op("Sum", "client"), { value: 6 }, {})).toEqual({ total: 6 });
    // `null` is one empty message, `undefined` none
    await transport.call(op("Sum", "client"), null, {});
    expect(fake.clientStream!.written).toEqual([{}]);
    await transport.call(op("Sum", "client"), undefined, {});
    expect(fake.clientStream!.written).toEqual([]);
    // A failing input cancels the call
    async function* failing() {
      yield { value: 1 };
      throw new Error("input failed");
    }
    await expect(transport.call(op("Sum", "client"), failing(), {})).rejects.toMatchObject({
      status: 0,
      message: "input failed"
    });
    expect(fake.clientStream!.cancelled).toBe(1);
    // Aborting the signal cancels the call
    const controller = new AbortController();
    const pending = transport.call(
      op("Sum", "client"),
      (async function* never() {
        await new Promise(() => {});
      })(),
      { signal: controller.signal }
    );
    void pending;
    await vi.waitFor(() => expect(fake.requests.length).toBe(8));
    controller.abort();
    expect(fake.clientStream!.cancelled).toBe(1);
  });

  it("streams server messages, and collects them for call()", async () => {
    const transport = new FakeGrpcTransport({ address: "fake", protoFile: "app.proto" });
    const { fake } = transport;
    fake.serverStream = new FakeCall([{ index: 1 }, { index: 2 }]);
    fake.serverStream.push(null);
    const ticks: unknown[] = [];
    for await (const tick of transport.stream(op("Ticks", "server"), { n: 2 }, {})) ticks.push(tick);
    expect(ticks).toEqual([{ index: 1 }, { index: 2 }]);
    expect(fake.requests[0].args[0]).toEqual({ n: 2 });
    // A completed stream is not cancelled
    expect(fake.serverStream.cancelled).toBe(0);
    fake.serverStream = new FakeCall([{ index: 3 }]);
    fake.serverStream.push(null);
    expect(await transport.call(op("Ticks", "server"), {}, {})).toEqual([{ index: 3 }]);
    // stream() of an operation that is not server streaming yields its output
    const outputs: unknown[] = [];
    for await (const output of transport.stream(op("Echo"), { text: "once" }, {})) outputs.push(output);
    expect(outputs).toEqual([{ text: "once" }]);
  });

  it("cancels a server stream the consumer leaves early", async () => {
    const transport = new FakeGrpcTransport({ address: "fake", protoFile: "app.proto" });
    const { fake } = transport;
    // An endless stream: leaving after the first message must cancel the call
    fake.serverStream = new FakeCall([{ index: 1 }, { index: 2 }]);
    for await (const tick of transport.stream(op("Ticks", "server"), {}, {})) {
      expect(tick).toEqual({ index: 1 });
      break;
    }
    expect(fake.serverStream.cancelled).toBe(1);
    // A failing stream rejects with the mapped error, without cancelling it again
    fake.serverStream = new FakeCall([{ index: 1 }]);
    const seen: unknown[] = [];
    const failing = fake.serverStream;
    const error = await (async () => {
      for await (const tick of transport.stream(op("Ticks", "server"), {}, {})) {
        seen.push(tick);
        failing.fail(5, "gone");
      }
    })().catch(e => e);
    expect(seen).toEqual([{ index: 1 }]);
    expect(error).toBeInstanceOf(SdkError);
    expect(error).toMatchObject({ status: 404, message: "gone" });
    expect(failing.cancelled).toBe(0);
    // Aborting the signal cancels the call
    fake.serverStream = new FakeCall([{ index: 1 }]);
    const controller = new AbortController();
    const aborted = fake.serverStream;
    const iterator = transport.stream(op("Ticks", "server"), {}, { signal: controller.signal })[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ done: false, value: { index: 1 } });
    controller.abort();
    expect(aborted.cancelled).toBe(1);
    await iterator.return?.();
  });

  it("connects bidirectional streams, queuing the messages sent before the call is ready", async () => {
    const transport = new FakeGrpcTransport({ address: "fake", protoFile: "app.proto" });
    const { fake } = transport;
    fake.bidi = new FakeCall([], (call, message) => call.push({ frame: `echo ${message.frame}` }));
    const stream = transport.connect(op("Connect", "bidi"), {});
    stream.send({ frame: "a" });
    stream.send("b");
    stream.close();
    const frames: unknown[] = [];
    for await (const frame of stream) frames.push(frame);
    await stream.closed;
    expect(fake.bidi.written).toEqual([{ frame: "a" }, { value: "b" }]);
    expect(frames).toEqual([{ frame: "echo a" }, { frame: "echo undefined" }]);
    expect(fake.bidi.ended).toBe(true);
    // call() of a bidirectional operation sends the input messages and collects the replies
    fake.bidi = new FakeCall([], (call, message) => call.push({ frame: `echo ${message.frame}` }));
    expect(await transport.call(op("Connect", "bidi"), [{ frame: "x" }, { frame: "y" }], {})).toEqual([
      { frame: "echo x" },
      { frame: "echo y" }
    ]);
    // A failing call rejects its iteration and `closed`
    fake.bidi = new FakeCall([], call => call.fail(5, "Nothing to echo"));
    const failing = transport.connect(op("Connect", "bidi"), {});
    failing.send({ frame: "fail" });
    await expect(
      (async () => {
        for await (const frame of failing) void frame;
      })()
    ).rejects.toMatchObject({ status: 404, message: "Nothing to echo" });
    await expect(failing.closed).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    // Aborting the signal cancels the call
    fake.bidi = new FakeCall();
    const controller = new AbortController();
    const aborted = fake.bidi;
    const cancelled = transport.connect(op("Connect", "bidi"), { signal: controller.signal });
    cancelled.send({ frame: "a" });
    await vi.waitFor(() => expect(aborted.written).toHaveLength(1));
    controller.abort();
    expect(aborted.cancelled).toBe(1);
  });

  it("rejects a bidirectional stream whose rpc is missing", async () => {
    const transport = new FakeGrpcTransport({ address: "fake", protoFile: "app.proto" });
    const stream = transport.connect(op("Missing", "bidi"), {});
    stream.send({ frame: "lost" });
    stream.close();
    await expect(stream.closed).rejects.toMatchObject({ status: 501, code: "UNIMPLEMENTED" });
    await expect(
      (async () => {
        for await (const frame of stream) void frame;
      })()
    ).rejects.toMatchObject({ status: 501 });
  });

  it("loads the proto once, retries a failed load and closes the channel", async () => {
    const transport = new GrpcTransport({ address: "127.0.0.1:1", protoFile: "/nonexistent/app.proto" });
    await expect(transport.call(op("Echo"), {}, {})).rejects.toThrow(/ENOENT|no such file/);
    // The failed load is forgotten: the next call loads again
    expect((transport as any).loaded).toBeUndefined();
    await expect(transport.call(op("Echo"), {}, {})).rejects.toThrow(/ENOENT|no such file/);
    // Nothing to close
    await transport.close();
    // A loaded channel is closed
    const fake = new FakeGrpcTransport({ address: "fake", protoFile: "app.proto" });
    (fake as any).loaded = (fake as any).load();
    await fake.close();
    expect(fake.fake.closed).toBe(1);
    expect((fake as any).loaded).toBeUndefined();
    // A failed load has nothing to close
    (fake as any).loaded = Promise.reject(new Error("failed"));
    await fake.close();
    expect(fake.fake.closed).toBe(1);
  });

  it("explains that grpc-js and proto-loader are needed", async () => {
    vi.doMock("@grpc/grpc-js", () => {
      throw new Error("Cannot find package '@grpc/grpc-js'");
    });
    const transport = new GrpcTransport({ address: "127.0.0.1:1", protoFile: "app.proto" });
    const error = await transport.call(op("Echo"), {}, {}).catch(e => e);
    expect(error).toBeInstanceOf(SdkError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/@grpc\/grpc-js and @grpc\/proto-loader are required by GrpcTransport/);
  });
});
