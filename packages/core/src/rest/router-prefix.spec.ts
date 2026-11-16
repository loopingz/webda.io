import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { useApplication } from "../application/hooks.js";
import { JSONUtils } from "@webda/utils";
import { RouteInfo, Router, RouterParameters } from "./router.service.js";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { runWithContext } from "../contexts/execution.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";

/**
 * Router must match routes on the uri relative to the HttpContext prefix
 * (e.g. an API Gateway stage) instead of the full uri
 */
@suite
class RouterPrefixTest extends WebdaApplicationTest {
  router: Router;

  getTestConfiguration(): any {
    return { parameters: { ignoreBeans: true } };
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    this.router = new Router("Router", new RouterParameters().load({}));
    this.registerService(this.router);
    this.router.resolve();
    await this.router.init();
    this.router.addRouteToRouter("/test/{uuid}", {
      methods: ["GET"],
      _method: async (ctx: WebContext) => ctx.write({ uuid: ctx.getParameters().uuid })
    } as any);
    return core;
  }

  /**
   * Execute a request through the router
   * @param method - the HTTP method
   * @param uri - the full request uri
   * @param prefix - the prefix to set on the http context
   * @returns the web context after execution
   */
  async request(method: HttpMethodType, uri: string, prefix?: string): Promise<WebContext> {
    const httpContext = new HttpContext("test.webda.io", method, uri, "https", 443, {});
    if (prefix) {
      httpContext.setPrefix(prefix);
    }
    const ctx = new WebContext(httpContext);
    ctx.newSession();
    await runWithContext(ctx, () => this.router.execute(ctx));
    return ctx;
  }

