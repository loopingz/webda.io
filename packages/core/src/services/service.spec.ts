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
  useApplication,
  useRouter,
  WebdaError
} from "../index.js";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
// Updated to use barrel index from test folder
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { MemoryLogger } from "@webda/workout";

class FakeServiceParameters extends ServiceParameters {
  bean!: string;
  url!: string;
}

class FakeService<T extends FakeServiceParameters = FakeServiceParameters> extends Service<T> {
  @Inject("Authentication2", true)
  serv!: Service;
  @Inject("bean", "Authentication", true)
  serv2!: Service;
  @Inject("params:bean", undefined, true)
  serv3!: Service;
  @Inject("params:bean", undefined, false)
  serv4!: Service;
  static catchInjector = true;

  constructor(name: string, params: Partial<T> = {}) {
    super(name, new ServiceParameters().load(params) as T);
  }

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
  static filterParameters(params: any) {
    return params;
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
  serv!: Service;
  constructor(name: string, params: Partial<ServiceParameters> = {}) {
    super(name, new ServiceParameters().load(params));
  }
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
    return;
    await callOperation(ctx, "Plop.MyOperation");
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
    await assert.rejects(async () => service.__clean(), /Only for test purpose/);
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
  async getCapabilities() {
    // getCapabilities() returns an object by default
    const service = new FakeService("plop", { type: "FakeService" });
    const caps = service.getCapabilities();
    assert.ok(typeof caps === "object" && caps !== null);

    // Each call returns an isolated copy - mutating one doesn't affect the next
    caps["mutated"] = { extra: true };
    const caps2 = service.getCapabilities();
    assert.strictEqual(caps2["mutated"], undefined);

    // A subclass can override getCapabilities()
    class CapableService extends FakeService {
      getCapabilities() {
        const base = super.getCapabilities();
        base["request-filter"] = { version: 1 };
        return base;
      }
    }
    const capable = new CapableService("capable", { type: "FakeService" });
    const capableCaps = capable.getCapabilities();
    assert.deepStrictEqual(capableCaps["request-filter"], { version: 1 });

    // Compiled capabilities are loaded from module metadata during resolve()
    const registered = await this.registerService(new FakeService("plop2", { type: "Webda/FakeService" }));
    // Without metadata in modules, caps should be empty
    assert.deepStrictEqual(registered.getCapabilities(), {});
  }

  @test
  async loadCapabilitiesWithNoApplication() {
    // Service created outside application context
    // getCapabilities() should return empty object without error
    class StandaloneService extends Service {
      // No override
    }
    const service = new StandaloneService("standalone", {} as any);
    // loadCapabilities is called in resolve() - but without app it should not throw
    const caps = service.getCapabilities();
    assert.deepStrictEqual(caps, {});
  }

  @test
  async getCapabilitiesReturnsIsolatedCopies() {
    // Mutating one result should not affect subsequent calls
    class TestCapService extends Service {
      getCapabilities() {
        return { server: { port: 8080 } };
      }
    }
    const service = new TestCapService("test", {} as any);
    const caps1 = service.getCapabilities();
    caps1.server.port = 9999;
    caps1.newCap = {};
    const caps2 = service.getCapabilities();
    assert.strictEqual(caps2.server.port, 8080);
    assert.strictEqual(caps2.newCap, undefined);
  }

  @test
  async getCapabilitiesOverrideCanDisable() {
    class ConditionalService extends Service {
      getCapabilities() {
        const caps = super.getCapabilities();
        // Conditionally disable a capability
        delete caps["request-filter"];
        return caps;
      }
    }
    const service = new ConditionalService("conditional", {} as any);
    service["_compiledCapabilities"] = { "request-filter": {}, server: {} };
    const caps = service.getCapabilities();
    assert.strictEqual("request-filter" in caps, false);
    assert.strictEqual("server" in caps, true);
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
    const service = new FakeService("plop", {});
    const memoryLogger = new MemoryLogger(service["logger"].output);
    service.on("test", async () => {
      await new Promise(resolve => setTimeout(resolve, 140));
      throw new Error("My error");
    });
    try {
      await service.emit("test", undefined);
    } catch (err) {
      assert.strictEqual((err as Error).message, "My error");
    }
    memoryLogger.close();
    const logs = memoryLogger.getLogs().map(l => l.log);
    assert.strictEqual(logs.length, 2);
    console.log(logs);
    assert.deepStrictEqual(logs.map(l => `${l?.level}_${l?.args[1]}`).sort(), [
      "ERROR_Listener error",
      "INFO_Long listener"
    ]);
  }
}

@suite
class DiscoverFiltersTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {}
    };
  }

  @test
  async discoverFiltersRegistersRequestFilter() {
    // Create a service with request-filter capability
    class FilterService extends Service {
      getCapabilities() {
        return { "request-filter": {} };
      }

      async checkRequest(_ctx: any, _type: "AUTH"): Promise<boolean> {
        return true;
      }
    }
    const service = new FilterService("testFilter", {} as any);
    const router = useRouter();
    const initialCount = router["_requestFilters"].length;
    router.discoverFilters([service]);
    assert.strictEqual(router["_requestFilters"].length, initialCount + 1);
  }

  @test
  async discoverFiltersRegistersCORSFilter() {
    class CorsService extends Service {
      getCapabilities() {
        return { "cors-filter": {} };
      }

      async checkRequest(_ctx: any, _type: "CORS"): Promise<boolean> {
        return true;
      }
    }
    const service = new CorsService("testCors", {} as any);
    const router = useRouter();
    const initialCount = router["_requestCORSFilters"].length;
    router.discoverFilters([service]);
    assert.strictEqual(router["_requestCORSFilters"].length, initialCount + 1);
  }

  @test
  async discoverFiltersBothCapabilities() {
    class DualService extends Service {
      getCapabilities() {
        return { "request-filter": {}, "cors-filter": {} };
      }

      async checkRequest(_ctx: any, _type: "AUTH" | "CORS"): Promise<boolean> {
        return true;
      }
    }
    const service = new DualService("testDual", {} as any);
    const router = useRouter();
    const reqBefore = router["_requestFilters"].length;
    const corsBefore = router["_requestCORSFilters"].length;
    router.discoverFilters([service]);
    assert.strictEqual(router["_requestFilters"].length, reqBefore + 1);
    assert.strictEqual(router["_requestCORSFilters"].length, corsBefore + 1);
  }

  @test
  async discoverFiltersSkipsNoCapabilities() {
    class PlainService extends Service {
      getCapabilities() {
        return {};
      }
    }
    const service = new PlainService("plain", {} as any);
    const router = useRouter();
    const reqBefore = router["_requestFilters"].length;
    const corsBefore = router["_requestCORSFilters"].length;
    router.discoverFilters([service]);
    assert.strictEqual(router["_requestFilters"].length, reqBefore);
    assert.strictEqual(router["_requestCORSFilters"].length, corsBefore);
  }
}

