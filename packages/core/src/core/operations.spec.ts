import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  registerOperation,
  listOperations,
  callOperation,
  resolveArguments,
  Operation,
  RestParameters,
  GrpcParameters,
  GraphQLParameters
} from "../index.js";
import type { OperationDefinition } from "../index.js";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useApplication } from "../application/hooks.js";
import { Application } from "../application/application.js";
import { registerSchema } from "../schemas/hooks.js";

/**
 * Fake operation context that allows setting custom input
 */
class FakeOpContext extends OperationContext {
  input: string = "";
  setInput(input: string) {
    this.input = input;
  }

  async getRawInputAsString(
    _limit: number = 1024 * 1024 * 10,
    _timeout: number = 60000,
    _encoding?: string
  ): Promise<string> {
    return this.input;
  }

  async getRawInput(_limit: number = 1024 * 1024 * 10, _timeout: number = 60000): Promise<Buffer> {
    return Buffer.from(this.input);
  }
}

/**
 * Service with an operation method for testing
 */
class OperationTestService extends Service {
  called: boolean = false;

  constructor(name: string, params: Partial<ServiceParameters> = {}) {
    super(name, new ServiceParameters().load(params));
  }

  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  async doSomething(ctx: OperationContext) {
    this.called = true;
    ctx.write("done");
  }

  async doFail(_ctx: OperationContext) {
    throw new Error("Operation failed");
  }
}

@suite
class RegisterOperationTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {
        OpService: {
          type: "OperationTestService"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/OperationTestService", OperationTestService);
  }

  @test
  async registerOperationBasic() {
    // Register a valid operation
    registerOperation("OpService.DoSomething", {
      service: "OpService",
      method: "doSomething",
      input: "void",
      output: "void"
    });

    // Verify it appears in listOperations
    const ops = listOperations();
    assert.ok(ops["OpService.DoSomething"]);
    // service and method should be stripped from the list
    assert.strictEqual(ops["OpService.DoSomething"]["service"], undefined);
    assert.strictEqual(ops["OpService.DoSomething"]["method"], undefined);
    assert.strictEqual(ops["OpService.DoSomething"].id, "OpService.DoSomething");
  }

  @test
  async registerOperationBadNaming() {
    // Operation IDs must match ^([A-Z][A-Za-z0-9]*.)*([A-Z][a-zA-Z0-9]*)$
    assert.throws(
      () =>
        registerOperation("lowercase", {
          service: "OpService",
          method: "doSomething",
          input: "void",
          output: "void"
        }),
      /OperationId lowercase must match/
    );
    assert.throws(
      () =>
        registerOperation("has-dash.Op", {
          service: "OpService",
          method: "doSomething",
          input: "void",
          output: "void"
        }),
      /OperationId has-dash.Op must match/
    );
  }

  @test
  async registerOperationMissingServiceAndModel() {
    // Must have service or model
    assert.throws(
      () =>
        registerOperation("Op.NoTarget", {
          method: "doSomething",
          input: "void",
          output: "void"
        } as any),
      /must have a service or a model/
    );
  }

  @test
  async registerOperationBadService() {
    // Service exists but method does not
    assert.throws(
      () =>
        registerOperation("Op.BadMethod", {
          service: "OpService",
          method: "nonExistentMethod",
          input: "void",
          output: "void"
        }),
      /method nonExistentMethod not found/
    );
  }

  @test
  async registerOperationUnknownService() {
    // Service does not exist
    assert.throws(
      () =>
        registerOperation("Op.Unknown", {
          service: "NonExistentService",
          method: "doSomething",
          input: "void",
          output: "void"
        }),
      /method doSomething not found/
    );
  }

  @test
  async registerOperationWithInputSchema() {
    // Register with an input schema that doesn't exist - should be reset to "void"
    registerOperation("OpService.WithBadInput", {
      service: "OpService",
      method: "doSomething",
      input: "nonexistent.schema",
      output: "void"
    });
    const ops = listOperations();
    // The input should have been reset to "void" since the schema doesn't exist
    assert.strictEqual(ops["OpService.WithBadInput"].input, "void");
  }

  @test
  async listOperationsEmpty() {
    // Before registering any operations, list should be empty (or contain only previously registered)
    const ops = listOperations();
    assert.ok(typeof ops === "object");
  }

  @test
  async listOperationsMultiple() {
    registerOperation("OpService.First", {
      service: "OpService",
      method: "doSomething",
      input: "void",
      output: "void"
    });
    registerOperation("OpService.Second", {
      service: "OpService",
      method: "doSomething",
      input: "void",
      output: "void"
    });
    const ops = listOperations();
    assert.ok(ops["OpService.First"]);
    assert.ok(ops["OpService.Second"]);
  }

  @test
  async registerOperationWithOutputSchema() {
    // Register with an output schema that doesn't exist - should be reset to "void"
    registerOperation("OpService.WithBadOutput", {
      service: "OpService",
      method: "doSomething",
      input: "void",
      output: "nonexistent.output.schema"
    });
    const ops = listOperations();
    assert.strictEqual(ops["OpService.WithBadOutput"].output, "void");
  }

