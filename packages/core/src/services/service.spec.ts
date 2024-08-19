import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as sinon from "sinon";
import { Core, Inject, Operation, Service, WebdaError } from "..";
import { TestApplication, WebdaInternalTest } from "../test";
import { OperationContext } from "../utils/context";
import { RegExpStringValidator, ServiceParameters } from "./service";

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
  public constructor(webda: Core) {
    super(webda);
  }
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
class RegExpStringValidatorTest {
  @test
  async validate() {
    let validator = new RegExpStringValidator(["test1", "regex:test[2-3]+", "regex:^itest[4-5]b$", "test[1-9]+"]);

    assert.ok(validator.validate("test1"));
    assert.ok(validator.validate("test[1-9]+"));
    assert.ok(validator.validate("test2"));
    assert.ok(validator.validate("test23"));
    assert.ok(validator.validate("itest4b"));
    assert.ok(validator.validate("itest5b"));
    // ^ should be added to the regex
    assert.ok(!validator.validate("test"));
    assert.ok(!validator.validate("stest2"));
    assert.ok(!validator.validate("test2b"));
    assert.ok(!validator.validate("test6"));
  }
}

@suite
class ServiceTest extends WebdaInternalTest {
  protected async buildWebda(): Promise<void> {
    await super.buildWebda();
    this.webda.getBeans = () => {};
  }

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
    app.addService("Webda/FakeService", FakeService);
    FakeService.catchInjector = true;
  }

  @test
  async injector() {
    FakeService.catchInjector = false;
    let service = new FakeService(this.webda, "plop");
    assert.throws(() => service.resolve(), /Injector did not found bean 'undefined'\(parameter:bean\) for 'plop'/);
    service = await this.registerService(new FakeService(this.webda, "plop", { bean: "Authentication" }));
    assert.strictEqual(service.serv, undefined);
    assert.throws(
      () => new FakeService2(this.webda, "kf").resolve(),
      /Injector did not found bean 'Authentication2' for 'kf'/
    );
  }

  @test
  async operation() {
    let ctx = new FakeOperationContext(this.webda);
    await ctx.init();
    ctx.setInput(JSON.stringify({ output: "plop" }));
    assert.rejects(() => this.webda.callOperation(ctx, "MyOperation2"));
    let service = await this.registerService(new FakeService(this.webda, "plop", { bean: "Authentication" }));
    service.initOperations();
    // @ts-ignore
    const schemaRegistry = this.webda.getApplication().baseConfiguration.cachedModules.schemas;
    schemaRegistry["plop.myoperation.input"] = {
      properties: {
        output: {
          type: "string",
          minLength: 8
        }
      },
      required: ["output"]
    };
    schemaRegistry["plop.myOperation.input"] = schemaRegistry["plop.myoperation.input"];
    this.webda["operations"]["Plop.MyOperation"].input = "plop.myoperation.input";

    await assert.rejects(() => this.webda.callOperation(ctx, "Plop.MyOperation"), WebdaError.BadRequest);
    ctx.getInput = () => undefined;
    await assert.rejects(() => this.webda.callOperation(ctx, "Plop.MyOperation"), WebdaError.BadRequest);
    ctx = new FakeOperationContext(this.webda);
    await ctx.init();
    ctx.setInput(JSON.stringify({ output: "longerOutput" }));
    await this.webda.callOperation(ctx, "Plop.MyOperation");
    await ctx.end();
    assert.strictEqual(ctx.getOutput(), "longerOutput");

    // Check the list
    assert.deepStrictEqual(this.webda.listOperations(), {
      "Plop.MyOperation": {
        id: "Plop.MyOperation",
        input: "plop.myoperation.input"
      }
    });

    // Check with permission
    // @ts-ignore
    this.webda.operations["Plop.MyOperation"].permission = "role = 'test'";
    await assert.rejects(() => this.webda.callOperation(ctx, "Plop.MyOperation"), WebdaError.Forbidden);
    await ctx.newSession();
    ctx.getSession<any>().role = "test";
    await this.webda.callOperation(ctx, "Plop.MyOperation");

    // Test input detection
    this.webda.registerOperation("Plop.MyOperation", {
      input: "plop.myOperation.input",
      service: "plop",
      method: "myOperation"
    });
    assert.deepStrictEqual(this.webda.listOperations(), {
      "Plop.MyOperation": {
        id: "Plop.MyOperation",
        input: "plop.myOperation.input"
      }
    });

    // Test input detection
    this.webda.registerOperation("Plop.MyOperation", {
      input: "plop.myOperation.input2",
      service: "plop",
      method: "myOperation"
    });
    assert.deepStrictEqual(this.webda.listOperations(), {
      "Plop.MyOperation": {
        id: "Plop.MyOperation"
      }
    });
  }

  @test
  async clean() {
    let service = new FakeService(this.webda, "plop");
    // @ts-ignore
    const origin = global.it;
    // @ts-ignore
    global.it = undefined;
    assert.rejects(() => service.__clean(), /Only for test purpose/);
    // @ts-ignore
    global.it = origin;
    await service.__clean();
  }

  @test
  toPublicJSON() {
    let service = new FakeService(this.webda, "plop", {});
    let stub = sinon.stub(this.webda, "toPublicJSON").callsFake(() => "plop");
    try {
      assert.strictEqual(service.toPublicJSON({ l: "p" }), "plop");
    } finally {
      stub.restore();
    }
  }

  @test
  toStringMethod() {
    let service = new FakeService(this.webda, "plop", { type: "FakeService" });
    assert.strictEqual(service.toString(), "FakeService[plop]");
  }

  @test
  publicEvents() {
    let service = new FakeService(this.webda, "plop", { type: "FakeService" });
    assert.deepStrictEqual(service.getClientEvents(), []);
    assert.deepStrictEqual(service.authorizeClientEvent("plop", undefined), false);
  }

  @test
  getUrl() {
    let service = new FakeService(this.webda, "plop", { type: "FakeService" });
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
    let service = new FakeService(this.webda, "plop", {});
    let logs = [];
    Core.get().log = (...args) => {
      logs.push(args);
    };
    service.on("test", async () => {
      await new Promise(resolve => setTimeout(resolve, 140));
      throw new Error("My error");
    });
    await service.emitSync("test", undefined);
    assert.strictEqual(logs.length, 2);
    assert.deepStrictEqual(
      logs.map(l => `${l[0]}_${l[1]}`),
      ["ERROR_Listener error", "INFO_Long listener"]
    );
  }
}
