import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  callOperation,
  Inject,
  listOperations,
  Operation,
  registerOperation,
  Service,
  ServiceParameters,
  setLogContext,
  setWorkerOutput,
  useApplication,
  useWorkerOutput,
  WebdaError
} from "../index";
// Updated to use barrel index from test folder
import { WebdaApplicationTest } from "../test";
import { TestApplication } from "../test/objects";
import { OperationContext } from "../contexts/operationcontext";
import { MemoryLogger, WorkerOutput } from "@webda/workout";

class FakeServiceParameters extends ServiceParameters {
  bean: string;
}

class FakeService<T extends FakeServiceParameters = FakeServiceParameters> extends Service<T> {
  @Inject("Authentication2", true)
  serv: Service;
  @Inject("bean", "Authentication", true)
  serv2: Service;
  @Inject("params:bean", undefined, true)
  serv3: Service;
  @Inject("params:bean", undefined, false)
  serv4: Service;
  static catchInjector = true;

  resolve(): this {
    try {
      super.resolve();
    } catch (err) {
      if (!FakeService.catchInjector) {
        throw err;
      }
    }
    return this;
  }

  static createConfiguration(params: any) {
    return new FakeServiceParameters().load(params);
  }

  // Set to undefined to ensure fallback on method name
  @Operation({}, { url: "/operation/plop" })
  async myOperation(ctx: OperationContext<{ output: string }>) {
    ctx.write((await ctx.getInput()).output);
  }

  @Operation({ id: "MyOperation" })
  myOperation2(ctx: OperationContext) {
    ctx.write("plop2");
  }
}

class FakeService2 extends Service {
  @Inject("Authentication2")
  serv: Service;
}

class FakeOperationContext extends OperationContext {
  input: string = "";
  setInput(input: string) {
    this.input = input;
  }

  /**
   * By default empty
   * @returns
   */
  async getRawInputAsString(
    _limit: number = 1024 * 1024 * 10,
    _timeout: number = 60000,
    _encoding?: string
  ): Promise<string> {
    return this.input;
  }

  /**
   * @override
   */
  async getRawInput(limit: number = 1024 * 1024 * 10, timeout: number = 60000): Promise<Buffer> {
    return Buffer.from(this.input);
  }
}

@suite
class ServiceTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {
        Authentication: {
          type: "FakeService"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/FakeService", FakeService);
    FakeService.catchInjector = true;
  }

  @test
  async injector() {
    FakeService.catchInjector = false;
    let service = new FakeService("plop");
    assert.throws(() => service.resolve(), /Injector did not found bean 'undefined'\(parameter:bean\) for 'plop'/);
    service = await this.registerService(new FakeService("plop", { bean: "Authentication" }));
    assert.strictEqual(service.serv, undefined);
    assert.throws(() => new FakeService2("kf").resolve(), /Injector did not found bean 'Authentication2' for 'kf'/);
  }

