import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";

// Tracked operations map for the mock
const mockOperations: Record<string, any> = {};
const mockSchemas: Record<string, any> = {};
const coreEventCallbacks: Record<string, Function> = {};
let mockCallOperationResult: any = {};
let mockCallOperationError: any = null;
/** If set, callOperation will use this as the raw _output string (instead of JSON.stringify(mockCallOperationResult)) */
let mockCallOperationRawOutput: string | undefined = undefined;

vi.mock("@webda/core", () => {
  class MockServiceParameters {
    load(params: any = {}) {
      Object.assign(this, params);
      return this;
    }
  }

  class MockOperationsTransportParameters extends MockServiceParameters {
    operations?: string[];
    load(params: any = {}) {
      super.load(params);
      this.operations ??= ["*"];
      return this;
    }
  }

  class MockService {
    parameters: any;
    _name: string;

    constructor(name?: string, params?: any) {
      this._name = name || "test";
      this.parameters = params || {};
    }

    log(_level: string, ..._args: any[]) {}

    async resolve() {
      return this;
    }

    async init() {
      return this;
    }

    async stop() {}
  }

  class MockOperationsTransport extends MockService {
    getOperations() {
      return mockOperations;
    }

    exposeOperation(_opId: string, _def: any) {}
  }

  return {
    Service: MockService,
    ServiceParameters: MockServiceParameters,
    OperationsTransport: MockOperationsTransport,
    OperationsTransportParameters: MockOperationsTransportParameters,
    OperationDefinition: {},
    callOperation: async (ctx: any, opId: string) => {
      if (mockCallOperationError) {
        throw mockCallOperationError;
      }
      if (mockCallOperationRawOutput !== undefined) {
        ctx._output = mockCallOperationRawOutput;
      } else {
        ctx._output = JSON.stringify(mockCallOperationResult);
      }
    },
    OperationContext: class {},
    SimpleOperationContext: class {
      _input: Buffer;
      _output: string;

      async init() {
        return this;
      }

      setInput(buf: Buffer) {
        this._input = buf;
      }

      getOutput() {
        return this._output;
      }
    },
    WebContext: class {},
    useCoreEvents: (eventName: string, callback: Function) => {
      coreEventCallbacks[eventName] = callback;
      return () => {
        delete coreEventCallbacks[eventName];
      };
    },
    useApplication: () => ({
      getSchemas: () => mockSchemas
    }),
    Command: () => () => {}
  };
});

vi.mock("@webda/workout", () => ({
  useLog: () => ({
    info() {},
    warn() {},
    debug() {},
    error() {}
  })
}));

vi.mock("@grpc/proto-loader", () => ({
  loadSync: vi.fn(function loadSync() {
    return {};
  })
}));

// Dynamic import so mocks are applied first
const { GrpcService, GrpcServiceParameters } = await import("./grpcservice.js");
const { GrpcStatus } = await import("./grpc-stream.js");

@suite
class GrpcServiceParametersTest {
  @test
  defaultValues() {
    const params = new GrpcServiceParameters();
    params.load({});
    assert.strictEqual(params.protoFile, ".webda/app.proto");
    assert.strictEqual(params.packageName, "webda");
  }

  @test
  customValues() {
    const params = new GrpcServiceParameters();
    params.load({
      protoFile: "custom.proto",
      packageName: "myapp"
    });
    assert.strictEqual(params.protoFile, "custom.proto");
    assert.strictEqual(params.packageName, "myapp");
  }

  @test
  defaultsNotOverriddenWhenValueProvided() {
    const params = new GrpcServiceParameters();
    params.load({ protoFile: "my.proto" });
    assert.strictEqual(params.protoFile, "my.proto");
    assert.strictEqual(params.packageName, "webda");
  }
}

@suite
class GrpcServiceExposeOperationTest {
  @test
  exposeOperationIsNoOp() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));

    // Should not throw or do anything
    service.exposeOperation("Post.Create", { service: "PostService", method: "create" });
    service.exposeOperation("User.Get", { service: "UserService", method: "get" });
  }
}

