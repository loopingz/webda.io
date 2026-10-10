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
/** Services returned by the mocked useCore().getServices() — set per test to inject HttpServer stubs */
let mockCoreServices: Record<string, any> = {};
/** Models returned by the mocked useApplication().getModels() — used by build() */
let mockModels: Record<string, any> = {};

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
    AsyncQueue: class {},
    HttpContext: class {},
    WebdaError: { OperationCancelledError: class extends Error {} },
    getOperationStreaming: (op: any) => op?.streaming ?? op?.grpc?.streaming ?? "none",
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
      getSchemas: () => mockSchemas,
      getModels: () => mockModels
    }),
    useCore: () => ({ getServices: () => mockCoreServices }),
    useInstanceStorage: () => ({}),
    runWithInstanceStorage: (_storage: any, fn: () => any) => fn(),
    runWithContext: (_ctx: any, fn: () => any) => fn(),
    emitCoreEvent: () => {},
    useRouter: () => ({ checkRequest: async () => true }),
    Command: () => () => {},
    BuildCommand: () => () => {}
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
const { GrpcService, GrpcServiceParameters } = await import("./grpcservice.service.js");
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

    await service.build();

    assert.ok(existsSync(outPath), "Proto file should be written");
    const content = readFileSync(outPath, "utf-8");
    assert.ok(content.includes('syntax = "proto3"'), "Should contain proto3 syntax");
    assert.ok(content.includes("service PostService {"), "Should contain PostService");
    assert.ok(content.includes("rpc Create"), "Should contain Create rpc");
    assert.ok(content.includes("rpc Get"), "Should contain Get rpc");
  }

  @test
  async writesProtoFileToConfiguredPath() {
    mockOperations["Health"] = {
      service: "HealthService",
      method: "check"
    };

    const customPath = join(this.tmpDir, "custom.proto");
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: customPath }));

    await service.build();

    assert.ok(existsSync(customPath), "Proto file should be written to configured path");
    const content = readFileSync(customPath, "utf-8");
    assert.ok(content.includes("service DefaultService {"), "Should contain DefaultService");
  }

  @test
  async usesCustomPackageName() {
    mockOperations["Test.Ping"] = {};

    const outPath = join(this.tmpDir, "test.proto");
    const service = new GrpcService(
      "testGrpc",
      new GrpcServiceParameters().load({ protoFile: outPath, packageName: "myapp" })
    );

    await service.build();

    const content = readFileSync(outPath, "utf-8");
    assert.ok(content.includes("package myapp;"), "Should use custom package name");
  }

  @test
  async createsDirectoryIfNotExists() {
    mockOperations["Test.Op"] = {};

    const deepPath = join(this.tmpDir, "deep", "nested", "dir", "app.proto");
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: deepPath }));

    await service.build();

    assert.ok(existsSync(deepPath), "Should create nested directories and write file");
  }

  @test
  async foldsModelInputSchemasIntoSchemasMap() {
    // app.getModels() returns models whose Metadata.Schemas.Input should be
    // merged into the schema map used for proto generation.
    mockOperations["Post.Create"] = { service: "PostService", method: "create" };
    mockModels = {
      "WebdaSample/Post": {
        Metadata: { Schemas: { Input: { type: "object", properties: { title: { type: "string" } } } } }
      }
    };
    const outPath = join(this.tmpDir, "with-model.proto");
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: outPath }));
    try {
      await service.build();
      assert.ok(existsSync(outPath), "Proto file should be written");
    } finally {
      mockModels = {};
    }
  }

  @test
  async emptyOperationsStillProducesValidProto() {
    const outPath = join(this.tmpDir, "empty.proto");
    const service = new GrpcService("testGrpc", new GrpcServiceParameters().load({ protoFile: outPath }));

    await service.build();

    assert.ok(existsSync(outPath), "Proto file should be written even with no operations");
    const content = readFileSync(outPath, "utf-8");
    assert.ok(content.includes('syntax = "proto3"'));
  }
}

@suite
class GrpcServiceUnknownMethodTest {
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
    const service = new GrpcService(
      "testGrpc",
      new GrpcServiceParameters().load({ protoFile: "/nonexistent/path/app.proto" })
    );

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
  async initRegistersInterceptorOnEveryHttpServer() {
    // Two HttpServer-like services — each should receive the gRPC interceptor
    const interceptorsA: Function[] = [];
    const interceptorsB: Function[] = [];
    mockCoreServices = {
      HttpServer: { registerRequestInterceptor: (fn: Function) => interceptorsA.push(fn) },
      HttpServerH2c: { registerRequestInterceptor: (fn: Function) => interceptorsB.push(fn) },
      Plain: {} // no registerRequestInterceptor — must be skipped
    };

    const service = new GrpcService(
      "testGrpc",
      new GrpcServiceParameters().load({ protoFile: "/nonexistent/file.proto" })
    );
    await service.init();

    assert.strictEqual(interceptorsA.length, 1, "HttpServer should get the interceptor");
    assert.strictEqual(interceptorsB.length, 1, "HttpServerH2c should get the interceptor");

    // Interceptor short-circuits non-grpc content types
    const req = { headers: { "content-type": "text/html" } };
    const res = {};
    assert.strictEqual(interceptorsA[0](req, res), false);

    // Interceptor claims application/grpc requests and runs handleGrpcRequest
    let handleCalled = false;
    (service as any).handleGrpcRequest = async () => {
      handleCalled = true;
    };
    const grpcReq = {
      url: "/webda.Missing/Method",
      headers: { "content-type": "application/grpc" }
    };
    const grpcRes = {};
    assert.strictEqual(interceptorsA[0](grpcReq, grpcRes), true);
    // handleGrpcRequest fires synchronously inside runWithInstanceStorage
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(handleCalled, "Interceptor should dispatch to handleGrpcRequest");

    mockCoreServices = {};
  }

  @test
  async initLogsWarningWhenNoHttpServer() {
    // No services registered → init should log a warning but not throw.
    mockCoreServices = {};
    const service = new GrpcService(
      "testGrpc",
      new GrpcServiceParameters().load({ protoFile: "/nonexistent/file.proto" })
    );
    await service.init();
    mockCoreServices = {};
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
