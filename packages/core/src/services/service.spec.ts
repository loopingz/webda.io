import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as sinon from "sinon";
import { Core, Inject, Operation, Service } from "..";
import { WebdaTest } from "../test";
import { OperationContext } from "../utils/context";
import { ServiceParameters } from "./service";

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

  // Set to undefined to ensure fallback on method name
  @Operation({}, { url: "/operation/plop" })
  async myOperation(ctx: OperationContext<{ output: string }>) {
    ctx.write((await ctx.getInput()).output);
  }

  @Operation({ id: "myOperation" })
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
class ServiceTest extends WebdaTest {
  @test
  async injector() {
    let service = new FakeService(this.webda, "plop");
    assert.throws(() => service.resolve(), /Injector did not found bean 'undefined'\(parameter:bean\) for 'plop'/);
    service = new FakeService(this.webda, "plop", { bean: "Authentication" });
    service.resolve();
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
    assert.rejects(() => this.webda.callOperation(ctx, "myOperation2"));
    let service = new FakeService(this.webda, "plop", {
      bean: "Authentication"
    });
    service.resolve();
    this.registerService(service);
    // @ts-ignore
    this.webda.getApplication().baseConfiguration.cachedModules.schemas["test"] = {
      properties: {
        output: {
          type: "string",
          minLength: 8
        }
      },
      required: ["output"]
    };

    await assert.rejects(() => this.webda.callOperation(ctx, "plop.myOperation"), /validation failed/);
    ctx.getInput = () => undefined;
    await assert.rejects(
      () => this.webda.callOperation(ctx, "plop.myOperation"),
      /Input does not fit the operation input/
    );
    ctx = new FakeOperationContext(this.webda);
    await ctx.init();
    ctx.setInput(JSON.stringify({ output: "longerOutput" }));
    await this.webda.callOperation(ctx, "plop.myOperation");
    await ctx.end();
    assert.strictEqual(ctx.getOutput(), "longerOutput");

    // Check the list
    assert.deepStrictEqual(this.webda.listOperations(), {
      "plop.myOperation": {
        id: "plop.myOperation",
        input: "webda/test",
        output: "webda/plop"
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
  getUrl() {
    let service = new FakeService(this.webda, "plop", { type: "FakeService" });
    assert.strictEqual(service.getUrl("/plop", ["GET"]), "/plop");
    assert.strictEqual(service.getUrl("./plop", ["GET"]), undefined);
    assert.strictEqual(service.getUrl("plop", ["GET"]), undefined);
    service.getParameters().url = "/re";
    assert.strictEqual(service.getUrl("./plop", ["GET"]), "/re/plop");
    assert.strictEqual(service.getUrl("plop", ["GET"]), "plop");
  }
  /**
   * Ensure a message is displayed if listener is long
   * Ensure error in listener are catched
   */
  @test
  async longListener() {
    let service = new FakeService(this.webda, "plop", {});
    let logs = [];
    service.log = (...args) => {
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