@suite
class GrpcServiceCountServicesTest {
  @test
  countDistinctPrefixes() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));

    const operations = {
      "Post.Create": {},
      "Post.Get": {},
      "User.Login": {},
      "User.Logout": {},
      "Admin.Stats": {}
    };

    const count = (service as any).countServices(operations);
    assert.strictEqual(count, 3);
  }

  @test
  operationsWithoutDotUseDefault() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));

    const operations = {
      Health: {},
      Ping: {},
      "Post.Create": {}
    };

    // "Health" and "Ping" both map to "Default", plus "Post"
    const count = (service as any).countServices(operations);
    assert.strictEqual(count, 2);
  }

  @test
  emptyOperations() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
    const count = (service as any).countServices({});
    assert.strictEqual(count, 0);
  }
}

@suite
class GrpcServiceErrorMappingTest {
  @test
  maps400ToInvalidArgument() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
    const err = { getResponseCode: () => 400, message: "Bad request" };
    assert.strictEqual((service as any).errorToGrpcStatus(err), GrpcStatus.INVALID_ARGUMENT);
  }

  @test
  maps401ToUnauthenticated() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
    const err = { getResponseCode: () => 401, message: "Unauthorized" };
    assert.strictEqual((service as any).errorToGrpcStatus(err), GrpcStatus.UNAUTHENTICATED);
  }

  @test
  maps403ToPermissionDenied() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
    const err = { getResponseCode: () => 403, message: "Forbidden" };
    assert.strictEqual((service as any).errorToGrpcStatus(err), GrpcStatus.PERMISSION_DENIED);
  }

  @test
  maps404ToNotFound() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
    const err = { getResponseCode: () => 404, message: "Not found" };
    assert.strictEqual((service as any).errorToGrpcStatus(err), GrpcStatus.NOT_FOUND);
  }

  @test
  maps409ToAlreadyExists() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
    const err = { getResponseCode: () => 409, message: "Conflict" };
    assert.strictEqual((service as any).errorToGrpcStatus(err), GrpcStatus.ALREADY_EXISTS);
  }

  @test
  maps429ToResourceExhausted() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
    const err = { getResponseCode: () => 429, message: "Too many requests" };
    assert.strictEqual((service as any).errorToGrpcStatus(err), GrpcStatus.RESOURCE_EXHAUSTED);
  }

  @test
  mapsUnknownCodeToInternal() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
    const err = { getResponseCode: () => 500, message: "Server error" };
    assert.strictEqual((service as any).errorToGrpcStatus(err), GrpcStatus.INTERNAL);
  }

  @test
  mapsErrorWithoutGetResponseCodeToInternal() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
    const err = new Error("plain error");
    assert.strictEqual((service as any).errorToGrpcStatus(err), GrpcStatus.INTERNAL);
  }

  @test
  mapsNullErrorToInternal() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
    assert.strictEqual((service as any).errorToGrpcStatus(null), GrpcStatus.INTERNAL);
    assert.strictEqual((service as any).errorToGrpcStatus(undefined), GrpcStatus.INTERNAL);
  }
}

@suite
class GrpcServiceGenerateProtoTest {
  private tmpDir: string;