  @test
  async registerOperationOverwrite() {
    // Register same operation ID twice - should overwrite
    registerOperation("OpService.Overwrite", {
      service: "OpService",
      method: "doSomething",
      input: "void",
      output: "void"
    });
    registerOperation("OpService.Overwrite", {
      service: "OpService",
      method: "doFail",
      input: "void",
      output: "void"
    });
    const ops = listOperations();
    assert.ok(ops["OpService.Overwrite"]);
  }

  @test
  async callOperationUnknown() {
    // callOperation on unknown operation should throw NotFound
    const ctx = new FakeOpContext();
    await ctx.init();
    // checkOperation calls checkOperationPermission which throws NotFound for unknown
    await assert.rejects(() => callOperation(ctx, "Unknown.Op"), /Unknown/);
  }

  @test
  async callOperationSetsExtension() {
    // Register a valid operation so checkOperationPermission passes
    registerOperation("OpService.TestExt", {
      service: "OpService",
      method: "doSomething",
      input: "void",
      output: "void"
    });
    const ctx = new FakeOpContext();
    await ctx.init();
    // callOperation will call checkOperation which uses this.validateSchema
    // Since the operation has no input/parameters, checkOperation passes
    // But callOperation then uses this.getService which will fail
    // This tests the extension-setting and event-emitting paths
    try {
      await callOperation(ctx, "OpService.TestExt");
    } catch {
      // Expected - this.getService is not a function in standalone context
    }
    // The operation extension should have been set before the error
    assert.strictEqual(ctx.getExtension("operation"), "OpService.TestExt");
    // The event extension should be cleared in finally
    assert.strictEqual(ctx.getExtension("event"), undefined);
  }
}

@suite
class OperationDecoratorTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {
        TestSvc: {
          type: "DecoratedService"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/DecoratedService", DecoratedService);
  }

  @test
  async decoratorRegistersMetadata() {
    // The @Operation decorator stores metadata on the class
    const metadata = DecoratedService[Symbol.metadata];
    assert.ok(metadata);
    const ops = metadata["webda.operations"];
    assert.ok(Array.isArray(ops));
    assert.ok(ops.length >= 1);
    // Check that the myOp method is registered
    const myOp = ops.find((o: any) => o.id === "myOp");
    assert.ok(myOp, "myOp should be registered in metadata");
  }

  @test
  async decoratorWithOptions() {
    const metadata = DecoratedService[Symbol.metadata];
    const ops = metadata["webda.operations"] as any[];
    const customOp = ops.find((o: any) => o.id === "CustomId");
    assert.ok(customOp, "CustomId operation should exist");
    assert.strictEqual(customOp.id, "CustomId");
  }
}

class DecoratedService extends Service {
  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  @Operation
  async myOp(ctx: OperationContext) {
    ctx.write("decorated");
  }

  @Operation({ id: "CustomId", summary: "A custom op" })
  async customOperation(ctx: OperationContext) {
    ctx.write("custom");
  }
}

/**
 * Service with decorated operations using transport hints
 */
class TransportHintService extends Service {
  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  @Operation<RestParameters>({
    id: "RestOp",
    summary: "REST operation",
    rest: { method: "post", path: "/tasks" }
  })
  async restOp(ctx: OperationContext) {
    ctx.write("rest");
  }

  @Operation<GrpcParameters>({
    id: "GrpcOp",
    grpc: { streaming: "server" }
  })
  async grpcOp(ctx: OperationContext) {
    ctx.write("grpc");
  }

  @Operation<GraphQLParameters>({
    id: "GraphQLOp",
    graphql: { query: "getTasks" }
  })
  async graphqlOp(ctx: OperationContext) {
    ctx.write("graphql");
  }

  @Operation<RestParameters & GrpcParameters>({
    id: "MultiTransportOp",
    summary: "Multi-transport",
    description: "Supports REST and gRPC",
    tags: ["tasks", "multi"],
    deprecated: true,
    rest: { method: "get", path: "/tasks/multi" },
    grpc: { streaming: "bidi" }
  })
  async multiOp(ctx: OperationContext) {
    ctx.write("multi");
  }

  @Operation<RestParameters>({
    id: "HiddenOp",
    hidden: true,
    rest: false
  })
  async hiddenOp(ctx: OperationContext) {
    ctx.write("hidden");
  }

  async doSomething(_ctx: OperationContext) {
    // plain method for registerOperation tests
  }
}

@suite
class OperationMetadataTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {
        TransportSvc: {
          type: "TransportHintService"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/TransportHintService", TransportHintService);
  }

