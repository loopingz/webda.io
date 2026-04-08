import { suite, test } from "@webda/test";
import * as assert from "assert";
import { registerOperation, listOperations, callOperation, Operation } from "../index.js";
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