  @test
  async operation() {
    let ctx = new FakeOperationContext();
    await ctx.init();
    ctx.setInput(JSON.stringify({ output: "plop" }));
    assert.rejects(() => callOperation(ctx, "MyOperation2"));
    const service = await this.registerService(new FakeService("plop", { bean: "Authentication" }));
    service.initOperations();
    const schemaRegistry = useApplication()?.["baseConfiguration"].cachedModules!.schemas;
    schemaRegistry!["plop.myoperation.input"] = {
      properties: {
        output: {
          type: "string",
          minLength: 8
        }
      },
      required: ["output"]
    };
    schemaRegistry!["plop.myOperation.input"] = schemaRegistry!["plop.myoperation.input"];
    // TODO Fix this
    //this.webda["operations"]["Plop.MyOperation"].input = "plop.myoperation.input";

    await assert.rejects(() => callOperation(ctx, "Plop.MyOperation"), WebdaError.BadRequest);
    ctx.getInput = () => undefined;
    await assert.rejects(() => callOperation(ctx, "Plop.MyOperation"), WebdaError.BadRequest);
    ctx = new FakeOperationContext();
    await ctx.init();
    ctx.setInput(JSON.stringify({ output: "longerOutput" }));
    await callOperation(ctx, "Plop.MyOperation");
    await ctx.end();
    assert.strictEqual(ctx.getOutput(), "longerOutput");

    // Check the list
    assert.deepStrictEqual(listOperations(), {
      "Plop.MyOperation": {
        id: "Plop.MyOperation",
        input: "plop.myoperation.input"
      }
    });

    // Check with permission
    // @ts-ignore
    this.webda.operations["Plop.MyOperation"].permission = "role = 'test'";
    await assert.rejects(() => callOperation(ctx, "Plop.MyOperation"), WebdaError.Forbidden);
    await ctx.newSession();
    ctx.getSession<any>().role = "test";
    await callOperation(ctx, "Plop.MyOperation");

    // Test input detection
    registerOperation("Plop.MyOperation", {
      input: "plop.myOperation.input",
      service: "plop",
      method: "myOperation"
    });
    assert.deepStrictEqual(listOperations(), {
      "Plop.MyOperation": {
        id: "Plop.MyOperation",
        input: "plop.myOperation.input"
      }
    });

    // Test input detection
    registerOperation("Plop.MyOperation", {
      input: "plop.myOperation.input2",
      service: "plop",
      method: "myOperation"
    });
    assert.deepStrictEqual(listOperations(), {
      "Plop.MyOperation": {
        id: "Plop.MyOperation"
      }
    });
  }

  @test
  async clean() {
    const service = new FakeService("plop");
    // @ts-ignore
    const origin = global.it;
    // @ts-ignore
    global.it = undefined;
    await assert.rejects(() => service.__clean(), /Only for test purpose/);
    // @ts-ignore
    global.it = origin;
    await service.__clean();
  }

  @test
  toStringMethod() {
    const service = new FakeService("plop", { type: "FakeService" });
    assert.strictEqual(service.toString(), "FakeService[plop]");
  }

  @test
  publicEvents() {
    const service = new FakeService("plop", { type: "FakeService" });
    assert.deepStrictEqual(service.getClientEvents(), []);
    assert.deepStrictEqual(service.authorizeClientEvent("plop", undefined), false);
  }

  @test
  getUrl() {
    const service = new FakeService("plop", { type: "FakeService" });
    assert.strictEqual(service.getUrl("/plop", ["GET"]), "/plop");
    assert.strictEqual(service.getUrl("./plop", ["GET"]), undefined);
    assert.strictEqual(service.getUrl("plop", ["GET"]), undefined);
    service.getParameters().url = "/re";
    assert.strictEqual(service.getUrl("./plop", ["GET"]), "/re/plop");
    assert.strictEqual(service.getUrl("plop", ["GET"]), "plop");
    service.getParameters().url = "/";
    assert.strictEqual(service.getUrl("./plop", ["GET"]), "/plop");
    assert.strictEqual(service.getUrl("plop", ["GET"]), "plop");
    assert.strictEqual(service.getUrl(".", ["GET"]), "/");
  }
  /**
   * Ensure a message is displayed if listener is long
   * Ensure error in listener are catched
   */
  @test
  async longListener() {
    const workerOutput = new WorkerOutput();
    setWorkerOutput(workerOutput);
    const service = new FakeService("plop", {});
    const memoryLogger = new MemoryLogger(workerOutput);
    setLogContext(workerOutput);
    service.on("test", async () => {
      await new Promise(resolve => setTimeout(resolve, 140));
      throw new Error("My error");
    });
    await service.emit("test", undefined);
    memoryLogger.close();
    const logs = memoryLogger.getLogs();
    assert.strictEqual(logs.length, 2);
    assert.deepStrictEqual(
      logs.map(l => `${l[0]}_${l[1]}`),
      ["ERROR_Listener error", "INFO_Long listener"]
    );
  }
}