  @test
  async registerOperationWithMetadata() {
    registerOperation("TransportSvc.WithMeta", {
      service: "TransportSvc",
      method: "doSomething",
      input: "void",
      output: "void",
      summary: "A short summary",
      description: "A full description of this operation",
      tags: ["admin", "tasks"],
      deprecated: true,
      hidden: false
    });

    const ops = listOperations();
    const op = ops["TransportSvc.WithMeta"];
    assert.ok(op, "Operation should be registered");
    assert.strictEqual(op.summary, "A short summary");
    assert.strictEqual(op.description, "A full description of this operation");
    assert.deepStrictEqual(op.tags, ["admin", "tasks"]);
    assert.strictEqual(op.deprecated, true);
    assert.strictEqual(op.hidden, false);
  }

  @test
  async registerOperationWithRestHints() {
    registerOperation("TransportSvc.RestHint", {
      service: "TransportSvc",
      method: "doSomething",
      input: "void",
      output: "void",
      rest: {
        method: "post",
        path: "/api/tasks",
        responses: {
          "200": { description: "Success" },
          "400": { description: "Bad request" }
        }
      }
    });

    const ops = listOperations();
    const op = ops["TransportSvc.RestHint"];
    assert.ok(op, "Operation should be registered");
    assert.ok(op.rest !== false && typeof op.rest === "object");
    assert.strictEqual(op.rest.method, "post");
    assert.strictEqual(op.rest.path, "/api/tasks");
    assert.ok(op.rest.responses);
    assert.strictEqual(op.rest.responses["200"].description, "Success");
  }

  @test
  async registerOperationWithRestFalse() {
    registerOperation("TransportSvc.NoRest", {
      service: "TransportSvc",
      method: "doSomething",
      input: "void",
      output: "void",
      rest: false
    });

    const ops = listOperations();
    const op = ops["TransportSvc.NoRest"];
    assert.ok(op, "Operation should be registered");
    assert.strictEqual(op.rest, false);
  }

  @test
  async registerOperationWithGrpcHints() {
    registerOperation("TransportSvc.GrpcHint", {
      service: "TransportSvc",
      method: "doSomething",
      input: "void",
      output: "void",
      grpc: { streaming: "bidi" }
    });

    const ops = listOperations();
    const op = ops["TransportSvc.GrpcHint"];
    assert.ok(op);
    assert.ok(op.grpc !== false && typeof op.grpc === "object");
    assert.strictEqual(op.grpc.streaming, "bidi");
  }

  @test
  async registerOperationWithGraphQLHints() {
    registerOperation("TransportSvc.GqlHint", {
      service: "TransportSvc",
      method: "doSomething",
      input: "void",
      output: "void",
      graphql: {
        query: "getTasks",
        mutation: "createTask",
        subscription: "onTaskCreated"
      }
    });

    const ops = listOperations();
    const op = ops["TransportSvc.GqlHint"];
    assert.ok(op);
    assert.ok(op.graphql !== false && typeof op.graphql === "object");
    assert.strictEqual(op.graphql.query, "getTasks");
    assert.strictEqual(op.graphql.mutation, "createTask");
    assert.strictEqual(op.graphql.subscription, "onTaskCreated");
  }

  @test
  async registerOperationWithAllTransportHints() {
    registerOperation("TransportSvc.AllHints", {
      service: "TransportSvc",
      method: "doSomething",
      input: "void",
      output: "void",
      summary: "Full operation",
      description: "An operation with all transport hints",
      tags: ["complete"],
      deprecated: false,
      hidden: false,
      rest: { method: "put", path: "/tasks/{id}" },
      grpc: { streaming: "server" },
      graphql: { mutation: "updateTask" }
    });

    const ops = listOperations();
    const op = ops["TransportSvc.AllHints"];
    assert.ok(op);
    assert.strictEqual(op.summary, "Full operation");
    assert.strictEqual(op.description, "An operation with all transport hints");
    assert.deepStrictEqual(op.tags, ["complete"]);
    assert.strictEqual(op.deprecated, false);
    assert.strictEqual(op.hidden, false);
    // REST
    assert.ok(op.rest !== false && typeof op.rest === "object");
    assert.strictEqual(op.rest.method, "put");
    assert.strictEqual(op.rest.path, "/tasks/{id}");
    // gRPC
    assert.ok(op.grpc !== false && typeof op.grpc === "object");
    assert.strictEqual(op.grpc.streaming, "server");
    // GraphQL
    assert.ok(op.graphql !== false && typeof op.graphql === "object");
    assert.strictEqual(op.graphql.mutation, "updateTask");
  }

  @test
  async registerOperationWithExtensions() {
    // The extensions field allows future transport hints
    registerOperation("TransportSvc.CustomTransport", {
      service: "TransportSvc",
      method: "doSomething",
      input: "void",
      output: "void",
      extensions: { websocket: { event: "taskUpdate" } }
    });

    const ops = listOperations();
    const op = ops["TransportSvc.CustomTransport"];
    assert.ok(op);
    assert.deepStrictEqual(op.extensions, { websocket: { event: "taskUpdate" } });
  }

