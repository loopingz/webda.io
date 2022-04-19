import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "./test";
import { HttpContext } from "./utils/context";
import { RouteInfo } from "./router";

@suite
class RouterTest extends WebdaTest {
  @test
  testGetRouteMethodsFromUrl() {
    const info: RouteInfo = { methods: ["GET"], executor: "DefinedMailer" };
    this.webda.addRoute("/plop", info);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/"), ["GET", "POST"]);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["GET"]);
    this.webda.addRoute("/plop", { methods: ["POST"], executor: "DefinedMailer" });
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["POST", "GET"]);
    let call = [];
    this.webda.log = (level, ...args) => {
      call.push({ level, args });
    };
    this.webda.addRoute("/plop", { methods: ["GET"], executor: "DefinedMailer" });
    assert.deepStrictEqual(call, [
      { level: "TRACE", args: ["Add route GET /plop"] },
      { level: "WARN", args: ["GET /plop overlap with another defined route"] }
    ]);
    // Should be skipped
    this.webda.addRoute("/plop", info);
  }

  @test
  async testRouterWithPrefix() {
    this.webda.addRoute("/test/{uuid}", { methods: ["GET"], executor: "DefinedMailer" });
    this.webda.getGlobalParams().routePrefix = "/reprefix";
    assert.strictEqual(this.webda.getRouter().getFinalUrl("/test/plop"), "/reprefix/test/plop");
    assert.strictEqual(this.webda.getRouter().getFinalUrl("/reprefix/test/plop"), "/reprefix/test/plop");
    this.webda.getRouter().remapRoutes();
  }

  @test
  async testRouteWithPrefix() {
    this.webda.addRoute("/test/{uuid}", { methods: ["GET"], executor: "DefinedMailer" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/prefix/test/plop", "https");
    httpContext.setPrefix("/prefix");
    let ctx = await this.webda.newContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.strictEqual(ctx.getPathParameters().uuid, "plop");
  }

  @test
  async testRouteWithOverlap() {
    this.webda.addRoute("/test/{uuid}", { methods: ["GET"], executor: "DefinedMailer" });
    this.webda.addRoute("/test/{id}", { methods: ["GET"], executor: "DefinedMailer" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/test/plop", "https");
    let ctx = await this.webda.newContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/test/plop"), ["GET"]);
  }

  @test
  async testRouteWithQueryParam() {
    this.webda.addRoute("/test/plop{?uuid}", { methods: ["GET"], executor: "DefinedMailer" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/test/plop", "http");
    let ctx = await this.webda.newContext(httpContext);
    assert.strictEqual(this.webda.updateContextWithRoute(ctx), true);
    assert.strictEqual(ctx.getPathParameters().uuid, undefined);
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop?uuid=bouzouf", "http");
    ctx = await this.webda.newContext(httpContext);
    assert.strictEqual(this.webda.updateContextWithRoute(ctx), true);
    assert.strictEqual(ctx.getPathParameters().uuid, "bouzouf");
  }

  @test
  completeOpenApi() {
    let api = { paths: {}, info: { title: "Plop", version: "1.0" }, openapi: "", tags: [{ name: "test" }] };
    const info: RouteInfo = {
      methods: ["GET"],
      executor: "DefinedMailer",
      openapi: {
        tags: ["plop", "test"],
        hidden: true,
        get: {
          schemas: {
            output: "test"
          }
        }
      }
    };
    this.webda.addRoute("/plop{?*path}", info);
    this.webda.getRouter().remapRoutes();
    this.webda.getRouter().completeOpenAPI(api);
    assert.strictEqual(api.paths["/plop"], undefined);
    this.webda.getRouter().completeOpenAPI(api, false);
    assert.notStrictEqual(api.paths["/plop"], undefined);
    assert.deepStrictEqual(api.paths["/plop"].get.tags, ["plop", "test"]);
    assert.ok(api.tags.filter(f => f.name === "plop").length === 1);
  }
}