  @test
  async exportOpenAPILeavesTheApplicationSchemasIntact() {
    // OpenAPI moves definitions to components on its own copy: the application schema keeps them, or the
    // validation of a model with a nested type fails afterwards (can't resolve #/definitions/...)
    const app = useApplication();
    const model = Object.keys(app.getModels())[0];
    app.getSchemas()[model] = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { scene: { $ref: "#/definitions/scene" } },
      definitions: { scene: { type: "object" } }
    } as any;
    // A router without routes: this suite's routes have no executor for completeOpenAPI
    new Router("OpenAPIRouter", new RouterParameters().load({})).exportOpenAPI();
    const schema: any = app.getSchema(model);
    assert.deepStrictEqual(Object.keys(schema.definitions || {}), ["scene"]);
    assert.strictEqual(schema.$schema, "http://json-schema.org/draft-07/schema#");
  }

  @test
  async exportOpenAPIAcceptsJsoncSchemas() {
    // An application loaded from webda.config.jsonc holds its cachedModules as JSONC proxies, which
    // structuredClone rejects ("#<Object> could not be cloned")
    const app = useApplication();
    const model = Object.keys(app.getModels())[0];
    app.getSchemas()[model] = JSONUtils.parse(`{
      // a comment keeps the JSONC tree
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": { "scene": { "$ref": "#/definitions/scene" } },
      "definitions": { "scene": { "type": "object" } }
    }`);
    const openapi: any = new Router("OpenAPIRouter", new RouterParameters().load({})).exportOpenAPI();
    assert.deepStrictEqual(openapi.components.schemas.scene, { type: "object" });
    const schema: any = app.getSchema(model);
    assert.deepStrictEqual(Object.keys(schema.definitions || {}), ["scene"]);
  }

  @test
  async httpHelperWaitsForTheResponse() {
    this.router.addRouteToRouter("/slow/{uuid}", {
      methods: ["GET"],
      _method: async (ctx: WebContext) => {
        await new Promise(resolve => setTimeout(resolve, 20));
        ctx.write({ slow: ctx.getParameters().uuid });
      }
    } as any);
    const ctx = await this.newContext();
    // The test helper must await the router: the handler only writes after a delay
    assert.deepStrictEqual(await this.http({ url: "/slow/plop", context: ctx }), { slow: "plop" });
  }

  @test
  async routesWithoutPrefix() {
    const ctx = await this.request("GET", "/test/plop");
    assert.notStrictEqual(ctx.statusCode, 404);
    assert.deepStrictEqual(JSON.parse(<string>ctx.getResponseBody()), { uuid: "plop" });
  }

  @test
  async routesWithPrefix() {
    const ctx = await this.request("GET", "/prod/test/plop", "/prod");
    assert.notStrictEqual(ctx.statusCode, 404);
    assert.deepStrictEqual(JSON.parse(<string>ctx.getResponseBody()), { uuid: "plop" });
  }

  @test
  async routesWithPrefixAndQuery() {
    const ctx = await this.request("GET", "/prod/test/plop?x=1", "/prod/");
    assert.notStrictEqual(ctx.statusCode, 404);
    assert.deepStrictEqual(JSON.parse(<string>ctx.getResponseBody()), { uuid: "plop" });
  }

  @test
  async notFoundWithPrefix() {
    const ctx = await this.request("GET", "/prod/nothing", "/prod");
    assert.strictEqual(ctx.statusCode, 404);
  }

  @test
  async optionsWithPrefix() {
    const ctx = await this.request("OPTIONS", "/prod/unknown", "/prod");
    assert.strictEqual(ctx.statusCode, 404);
  }

  @test
  async overridingRouteDoesNotWarn() {
    const first: RouteInfo = { methods: ["GET"], executor: "Router" };
    const second: RouteInfo = { methods: ["GET"], executor: "Router", override: true };
    const memoryLogger = new MemoryLogger(useWorkerOutput(), "TRACE");
    this.router.getParameters().overrideWarning = true;
    try {
      this.router.addRouteToRouter("/overridden", first);
      this.router.addRouteToRouter("/overridden", second);
    } finally {
      this.router.getParameters().overrideWarning = undefined;
      memoryLogger.close();
    }
    const logs = JSON.stringify(memoryLogger.getLogs());
    assert.ok(logs.includes("Add route GET /overridden"), logs);
    assert.ok(!logs.includes("overlap with another defined route"), logs);
    // Removing a route that was never added keeps the others
    this.router.removeRoute("/overridden", { methods: ["GET"], executor: "Router" });
    this.router.removeRoute("/never-added", first);
    // The overriding route comes first
    assert.deepStrictEqual(this.router.getRoutes()["/overridden"], [second, first]);
    this.router.removeRoute("/overridden", first);
    assert.deepStrictEqual(this.router.getRoutes()["/overridden"], [second]);
    this.router.removeRoute("/overridden");
  }

  @test
  async executeRouteWithoutHandler() {
    const called: string[] = [];
    (<any>this.router).routeHandler = async (ctx: WebContext) => {
      called.push(ctx.getHttpContext().getRelativeUri());
    };
    try {
      // A handler by method name, an unknown method name, and no handler at all
      this.router.addRouteToRouter("/handler/named", <any>{
        methods: ["GET"],
        executor: "Router",
        _method: "routeHandler"
      });
      this.router.addRouteToRouter("/handler/unknown", <any>{
        methods: ["GET"],
        executor: "Router",
        _method: "notAMethod"
      });
      this.router.addRouteToRouter("/handler/none", { methods: ["GET"], executor: "Router" });
      for (const url of ["/handler/named", "/handler/unknown", "/handler/none"]) {
        const ctx = await this.request("GET", url);
        // Nothing is written when there is nothing to call: neither an error nor a 404
        assert.ok(![403, 404].includes(ctx.statusCode), `${url}: ${ctx.statusCode}`);
      }
      assert.deepStrictEqual(called, ["/handler/named"]);
    } finally {
      delete (<any>this.router).routeHandler;
      ["/handler/named", "/handler/unknown", "/handler/none"].forEach(url => this.router.removeRoute(url));
    }
  }

  @test
  exportOpenAPIPackageInformation() {
    // A router with its own routes: this suite's routes have no executor for completeOpenAPI
    const router = new Router("OpenAPIRouter", new RouterParameters().load({}));
    const app = useApplication();
    const description = this.stub(app, "getPackageDescription");
    // Author and license as objects
    description.returns(<any>{
      version: "1.2.3",
      author: { name: "Webda", email: "dev@webda.io" },
      license: { name: "LGPL-3.0-only", url: "https://webda.io/license" }
    });
    let info = router.exportOpenAPI().info;
    assert.strictEqual(info.version, "1.2.3");
    assert.deepStrictEqual(info.contact, { name: "Webda", email: "dev@webda.io" });
    assert.deepStrictEqual(info.license, { name: "LGPL-3.0-only", url: "https://webda.io/license" });
    // Nothing declared in the package
    description.returns(<any>{});
    // A model class without name is named after its identifier, a route can have lost its openapi definition
    const models = app.getModels();
    this.stub(app, "getModels").returns({ ...models, "WebdaTest/Anonymous": <any>[class {}][0] });
    const route: RouteInfo = { methods: ["GET"], executor: "Router" };
    router.addRouteToRouter("/openapi/undocumented", route);
    delete route.openapi;
    const openapi = router.exportOpenAPI(false);
    info = openapi.info;
    assert.strictEqual(info.version, "0.0.0");
    assert.strictEqual(info.contact, undefined);
    assert.strictEqual(info.license, undefined);
    assert.deepStrictEqual(openapi.components.schemas["Anonymous"], { type: "object" });
    assert.ok(openapi.paths["/openapi/undocumented"]?.get, JSON.stringify(Object.keys(openapi.paths)));
  }
}