  @test
  async decoratorWithRestTransportHints() {
    const metadata = TransportHintService[Symbol.metadata];
    assert.ok(metadata);
    const ops = metadata["webda.operations"] as any[];
    assert.ok(Array.isArray(ops));

    // Check REST operation
    const restOp = ops.find((o: any) => o.id === "RestOp");
    assert.ok(restOp, "RestOp should be registered in metadata");
    assert.strictEqual(restOp.summary, "REST operation");
    assert.ok(restOp.rest);
    assert.strictEqual(restOp.rest.method, "post");
    assert.strictEqual(restOp.rest.path, "/tasks");
  }

  @test
  async decoratorWithGrpcTransportHints() {
    const metadata = TransportHintService[Symbol.metadata];
    const ops = metadata["webda.operations"] as any[];

    const grpcOp = ops.find((o: any) => o.id === "GrpcOp");
    assert.ok(grpcOp, "GrpcOp should be registered in metadata");
    assert.ok(grpcOp.grpc);
    assert.strictEqual(grpcOp.grpc.streaming, "server");
  }

  @test
  async decoratorWithGraphQLTransportHints() {
    const metadata = TransportHintService[Symbol.metadata];
    const ops = metadata["webda.operations"] as any[];

    const gqlOp = ops.find((o: any) => o.id === "GraphQLOp");
    assert.ok(gqlOp, "GraphQLOp should be registered in metadata");
    assert.ok(gqlOp.graphql);
    assert.strictEqual(gqlOp.graphql.query, "getTasks");
  }

  @test
  async decoratorWithMultipleTransportHints() {
    const metadata = TransportHintService[Symbol.metadata];
    const ops = metadata["webda.operations"] as any[];

    const multiOp = ops.find((o: any) => o.id === "MultiTransportOp");
    assert.ok(multiOp, "MultiTransportOp should be registered in metadata");
    assert.strictEqual(multiOp.summary, "Multi-transport");
    assert.strictEqual(multiOp.description, "Supports REST and gRPC");
    assert.deepStrictEqual(multiOp.tags, ["tasks", "multi"]);
    assert.strictEqual(multiOp.deprecated, true);
    assert.ok(multiOp.rest);
    assert.strictEqual(multiOp.rest.method, "get");
    assert.ok(multiOp.grpc);
    assert.strictEqual(multiOp.grpc.streaming, "bidi");
  }

  @test
  async decoratorWithHiddenAndRestFalse() {
    const metadata = TransportHintService[Symbol.metadata];
    const ops = metadata["webda.operations"] as any[];

    const hiddenOp = ops.find((o: any) => o.id === "HiddenOp");
    assert.ok(hiddenOp, "HiddenOp should be registered in metadata");
    assert.strictEqual(hiddenOp.hidden, true);
    assert.strictEqual(hiddenOp.rest, false);
  }

  @test
  async metadataFieldsPreservedInListOperations() {
    // Register with metadata, then check that listOperations preserves them
    // but still strips service/method
    registerOperation("TransportSvc.PreservedMeta", {
      service: "TransportSvc",
      method: "doSomething",
      input: "void",
      output: "void",
      summary: "Preserved",
      tags: ["test"],
      rest: { method: "get", path: "/preserved" }
    });

    const ops = listOperations();
    const op = ops["TransportSvc.PreservedMeta"];
    assert.ok(op);
    // Metadata preserved
    assert.strictEqual(op.summary, "Preserved");
    assert.deepStrictEqual(op.tags, ["test"]);
    assert.ok(op.rest !== false && typeof op.rest === "object");
    assert.strictEqual(op.rest.path, "/preserved");
    // Internal fields stripped
    assert.strictEqual(op["service"], undefined);
    assert.strictEqual(op["method"], undefined);
  }

  @test
  async operationDefinitionTypeCheck() {
    // Type-level test: ensure OperationDefinition includes all expected fields
    const def: OperationDefinition = {
      id: "Test.TypeCheck",
      method: "test",
      service: "svc",
      input: "void",
      output: "void",
      summary: "sum",
      description: "desc",
      tags: ["a"],
      deprecated: true,
      hidden: false,
      rest: { method: "get", path: "/test" },
      grpc: { streaming: "none" },
      graphql: { query: "testQuery" }
    };
    assert.strictEqual(def.id, "Test.TypeCheck");
    assert.strictEqual(def.summary, "sum");
    assert.strictEqual(def.description, "desc");
    assert.deepStrictEqual(def.tags, ["a"]);
    assert.strictEqual(def.deprecated, true);
    assert.strictEqual(def.hidden, false);
    assert.ok(def.rest !== false && typeof def.rest === "object");
    assert.strictEqual(def.rest.method, "get");
    assert.ok(def.grpc !== false && typeof def.grpc === "object");
    assert.strictEqual(def.grpc.streaming, "none");
    assert.ok(def.graphql !== false && typeof def.graphql === "object");
    assert.strictEqual(def.graphql.query, "testQuery");
  }
}

/**
 * Service with typed methods (not taking context) for testing the new callOperation behavior
 */