  beforeEach() {
    this.tmpDir = join(tmpdir(), `grpc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(this.tmpDir, { recursive: true });

    // Clear mockOperations
    for (const key of Object.keys(mockOperations)) {
      delete mockOperations[key];
    }
    for (const key of Object.keys(mockSchemas)) {
      delete mockSchemas[key];
    }
  }

  afterEach() {
    try {
      rmSync(this.tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  @test
  async writesProtoFile() {
    mockOperations["Post.Create"] = {
      service: "PostService",
      method: "create"
    };
    mockOperations["Post.Get"] = {
      service: "PostService",
      method: "get"
    };

    const outPath = join(this.tmpDir, "output", "app.proto");
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: outPath }));

    await service.generateProto();

    assert.ok(existsSync(outPath), "Proto file should be written");
    const content = readFileSync(outPath, "utf-8");
    assert.ok(content.includes('syntax = "proto3"'), "Should contain proto3 syntax");
    assert.ok(content.includes("service PostService {"), "Should contain PostService");
    assert.ok(content.includes("rpc Create"), "Should contain Create rpc");
    assert.ok(content.includes("rpc Get"), "Should contain Get rpc");
  }

  @test
  async writesProtoFileToCustomOutputPath() {
    mockOperations["Health"] = {
      service: "HealthService",
      method: "check"
    };

    const customPath = join(this.tmpDir, "custom.proto");
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));

    await service.generateProto(customPath);

    assert.ok(existsSync(customPath), "Proto file should be written to custom path");
    const content = readFileSync(customPath, "utf-8");
    assert.ok(content.includes("service DefaultService {"), "Should contain DefaultService");
  }

  @test
  async usesCustomPackageName() {
    mockOperations["Test.Ping"] = {};

    const outPath = join(this.tmpDir, "test.proto");
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: outPath, packageName: "myapp" }));

    await service.generateProto();

    const content = readFileSync(outPath, "utf-8");
    assert.ok(content.includes("package myapp;"), "Should use custom package name");
  }

  @test
  async createsDirectoryIfNotExists() {
    mockOperations["Test.Op"] = {};

    const deepPath = join(this.tmpDir, "deep", "nested", "dir", "app.proto");
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: deepPath }));

    await service.generateProto();

    assert.ok(existsSync(deepPath), "Should create nested directories and write file");
  }

  @test
  async emptyOperationsStillProducesValidProto() {
    const outPath = join(this.tmpDir, "empty.proto");
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: outPath }));

    await service.generateProto();

    assert.ok(existsSync(outPath), "Proto file should be written even with no operations");
    const content = readFileSync(outPath, "utf-8");
    assert.ok(content.includes('syntax = "proto3"'));
  }
}

/**
 * Create a gRPC frame from a JSON message
 */
function createGrpcFrame(data: any): Buffer {
  const payload = Buffer.from(JSON.stringify(data));
  const frame = Buffer.alloc(5 + payload.length);
  frame.writeUInt8(0, 0);
  frame.writeUInt32BE(payload.length, 1);
  payload.copy(frame, 5);
  return frame;
}

/**
 * Create a mock request EventEmitter that simulates an HTTP request with gRPC data
 */
function createMockReq(url: string, frameData?: any): EventEmitter & { url: string; headers: Record<string, string> } {
  const req = new EventEmitter() as any;
  req.url = url;
  req.headers = { "content-type": "application/grpc" };

  if (frameData !== undefined) {
    // Schedule data emission on next tick so handlers can be registered
    process.nextTick(() => {
      const frame = createGrpcFrame(frameData);
      req.emit("data", frame);
      // For client/bidi streaming, also emit end
      req.emit("end");
    });
  }

  return req;
}

/**
 * Create a mock response that captures what was written
 */
function createMockRes(): {
  res: any;
  written: Buffer[];
  trailers: Record<string, string> | null;
  ended: boolean;
  headStatus: number;
  headHeaders: Record<string, string>;
  headers: Record<string, string>;
} {
  const state = {
    written: [] as Buffer[],
    trailers: null as Record<string, string> | null,
    ended: false,
    headStatus: 0,
    headHeaders: {} as Record<string, string>,
    headers: {} as Record<string, string>,
    res: null as any
  };

  state.res = {
    setHeader(key: string, value: string) {
      state.headers[key] = value;
    },
    writeHead(status: number, headers: any) {
      state.headStatus = status;
      state.headHeaders = headers || {};
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
 * Create a JSON-based method definition mock
 */
function createJsonMethodDef() {
  return {
    path: "/webda.TestService/TestMethod",
    requestSerialize: (msg: any) => Buffer.from(JSON.stringify(msg)),
    requestDeserialize: (buf: Buffer) => JSON.parse(buf.toString()),
    responseSerialize: (msg: any) => Buffer.from(JSON.stringify(msg)),
    responseDeserialize: (buf: Buffer) => JSON.parse(buf.toString()),
    requestStream: false,
    responseStream: false
  };
}

/**
 * Set up a service with a mapped rpc method
 */
function setupServiceWithRpc(opId: string, opDef: any = {}): InstanceType<typeof GrpcService> {
  const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));
  const methodDef = createJsonMethodDef();
  const grpcPath = `/webda.TestService/${opId.split(".").pop()}`;

  // Manually set up the rpcToOperation and rpcMethods maps
  (service as any).rpcToOperation.set(grpcPath, opId);
  (service as any).rpcMethods.set(grpcPath, methodDef);

  // Set up the mock operation
  mockOperations[opId] = opDef;

  return service;
}

@suite
class GrpcServiceHandleGrpcRequestTest {
  beforeEach() {
    // Clear operations
    for (const key of Object.keys(mockOperations)) {
      delete mockOperations[key];
    }
    mockCallOperationResult = {};
    mockCallOperationError = null;
    mockCallOperationRawOutput = undefined;
  }

  @test
  async unimplementedMethodReturns12() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));

    let writtenHeaders: any = {};
    let ended = false;
    const req = { url: "/webda.UnknownService/UnknownMethod" };
    const res = {
      writeHead(status: number, headers: any) {
        writtenHeaders = headers;
      },
      end() {
        ended = true;
      }
    };

    await service.handleGrpcRequest(req as any, res as any);

    assert.strictEqual(writtenHeaders["grpc-status"], String(GrpcStatus.UNIMPLEMENTED));
    const decodedMessage = decodeURIComponent(writtenHeaders["grpc-message"]);
    assert.ok(decodedMessage.includes("Method not found"), `Expected 'Method not found' in: ${decodedMessage}`);
    assert.ok(ended);
  }

  @test
  async unaryRequestReturnsResponse() {
    const service = setupServiceWithRpc("Test.DoSomething", {});
    mockCallOperationResult = { success: true, id: "123" };

    const grpcPath = "/webda.TestService/DoSomething";
    const req = createMockReq(grpcPath, { input: "hello" });
    const mock = createMockRes();

    await service.handleGrpcRequest(req as any, mock.res);

    // Should have written a response frame
    assert.strictEqual(mock.written.length, 1);
    const payload = mock.written[0].subarray(5);
    const response = JSON.parse(payload.toString());
    assert.deepStrictEqual(response, { success: true, id: "123" });

    // Should have ended with status 0
    assert.ok(mock.trailers !== null);
    assert.strictEqual(mock.trailers!["grpc-status"], "0");
    assert.ok(mock.ended);
  }

  @test
  async unaryRequestHandlesOperationError() {
    const service = setupServiceWithRpc("Test.FailOp", {});
    mockCallOperationError = {
      getResponseCode: () => 404,
      message: "Resource not found"
    };

    const grpcPath = "/webda.TestService/FailOp";
    const req = createMockReq(grpcPath, { id: "missing" });
    const mock = createMockRes();

    await service.handleGrpcRequest(req as any, mock.res);

    // Should have ended with error status
    assert.ok(mock.trailers !== null);
    assert.strictEqual(mock.trailers!["grpc-status"], String(GrpcStatus.NOT_FOUND));
    assert.ok(mock.ended);
  }

  @test
  async serverStreamingReturnsMultipleMessages() {
    const service = setupServiceWithRpc("Test.StreamItems", {
      grpc: { streaming: "server" }
    });
    mockCallOperationRawOutput = '{"id":1}\n{"id":2}\n{"id":3}';

    const grpcPath = "/webda.TestService/StreamItems";
    const req = createMockReq(grpcPath, { query: "all" });
    const mock = createMockRes();

    await service.handleGrpcRequest(req as any, mock.res);

    // Should have written 3 response frames (one per NDJSON line)
    assert.strictEqual(mock.written.length, 3, `Expected 3 frames, got ${mock.written.length}`);

    const msg1 = JSON.parse(mock.written[0].subarray(5).toString());
    const msg2 = JSON.parse(mock.written[1].subarray(5).toString());
    const msg3 = JSON.parse(mock.written[2].subarray(5).toString());
    assert.deepStrictEqual(msg1, { id: 1 });
    assert.deepStrictEqual(msg2, { id: 2 });
    assert.deepStrictEqual(msg3, { id: 3 });

    // Should end with OK
    assert.strictEqual(mock.trailers!["grpc-status"], "0");
  }

  @test
  async serverStreamingHandlesNonJsonLines() {
    const service = setupServiceWithRpc("Test.StreamRaw", {
      grpc: { streaming: "server" }
    });
    mockCallOperationRawOutput = 'not-json-line\n{"valid":true}';

    const grpcPath = "/webda.TestService/StreamRaw";
    const req = createMockReq(grpcPath, {});
    const mock = createMockRes();

    await service.handleGrpcRequest(req as any, mock.res);

    // First line is not valid JSON, should be wrapped in { data: ... }
    assert.strictEqual(mock.written.length, 2);
    const msg1 = JSON.parse(mock.written[0].subarray(5).toString());
    assert.deepStrictEqual(msg1, { data: "not-json-line" });
    const msg2 = JSON.parse(mock.written[1].subarray(5).toString());
    assert.deepStrictEqual(msg2, { valid: true });
  }

  @test
  async serverStreamingHandlesNoOutput() {
    const service = setupServiceWithRpc("Test.StreamEmpty", {
      grpc: { streaming: "server" }
    });
    // Set rawOutput to empty string to simulate no output
    mockCallOperationRawOutput = "";

    const grpcPath = "/webda.TestService/StreamEmpty";
    const req = createMockReq(grpcPath, {});
    const mock = createMockRes();

    await service.handleGrpcRequest(req as any, mock.res);

    // No data frames should be written (empty string filtered by split+filter)
    assert.strictEqual(mock.written.length, 0);
    assert.strictEqual(mock.trailers!["grpc-status"], "0");
  }

  @test
  async serverStreamingHandlesOperationError() {
    const service = setupServiceWithRpc("Test.StreamFail", {
      grpc: { streaming: "server" }
    });
    const err: any = new Error("Stream failed");
    err.getResponseCode = () => 400;
    mockCallOperationError = err;

    const grpcPath = "/webda.TestService/StreamFail";
    const req = createMockReq(grpcPath, {});
    const mock = createMockRes();

    await service.handleGrpcRequest(req as any, mock.res);

    assert.strictEqual(mock.trailers!["grpc-status"], String(GrpcStatus.INVALID_ARGUMENT));
  }

  @test
  async clientStreamingCollectsMessagesAndResponds() {
    const service = setupServiceWithRpc("Test.Upload", {
      grpc: { streaming: "client" }
    });

    const grpcPath = "/webda.TestService/Upload";

    // Create mock req that will emit multiple messages then end
    const req = new EventEmitter() as any;
    req.url = grpcPath;
    req.headers = { "content-type": "application/grpc" };

    const mock = createMockRes();

    mockCallOperationResult = { count: 2, status: "received" };

    const promise = service.handleGrpcRequest(req as any, mock.res);

    // Emit two messages
    process.nextTick(() => {
      req.emit("data", createGrpcFrame({ item: "a" }));
      req.emit("data", createGrpcFrame({ item: "b" }));
      // End the stream
      req.emit("end");
    });

    await promise;

    // Should respond with a unary response (sendUnary)
    assert.strictEqual(mock.written.length, 1);
    const response = JSON.parse(mock.written[0].subarray(5).toString());
    assert.deepStrictEqual(response, { count: 2, status: "received" });
    assert.strictEqual(mock.trailers!["grpc-status"], "0");
  }

  @test
  async bidiStreamingCollectsAndSendsResponse() {
    const service = setupServiceWithRpc("Test.Chat", {
      grpc: { streaming: "bidi" }
    });

    const grpcPath = "/webda.TestService/Chat";
    const req = new EventEmitter() as any;
    req.url = grpcPath;
    req.headers = { "content-type": "application/grpc" };

    const mock = createMockRes();

    mockCallOperationResult = { reply: "ack" };

    const promise = service.handleGrpcRequest(req as any, mock.res);

    process.nextTick(() => {
      req.emit("data", createGrpcFrame({ msg: "hello" }));
      req.emit("end");
    });

    await promise;

    // Bidi uses stream.send (not sendUnary), so no trailers with end
    // The current implementation sends once then resolves
    assert.strictEqual(mock.written.length, 1);
    const response = JSON.parse(mock.written[0].subarray(5).toString());
    assert.deepStrictEqual(response, { reply: "ack" });
  }

  @test
  async clientStreamingHandlesOperationError() {
    const service = setupServiceWithRpc("Test.UploadFail", {
      grpc: { streaming: "client" }
    });
    const err: any = new Error("Upload failed");
    err.getResponseCode = () => 401;
    mockCallOperationError = err;

    const grpcPath = "/webda.TestService/UploadFail";
    const req = new EventEmitter() as any;
    req.url = grpcPath;
    req.headers = { "content-type": "application/grpc" };

    const mock = createMockRes();

    const promise = service.handleGrpcRequest(req as any, mock.res);

    process.nextTick(() => {
      req.emit("data", createGrpcFrame({ item: "x" }));
      req.emit("end");
    });

    await promise;

    assert.strictEqual(mock.trailers!["grpc-status"], String(GrpcStatus.UNAUTHENTICATED));
  }

  @test
  async clientStreamingHandlesCancellation() {
    const service = setupServiceWithRpc("Test.CancelUpload", {
      grpc: { streaming: "client" }
    });

    const grpcPath = "/webda.TestService/CancelUpload";
    const req = new EventEmitter() as any;
    req.url = grpcPath;
    req.headers = { "content-type": "application/grpc" };

    const mock = createMockRes();

    const promise = service.handleGrpcRequest(req as any, mock.res);

    // Emit close (cancellation) instead of end
    process.nextTick(() => {
      req.emit("close");
    });

    await promise;

    // Should resolve without writing data
    assert.strictEqual(mock.written.length, 0);
  }

  @test
  async unaryWithNoGrpcFieldUsesNoneStreaming() {
    // Operation without grpc field should default to unary
    const service = setupServiceWithRpc("Test.Simple", {
      // no grpc field at all
    });

    mockCallOperationResult = { ok: true };

    const grpcPath = "/webda.TestService/Simple";
    const req = createMockReq(grpcPath, { query: "test" });
    const mock = createMockRes();

    await service.handleGrpcRequest(req as any, mock.res);

    assert.strictEqual(mock.written.length, 1);
    assert.strictEqual(mock.trailers!["grpc-status"], "0");
  }

  @test
  async unaryWithNullOutputReturnsEmptyObject() {
    const service = setupServiceWithRpc("Test.NoOutput", {});
    mockCallOperationRawOutput = "";

    const grpcPath = "/webda.TestService/NoOutput";
    const req = createMockReq(grpcPath, {});
    const mock = createMockRes();

    await service.handleGrpcRequest(req as any, mock.res);

    assert.strictEqual(mock.written.length, 1);
    const response = JSON.parse(mock.written[0].subarray(5).toString());
    assert.deepStrictEqual(response, {});
  }
}

@suite
class GrpcServiceBuildRpcMapTest {
  beforeEach() {
    for (const key of Object.keys(mockOperations)) {
      delete mockOperations[key];
    }
  }

  @test
  async buildRpcMapWithMatchingOperations() {
    mockOperations["Post.Create"] = { service: "PostService", method: "create" };
    mockOperations["Post.Get"] = { service: "PostService", method: "get" };

    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ packageName: "webda" }));

    // Set up definitions that match the operations
    (service as any).definitions = {
      "webda.PostService.Create": {
        path: "/webda.PostService/Create",
        requestSerialize: () => Buffer.alloc(0),
        requestDeserialize: () => ({}),
        responseSerialize: () => Buffer.alloc(0),
        responseDeserialize: () => ({})
      },
      "webda.PostService.Get": {
        path: "/webda.PostService/Get",
        requestSerialize: () => Buffer.alloc(0),
        requestDeserialize: () => ({}),
        responseSerialize: () => Buffer.alloc(0),
        responseDeserialize: () => ({})
      }
    };

    (service as any).buildRpcMap();

    assert.strictEqual((service as any).rpcToOperation.size, 2);
    assert.strictEqual((service as any).rpcToOperation.get("/webda.PostService/Create"), "Post.Create");
    assert.strictEqual((service as any).rpcToOperation.get("/webda.PostService/Get"), "Post.Get");
  }

  @test
  async buildRpcMapSkipsNonObjectDefs() {
    mockOperations["Post.Create"] = {};

    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));

    (service as any).definitions = {
      someString: "not an object",
      someNull: null,
      someNumber: 42
    };

    (service as any).buildRpcMap();

    assert.strictEqual((service as any).rpcToOperation.size, 0);
  }

  @test
  async buildRpcMapSkipsDefsWithoutPath() {
    mockOperations["Post.Create"] = {};

    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));

    (service as any).definitions = {
      someObj: { requestSerialize: () => Buffer.alloc(0) } // no path
    };

    (service as any).buildRpcMap();

    assert.strictEqual((service as any).rpcToOperation.size, 0);
  }

  @test
  async buildRpcMapSkipsUnmatchedOperations() {
    // Operations don't match the gRPC path names
    mockOperations["User.Login"] = {};

    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));

    (service as any).definitions = {
      "webda.PostService.Create": {
        path: "/webda.PostService/Create"
      }
    };

    (service as any).buildRpcMap();

    // Post.Create is not in mockOperations, so it should not be mapped
    assert.strictEqual((service as any).rpcToOperation.size, 0);
  }

  @test
  async buildRpcMapHandlesUndefinedDefinitions() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));

    // definitions is not set
    (service as any).definitions = undefined;

    // Should not throw
    (service as any).buildRpcMap();

    assert.strictEqual((service as any).rpcToOperation.size, 0);
  }

  @test
  async buildRpcMapHandlesInvalidPathFormat() {
    mockOperations["Post.Create"] = {};

    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({}));

    (service as any).definitions = {
      invalid: {
        path: "/single-segment" // only one segment after split+filter
      }
    };

    (service as any).buildRpcMap();

    assert.strictEqual((service as any).rpcToOperation.size, 0);
  }
}

@suite
class GrpcServiceInitTest {
  @test
  async initWithoutProtoFileLogsWarning() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: "/nonexistent/path/app.proto" }));

    // Should not throw
    await service.init();
  }

  @test
  async initWithExistingProtoFileLoadsDefinitions() {
    const tmpDir = join(tmpdir(), `grpc-init-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const protoPath = join(tmpDir, "app.proto");
    writeFileSync(protoPath, 'syntax = "proto3"; package webda;');

    try {
      const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: protoPath }));
      // Should not throw — the mock proto-loader returns an empty object
      await service.init();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  @test
  async initRegistersHttpEventHook() {
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: "/nonexistent/file.proto" }));

    await service.init();

    // The init should have registered Webda.Init.Http event callback
    assert.ok(coreEventCallbacks["Webda.Init.Http"], "Should register Webda.Init.Http event");

    // Call the callback with a mock server
    coreEventCallbacks["Webda.Init.Http"]({ server: { on: () => {} } });

    // Also test with server that doesn't have 'on'
    coreEventCallbacks["Webda.Init.Http"]({ server: null });
  }

  @test
  async initHandlesProtoLoadError() {
    const tmpDir = join(tmpdir(), `grpc-init-err-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const protoPath = join(tmpDir, "bad.proto");
    writeFileSync(protoPath, "invalid proto content");

    // Make the mock throw on loadSync
    const protoLoader = await import("@grpc/proto-loader");
    vi.mocked(protoLoader.loadSync).mockImplementationOnce(() => {
      throw new Error("Parse error");
    });

    try {
      const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: protoPath }));
      // Should not throw — error is caught and logged
      await service.init();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
