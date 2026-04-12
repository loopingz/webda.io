import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  registerOperation,
  listOperations,
  callOperation,
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
      method: "doSomething"
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
          method: "doSomething"
        }),
      /OperationId lowercase must match/
    );
    assert.throws(
      () =>
        registerOperation("has-dash.Op", {
          service: "OpService",
          method: "doSomething"
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
          method: "doSomething"
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
          method: "nonExistentMethod"
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
          method: "doSomething"
        }),
      /method doSomething not found/
    );
  }

  @test
  async registerOperationWithInputSchema() {
    // Register with an input schema that doesn't exist - should be deleted
    registerOperation("OpService.WithBadInput", {
      service: "OpService",
      method: "doSomething",
      input: "nonexistent.schema"
    });
    const ops = listOperations();
    // The input should have been removed since the schema doesn't exist
    assert.strictEqual(ops["OpService.WithBadInput"].input, undefined);
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
      method: "doSomething"
    });
    registerOperation("OpService.Second", {
      service: "OpService",
      method: "doSomething"
    });
    const ops = listOperations();
    assert.ok(ops["OpService.First"]);
    assert.ok(ops["OpService.Second"]);
  }

  @test
  async registerOperationWithOutputSchema() {
    // Register with an output schema that doesn't exist - should be deleted
    registerOperation("OpService.WithBadOutput", {
      service: "OpService",
      method: "doSomething",
      output: "nonexistent.output.schema"
    });
    const ops = listOperations();
    assert.strictEqual(ops["OpService.WithBadOutput"].output, undefined);
  }

  @test
  async registerOperationOverwrite() {
    // Register same operation ID twice - should overwrite
    registerOperation("OpService.Overwrite", {
      service: "OpService",
      method: "doSomething"
    });
    registerOperation("OpService.Overwrite", {
      service: "OpService",
      method: "doFail"
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
      method: "doSomething"
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