class ReturnValueService extends Service {
  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  /**
   * Return a string value
   */
  async getString(): Promise<string> {
    return "hello world";
  }

  /**
   * Return an object value
   */
  async getObject(): Promise<{ name: string; count: number }> {
    return { name: "test", count: 42 };
  }

  /**
   * Return void (no value)
   */
  async doNothing(): Promise<void> {
    // intentionally empty
  }

  /**
   * Return an AsyncGenerator that yields chunks
   */
  async *streamChunks(): AsyncGenerator<string> {
    yield "chunk1";
    yield "chunk2";
    yield "chunk3";
  }

  /**
   * Takes typed parameters (name, age) - not a context
   */
  async greet(name: string, age: number): Promise<string> {
    return `Hello ${name}, you are ${age} years old`;
  }

  /**
   * Takes a single typed parameter
   */
  async echo(message: string): Promise<string> {
    return `echo: ${message}`;
  }

  /**
   * Method that throws
   */
  async throwError(): Promise<string> {
    throw new Error("intentional error");
  }
}

@suite
class CallOperationReturnValueTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {
        ReturnSvc: {
          type: "ReturnValueService"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/ReturnValueService", ReturnValueService);
  }

  @test
  async callOperationReturnsString() {
    registerOperation("ReturnSvc.GetString", {
      service: "ReturnSvc",
      method: "getString",
      input: "void",
      output: "void"
    });
    const ctx = new FakeOpContext();
    await ctx.init();
    await callOperation(ctx, "ReturnSvc.GetString");
    assert.strictEqual(ctx.getOutput(), "hello world");
  }

  @test
  async callOperationReturnsObject() {
    registerOperation("ReturnSvc.GetObject", {
      service: "ReturnSvc",
      method: "getObject",
      input: "void",
      output: "void"
    });
    const ctx = new FakeOpContext();
    await ctx.init();
    await callOperation(ctx, "ReturnSvc.GetObject");
    const output = ctx.getOutput();
    assert.ok(output);
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed.name, "test");
    assert.strictEqual(parsed.count, 42);
  }

  @test
  async callOperationReturnsVoid() {
    registerOperation("ReturnSvc.DoNothing", {
      service: "ReturnSvc",
      method: "doNothing",
      input: "void",
      output: "void"
    });
    const ctx = new FakeOpContext();
    await ctx.init();
    await callOperation(ctx, "ReturnSvc.DoNothing");
    // No output should be written for void
    const output = ctx.getOutput();
    assert.strictEqual(output, undefined);
  }

  @test
  async callOperationStreamsAsyncGenerator() {
    registerOperation("ReturnSvc.StreamChunks", {
      service: "ReturnSvc",
      method: "streamChunks",
      input: "void",
      output: "void"
    });
    const ctx = new FakeOpContext();
    await ctx.init();
    await callOperation(ctx, "ReturnSvc.StreamChunks");
    const output = ctx.getOutput();
    // Each chunk is written as a string, concatenated
    assert.strictEqual(output, "chunk1chunk2chunk3");
  }

  @test
  async callOperationWithSchemaArgs() {
    // Register a schema with two properties for greet(name, age)
    const greetSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" }
      },
      required: ["name", "age"]
    };
    const app = useApplication<Application>();
    app.getSchemas()["ReturnSvc.Greet"] = greetSchema;
    registerSchema("ReturnSvc.Greet", greetSchema);

    registerOperation("ReturnSvc.Greet", {
      service: "ReturnSvc",
      method: "greet",
      input: "ReturnSvc.Greet",
      output: "void"
    });

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setInput(JSON.stringify({ name: "Alice", age: 30 }));
    await callOperation(ctx, "ReturnSvc.Greet");
    assert.strictEqual(ctx.getOutput(), "Hello Alice, you are 30 years old");
  }

  @test
  async callOperationWithSingleSchemaArg() {
    // Register a schema with one property for echo(message)
    const echoSchema = {
      type: "object",
      properties: {
        message: { type: "string" }
      },
      required: ["message"]
    };
    const app = useApplication<Application>();
    app.getSchemas()["ReturnSvc.Echo"] = echoSchema;
    registerSchema("ReturnSvc.Echo", echoSchema);

    registerOperation("ReturnSvc.Echo", {
      service: "ReturnSvc",
      method: "echo",
      input: "ReturnSvc.Echo",
      output: "void"
    });

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setInput(JSON.stringify({ message: "test123" }));
    await callOperation(ctx, "ReturnSvc.Echo");
    assert.strictEqual(ctx.getOutput(), "echo: test123");
  }

  @test
  async callOperationThrowsError() {
    registerOperation("ReturnSvc.ThrowError", {
      service: "ReturnSvc",
      method: "throwError",
      input: "void",
      output: "void"
    });
    const ctx = new FakeOpContext();
    await ctx.init();
    await assert.rejects(() => callOperation(ctx, "ReturnSvc.ThrowError"), /intentional error/);
  }

  @test
  async callOperationWithInputNoSchema() {
    // When there is no input schema but context has input, pass as single arg
    registerOperation("ReturnSvc.EchoNoSchema", {
      service: "ReturnSvc",
      method: "echo",
      input: "void",
      output: "void"
    });
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setInput(JSON.stringify("directString"));
    await callOperation(ctx, "ReturnSvc.EchoNoSchema");
    assert.strictEqual(ctx.getOutput(), "echo: directString");
  }
}

