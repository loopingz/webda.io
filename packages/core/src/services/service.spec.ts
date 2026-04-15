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
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";

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
        input: "plop.myoperation.input",
        output: "void"
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
      output: "void",
      service: "plop",
      method: "myOperation"
    });
    assert.deepStrictEqual(listOperations(), {
      "Plop.MyOperation": {
        id: "Plop.MyOperation",
        input: "plop.myOperation.input",
        output: "void"
      }
    });

    // Test input detection
    registerOperation("Plop.MyOperation", {
      input: "plop.myOperation.input2",
      output: "void",
      service: "plop",
      method: "myOperation"
    });
    assert.deepStrictEqual(listOperations(), {
      "Plop.MyOperation": {
        id: "Plop.MyOperation",
        input: "void",
        output: "void"
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
class RouterTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {
        TestRoute: {
          type: "RouterTestService"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/RouterTestService", RouterTestService);
  }

  @test
  async executeReturns404ForUnknownRoute() {
    const router = useRouter();
    const httpContext = new HttpContext("test.webda.io", "GET", "/nonexistent/route");
    const ctx = new WebContext(httpContext);
    await router.execute(ctx);
    assert.strictEqual(ctx.statusCode, 404);
  }

  @test
  async executeHandlesOptionsMethod() {
    const router = useRouter();
    // Register a route first
    router.addRouteToRouter("/test-options", {
      methods: ["GET"],
      executor: "TestRoute",
      _method: async (ctx) => ctx.write("ok")
    });
    // OPTIONS without CORS filter should return 404
    const httpContext = new HttpContext("test.webda.io", "OPTIONS", "/test-options");
    const ctx = new WebContext(httpContext);
    await router.execute(ctx);
    // Without any CORS filters registered, checkCORSRequest returns false from .some()
    assert.strictEqual(ctx.statusCode, 404);
  }

  @test
  async executeHandlesOptionsMethodWithCORSFilter() {
    const router = useRouter();
    router.addRouteToRouter("/test-cors-options", {
      methods: ["GET", "POST"],
      executor: "TestRoute",
      _method: async (ctx) => ctx.write("ok")
    });
    // Register a CORS filter that allows everything
    router.registerCORSFilter({
      async checkRequest(_ctx, _type) {
        return true;
      }
    });
    const httpContext = new HttpContext("test.webda.io", "OPTIONS", "/test-cors-options");
    const ctx = new WebContext(httpContext);
    await router.execute(ctx);
    assert.strictEqual(ctx.statusCode, 204);
    const allowMethods = ctx.getResponseHeaders()["Access-Control-Allow-Methods"];
    assert.ok(allowMethods);
    assert.ok(allowMethods.includes("GET"));
    assert.ok(allowMethods.includes("POST"));
  }

  @test
  async executeRunsFunctionMethod() {
    const router = useRouter();
    let called = false;
    router.addRouteToRouter("/test-func", {
      methods: ["GET"],
      executor: "TestRoute",
      _method: async (_ctx) => {
        called = true;
      }
    });
    const httpContext = new HttpContext("test.webda.io", "GET", "/test-func");
    const ctx = new WebContext(httpContext);
    await router.execute(ctx);
    assert.ok(called, "Function method should have been called");
  }

  @test
  async checkRequestWithNoFilters() {
    const router = useRouter();
    // With no request filters, checkRequest should return true
    const httpContext = new HttpContext("test.webda.io", "GET", "/");
    const ctx = new WebContext(httpContext);
    const result = await router["checkRequest"](ctx);
    assert.strictEqual(result, true);
  }

  @test
  async checkRequestWithFilterDenying() {
    const router = useRouter();
    // Register a filter that denies everything
    router.registerRequestFilter({
      async checkRequest(_ctx, _type) {
        return false;
      }
    });
    // Register a route
    router.addRouteToRouter("/test-denied", {
      methods: ["GET"],
      executor: "TestRoute",
      _method: async (ctx) => ctx.write("should not reach")
    });
    const httpContext = new HttpContext("test.webda.io", "GET", "/test-denied");
    const ctx = new WebContext(httpContext);
    await router.execute(ctx);
    // Should get 403
    assert.strictEqual(ctx.statusCode, 403);
  }

  @test
  async getRouteFromUrlExactMatch() {
    const router = useRouter();
    router.addRouteToRouter("/exact/match", {
      methods: ["GET"],
      executor: "TestRoute",
      _method: "handleExact"
    });
    const httpContext = new HttpContext("test.webda.io", "GET", "/exact/match");
    const ctx = new WebContext(httpContext);
    const route = router.getRouteFromUrl(ctx, "GET", "/exact/match");
    assert.ok(route, "Should find exact match route");
    assert.strictEqual(route._method, "handleExact");
  }

  @test
  async getRouteFromUrlNoMatch() {
    const router = useRouter();
    const httpContext = new HttpContext("test.webda.io", "GET", "/no/such/path");
    const ctx = new WebContext(httpContext);
    const route = router.getRouteFromUrl(ctx, "GET", "/no/such/path");
    assert.strictEqual(route, undefined);
  }

  @test
  async getRouteFromUrlWrongMethod() {
    const router = useRouter();
    router.addRouteToRouter("/method/test", {
      methods: ["POST"],
      executor: "TestRoute",
      _method: "handlePost"
    });
    const httpContext = new HttpContext("test.webda.io", "GET", "/method/test");
    const ctx = new WebContext(httpContext);
    const route = router.getRouteFromUrl(ctx, "GET", "/method/test");
    assert.strictEqual(route, undefined, "Should not match GET when only POST is registered");
  }

  @test
  async getRouteMethodsFromUrl() {
    const router = useRouter();
    router.addRouteToRouter("/methods/test", {
      methods: ["GET", "POST"],
      executor: "TestRoute",
      _method: "handle"
    });
    const methods = router.getRouteMethodsFromUrl("/methods/test");
    assert.ok(methods.includes("GET"));
    assert.ok(methods.includes("POST"));
  }

  @test
  async getRouteMethodsFromUrlNoMatch() {
    const router = useRouter();
    const methods = router.getRouteMethodsFromUrl("/nonexistent/methods");
    assert.strictEqual(methods.length, 0);
  }

  @test
  async addRouteToRouterDuplicate() {
    const router = useRouter();
    const routeInfo = {
      methods: ["GET"] as HttpMethodType[],
      executor: "TestRoute",
      _method: "handle"
    };
    router.addRouteToRouter("/dup/test", routeInfo);
    // Add same route info again - should not duplicate
    router.addRouteToRouter("/dup/test", routeInfo);
    const routes = router.getRoutes();
    assert.strictEqual(routes["/dup/test"].length, 1);
  }

  @test
  async removeRoute() {
    const router = useRouter();
    const routeInfo = {
      methods: ["GET"] as HttpMethodType[],
      executor: "TestRoute",
      _method: "handle"
    };
    router.addRouteToRouter("/remove/test", routeInfo);
    assert.ok(router.getRoutes()["/remove/test"]);
    router.removeRoute("/remove/test");
    assert.strictEqual(router.getRoutes()["/remove/test"], undefined);
  }

  @test
  async removeRouteSpecificInfo() {
    const router = useRouter();
    const routeInfo1 = {
      methods: ["GET"] as HttpMethodType[],
      executor: "TestRoute",
      _method: "handle1"
    };
    const routeInfo2 = {
      methods: ["POST"] as HttpMethodType[],
      executor: "TestRoute",
      _method: "handle2"
    };
    router.addRouteToRouter("/remove/specific", routeInfo1);
    router.addRouteToRouter("/remove/specific", routeInfo2);
    assert.strictEqual(router.getRoutes()["/remove/specific"].length, 2);
    router.removeRoute("/remove/specific", routeInfo1);
    assert.strictEqual(router.getRoutes()["/remove/specific"].length, 1);
  }

  @test
  async checkCORSRequestNoCorsFilters() {
    const router = useRouter();
    const httpContext = new HttpContext("test.webda.io", "GET", "/");
    const ctx = new WebContext(httpContext);
    const result = await router["checkCORSRequest"](ctx);
    assert.strictEqual(typeof result, "boolean");
  }

  @test
  async getRouteFromUrlWithUriTemplate() {
    const router = useRouter();
    router.addRouteToRouter("/items/{uuid}", {
      methods: ["GET"],
      executor: "TestRoute",
      _method: "getItem"
    });
    const httpContext = new HttpContext("test.webda.io", "GET", "/items/abc-123");
    const ctx = new WebContext(httpContext);
    const route = router.getRouteFromUrl(ctx, "GET", "/items/abc-123");
    assert.ok(route, "Should match URI template route");
    assert.strictEqual(ctx.getParameters().uuid, "abc-123");
  }

  @test
  async getRouteMethodsFromUrlWithTemplate() {
    const router = useRouter();
    router.addRouteToRouter("/res/{id}", {
      methods: ["GET", "DELETE"],
      executor: "TestRoute",
      _method: "handle"
    });
    const methods = router.getRouteMethodsFromUrl("/res/some-id");
    assert.ok(methods.includes("GET"));
    assert.ok(methods.includes("DELETE"));
  }

  @test
  async executeWithStringMethod() {
    const router = useRouter();
    router.addRouteToRouter("/test-string-method", {
      methods: ["GET"],
      executor: "TestRoute",
      _method: "getOpenApiReplacements"
    });
    const httpContext = new HttpContext("test.webda.io", "GET", "/test-string-method");
    const ctx = new WebContext(httpContext);
    // Execute should call the service method by name
    await router.execute(ctx);
    // Should not get 404 since route exists
    assert.notStrictEqual(ctx.statusCode, 404);
  }

  @test
  async getFinalUrl() {
    const router = useRouter();
    // Test @ replacement
    assert.ok(router.getFinalUrl("/test/@user").includes("%40"));
    // Test / in query string replacement
    const url = router.getFinalUrl("/test?path=/foo/bar");
    assert.ok(url.includes("%2F"));
    // Test // prefix
    assert.strictEqual(router.getFinalUrl("//double"), "/double");
  }

  @test
  async comparePath() {
    const router = useRouter();
    // Literal path should come before parameterized path
    const literal = { url: "/users/me", config: {} };
    const parameterized = { url: "/users/{id}", config: {} };
    const result = router["comparePath"](literal, parameterized);
    assert.ok(result < 0, "Literal should sort before parameterized");
  }

  @test
  async registerModelUrl() {
    const router = useRouter();
    router.registerModelUrl("TestModel", "/testmodels");
    assert.strictEqual(router.getModelUrl("TestModel"), "/testmodels");
  }
}

class RouterTestService extends Service {
  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  getOpenApiReplacements() {
    return {};
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