@suite
class OpenAPICommandTest extends WebdaApplicationTest {
  @test
  async openapiToStdout() {
    const router = useRouter();
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));
    try {
      router.openapi();
    } finally {
      console.log = origLog;
    }
    assert.strictEqual(logs.length, 1);
    const doc = JSON.parse(logs[0]);
    assert.strictEqual(doc.openapi, "3.0.3");
    assert.ok(doc.paths);
    assert.ok(doc.info);
  }

  @test
  async openapiToFile() {
    const router = useRouter();
    const tmpFile = "/tmp/webda-openapi-test.json";
    try {
      router.openapi(tmpFile);
      assert.ok(existsSync(tmpFile));
      const doc = JSON.parse(readFileSync(tmpFile, "utf-8"));
      assert.strictEqual(doc.openapi, "3.0.3");
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  }

  @test
  async openapiIncludeHidden() {
    const router = useRouter();
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));
    try {
      // Default: skip hidden
      router.openapi();
      const docDefault = JSON.parse(logs[0]);

      logs.length = 0;
      // Include hidden
      router.openapi(undefined, true);
      const docWithHidden = JSON.parse(logs[0]);

      // With hidden should have at least as many paths
      assert.ok(Object.keys(docWithHidden.paths).length >= Object.keys(docDefault.paths).length);
    } finally {
      console.log = origLog;
    }
  }
}