@suite
class ResolveArgumentsTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {
        ArgSvc: {
          type: "ReturnValueService"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/ReturnValueService", ReturnValueService);
  }

  @test
  async resolveArgsNoSchemaNoInput() {
    const ctx = new FakeOpContext();
    await ctx.init();
    const args = await resolveArguments(ctx, { id: "Test.Op", method: "test", input: "void", output: "void" });
    assert.deepStrictEqual(args, []);
  }

  @test
  async resolveArgsNoSchemaWithInput() {
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setInput(JSON.stringify({ key: "value" }));
    const args = await resolveArguments(ctx, { id: "Test.Op", method: "test", input: "void", output: "void" });
    assert.deepStrictEqual(args, [{ key: "value" }]);
  }

  @test
  async resolveArgsNoSchemaWithParams() {
    // Without an input schema, params alone are not passed as arguments
    // (they are only merged when a schema defines the expected properties)
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid: "abc123" });
    const args = await resolveArguments(ctx, { id: "Test.Op", method: "test", input: "void", output: "void" });
    // No input schema and no body input, so no args
    assert.deepStrictEqual(args, []);
  }

  @test
  async resolveArgsWithMultiPropertySchema() {
    const app = useApplication<Application>();
    app.getSchemas()["Test.MultiProp"] = {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        age: { type: "number" }
      }
    };

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setInput(JSON.stringify({ firstName: "John", lastName: "Doe", age: 25 }));
    const args = await resolveArguments(ctx, { id: "Test.Op", method: "test", input: "Test.MultiProp", output: "void" });
    // Should return values in schema property order
    assert.deepStrictEqual(args, ["John", "Doe", 25]);
  }

  @test
  async resolveArgsSinglePropertySchema() {
    const app = useApplication<Application>();
    app.getSchemas()["Test.SingleProp"] = {
      type: "object",
      properties: {
        data: { type: "object" }
      }
    };

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setInput(JSON.stringify({ data: { nested: true } }));
    const args = await resolveArguments(ctx, { id: "Test.Op", method: "test", input: "Test.SingleProp", output: "void" });
    // Single property: extract the value directly
    assert.deepStrictEqual(args, [{ nested: true }]);
  }

  @test
  async resolveArgsMergesParamsAndInput() {
    const app = useApplication<Application>();
    app.getSchemas()["Test.Merge"] = {
      type: "object",
      properties: {
        uuid: { type: "string" },
        name: { type: "string" }
      }
    };

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid: "abc" });
    ctx.setInput(JSON.stringify({ name: "Alice" }));
    const args = await resolveArguments(ctx, { id: "Test.Op", method: "test", input: "Test.Merge", output: "void" });
    // Should merge params and input, in schema property order
    assert.deepStrictEqual(args, ["abc", "Alice"]);
  }

  @test
  async resolveArgsInputOverridesParams() {
    const app = useApplication<Application>();
    app.getSchemas()["Test.Override"] = {
      type: "object",
      properties: {
        name: { type: "string" },
        value: { type: "number" }
      }
    };

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ name: "fromParams", value: 1 });
    ctx.setInput(JSON.stringify({ name: "fromBody" }));
    const args = await resolveArguments(ctx, { id: "Test.Op", method: "test", input: "Test.Override", output: "void" });
    // Body overrides params for "name", params supplies "value"
    assert.deepStrictEqual(args, ["fromBody", 1]);
  }

  @test
  async resolveArgsSchemaWithNoProperties() {
    const app = useApplication<Application>();
    app.getSchemas()["Test.Empty"] = {
      type: "object"
      // No properties
    };

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setInput(JSON.stringify({ foo: "bar" }));
    const args = await resolveArguments(ctx, { id: "Test.Op", method: "test", input: "Test.Empty", output: "void" });
    // Falls through to the no-schema path since schema has no properties
    assert.deepStrictEqual(args, [{ foo: "bar" }]);
  }

  @test
  async resolveArgsSchemaNotFound() {
    // Schema reference that doesn't exist in the application
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setInput(JSON.stringify({ key: "value" }));
    const args = await resolveArguments(ctx, {
      id: "Test.Op",
      method: "test",
      input: "NonExistent.Schema",
      output: "void"
    });
    // When schema not found, getSchema returns undefined, falls to no-schema path
    assert.deepStrictEqual(args, [{ key: "value" }]);
  }

  @test
  async resolveArgsInputSchemaFromParams() {
    // When input schema is defined and params carry the values (e.g., from REST path params),
    // extract args by schema property names from merged params + body
    const app = useApplication<Application>();
    app.getSchemas()["Test.ParamsOnly"] = {
      type: "object",
      properties: {
        uuid: { type: "string" }
      }
    };

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid: "my-uuid-123" });
    const args = await resolveArguments(ctx, {
      id: "Test.Op",
      method: "test",
      input: "Test.ParamsOnly",
      output: "void"
    });
    assert.deepStrictEqual(args, ["my-uuid-123"]);
  }

  @test
  async resolveArgsInputSchemaMultiplePropsFromParams() {
    // Input schema with multiple properties, values from params
    const app = useApplication<Application>();
    app.getSchemas()["Test.ParamsOnlyMulti"] = {
      type: "object",
      properties: {
        uuid: { type: "string" },
        index: { type: "number" }
      }
    };

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid: "abc", index: 3 });
    const args = await resolveArguments(ctx, {
      id: "Test.Op",
      method: "test",
      input: "Test.ParamsOnlyMulti",
      output: "void"
    });
    assert.deepStrictEqual(args, ["abc", 3]);
  }

  @test
  async resolveArgsInputSchemaNotResolvable() {
    // When input schema is not resolvable, fall through to no-schema path
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid: "fallback-uuid" });
    ctx.setInput(JSON.stringify({ name: "fallback" }));
    const args = await resolveArguments(ctx, {
      id: "Test.Op",
      method: "test",
      input: "NonExistent.Input",
      output: "void"
    });
    // Falls through to no-schema path — input is returned as single arg
    assert.deepStrictEqual(args, [{ name: "fallback" }]);
  }

  @test
  async resolveArgsSinglePropertySchemaKeyPresent() {
    // Single property schema where the key matches merged data
    const app = useApplication<Application>();
    app.getSchemas()["Test.SingleWhole"] = {
      type: "object",
      properties: {
        body: { type: "object" }
      }
    };

    const ctx = new FakeOpContext();
    await ctx.init();
    // Input has the expected "body" key
    ctx.setInput(JSON.stringify({ body: { nested: true } }));
    const args = await resolveArguments(ctx, {
      id: "Test.Op",
      method: "test",
      input: "Test.SingleWhole",
      output: "void"
    });
    // Extracts the "body" property from merged
    assert.deepStrictEqual(args, [{ nested: true }]);
  }
}

