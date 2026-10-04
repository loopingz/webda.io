import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { Router, RouterParameters } from "./router.service.js";
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
}