/**
 * Service that records the uuid used to call a model instance method
 */
class ModelInstanceService extends Service {
  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  async doSomething(_ctx: OperationContext) {
    // no-op
  }
}

@suite
class CallOperationModelPathTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    core.getBeans = () => {};
    core.registerBeans = () => {};
    return core;
  }

  @test
  async callOperationNoServiceOrModel() {
    // An operation with neither service nor model should throw
    const { useInstanceStorage: getStorage } = await import("../core/instancestorage.js");
    const storage = getStorage();
    storage.operations["Fake.NoTarget"] = {
      id: "Fake.NoTarget",
      method: "doSomething",
      input: "void",
      output: "void"
    } as any;

    const ctx = new FakeOpContext();
    await ctx.init();
    await assert.rejects(() => callOperation(ctx, "Fake.NoTarget"), /NoServiceOrModel/);
    // Clean up
    delete storage.operations["Fake.NoTarget"];
  }

  @test
  async registerOperationWithModel() {
    // Register an operation with model= instead of service=
    // Brand has static query method from the mixin
    registerOperation("Brand.StaticQuery", {
      model: "Brand",
      method: "query",
      input: "void",
      output: "void"
    });
    const ops = listOperations();
    assert.ok(ops["Brand.StaticQuery"]);
    // listOperations strips service and method, but model is preserved
    assert.strictEqual(ops["Brand.StaticQuery"]["method"], undefined);
    assert.strictEqual(ops["Brand.StaticQuery"]["service"], undefined);
  }

  @test
  async registerOperationWithModelBadMethod() {
    // Model exists but method doesn't
    assert.throws(
      () =>
        registerOperation("Brand.BadMethod", {
          model: "Brand",
          method: "nonExistentMethod",
          input: "void",
          output: "void"
        }),
      /method nonExistentMethod not found/
    );
  }

  @test
  async callOperationModelStaticMethod() {
    // Test the static model method path in callOperation (lines 200-204)
    // Register a model-based operation calling a static method
    const { useInstanceStorage: getStorage } = await import("../core/instancestorage.js");
    const { MemoryRepository, registerRepository } = await import("@webda/models");
    const { useModel } = await import("../application/hooks.js");

    const Brand = useModel("Brand");
    const repo = new MemoryRepository(Brand, ["uuid"]);
    registerRepository(Brand, repo);

    // Manually insert the operation as model-based with static=true (or not false)
    getStorage().operations["Brand.StaticQueryOp"] = {
      id: "Brand.StaticQueryOp",
      model: "Brand",
      method: "query",
      input: "searchRequest",
      output: "void"
    } as any;

    try {
      const ctx = new FakeOpContext();
      await ctx.init();
      ctx.setParameters({ query: "" });
      await callOperation(ctx, "Brand.StaticQueryOp");
      const output = ctx.getOutput();
      assert.ok(output, "Static model method should produce output");
    } finally {
      delete getStorage().operations["Brand.StaticQueryOp"];
    }
  }

  @test
  async callOperationModelInstanceMethod() {
    // Test the instance model method path in callOperation (lines 188-198)
    const { useInstanceStorage: getStorage } = await import("../core/instancestorage.js");
    const { MemoryRepository, registerRepository } = await import("@webda/models");
    const { useModel } = await import("../application/hooks.js");

    const Brand = useModel("Brand");
    const repo = new MemoryRepository(Brand, ["uuid"]);
    registerRepository(Brand, repo);

    const uuid = "instance-method-test";
    await Brand.create({ uuid, name: "TestBrand" } as any);

    // Register a model-based instance operation (static=false)
    // Use "delete" which is an instance method
    getStorage().operations["Brand.InstanceDelete"] = {
      id: "Brand.InstanceDelete",
      model: "Brand",
      method: "delete",
      static: false,
      input: "uuidRequest",
      output: "void"
    } as any;

    try {
      const ctx = new FakeOpContext();
      await ctx.init();
      ctx.setParameters({ uuid });
      await callOperation(ctx, "Brand.InstanceDelete");
      // Verify the object was deleted
      let found = false;
      try {
        const obj = await repo.get(uuid);
        found = obj !== undefined && !obj.isDeleted();
      } catch {
        // Not found means deleted
      }
      assert.ok(!found, "Object should be deleted after instance method call");
    } finally {
      delete getStorage().operations["Brand.InstanceDelete"];
    }
  }

  @test
  async callOperationModelInstanceNotFound() {
    // Test the instance model method path when object not found (lines 194-196)
    const { useInstanceStorage: getStorage } = await import("../core/instancestorage.js");
    const { MemoryRepository, registerRepository } = await import("@webda/models");
    const { useModel } = await import("../application/hooks.js");

    const Brand = useModel("Brand");
    const repo = new MemoryRepository(Brand, ["uuid"]);
    registerRepository(Brand, repo);

    getStorage().operations["Brand.InstanceGetMissing"] = {
      id: "Brand.InstanceGetMissing",
      model: "Brand",
      method: "delete",
      static: false,
      input: "uuidRequest",
      output: "void"
    } as any;

    try {
      const ctx = new FakeOpContext();
      await ctx.init();
      ctx.setParameters({ uuid: "nonexistent" });
      await assert.rejects(() => callOperation(ctx, "Brand.InstanceGetMissing"), /not found|Not found/i);
    } finally {
      delete getStorage().operations["Brand.InstanceGetMissing"];
    }
  }

  @test
  async callOperationModelInstanceDeleted() {
    // Test the instance model path when object exists but isDeleted() returns true (line 195)
    const { useInstanceStorage: getStorage } = await import("../core/instancestorage.js");
    const { MemoryRepository, registerRepository } = await import("@webda/models");
    const { useModel } = await import("../application/hooks.js");

    const Brand = useModel("Brand");
    const repo = new MemoryRepository(Brand, ["uuid"]);
    registerRepository(Brand, repo);

    const uuid = "deleted-instance-test";
    const obj = await Brand.create({ uuid, name: "WillBeDeleted" } as any);
    // Soft-delete the object so isDeleted() returns true
    await repo.delete(uuid);

    getStorage().operations["Brand.InstanceOnDeleted"] = {
      id: "Brand.InstanceOnDeleted",
      model: "Brand",
      method: "delete",
      static: false,
      input: "uuidRequest",
      output: "void"
    } as any;

    try {
      const ctx = new FakeOpContext();
      await ctx.init();
      ctx.setParameters({ uuid });
      await assert.rejects(() => callOperation(ctx, "Brand.InstanceOnDeleted"), /not found|Not found/i);
    } finally {
      delete getStorage().operations["Brand.InstanceOnDeleted"];
    }
  }

  @test
  async callOperationInputValidationError() {
    // Test the input validation error path
    const { useInstanceStorage: getStorage } = await import("../core/instancestorage.js");

    // Register a schema that requires specific input fields
    registerSchema("strict.input.schema", {
      type: "object",
      properties: {
        uuid: { type: "string", minLength: 1 }
      },
      required: ["uuid"]
    });

    getStorage().operations["Brand.StrictInput"] = {
      id: "Brand.StrictInput",
      model: "Brand",
      method: "query",
      input: "strict.input.schema",
      output: "void"
    } as any;

    try {
      const ctx = new FakeOpContext();
      await ctx.init();
      // Provide empty input - should fail validation
      ctx.setInput(JSON.stringify({}));
      await assert.rejects(
        () => callOperation(ctx, "Brand.StrictInput"),
        (err: any) => err.message.includes("InvalidInput")
      );
    } finally {
      delete getStorage().operations["Brand.StrictInput"];
    }
  }
}
