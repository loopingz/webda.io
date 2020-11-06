import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "./test";
import { HttpContext } from "./utils/context";

@suite
class RouterTest extends WebdaTest {
  @test
  testGetRouteMethodsFromUrl() {
    this.webda.addRoute("/plop", { method: "GET" });
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/"), ["GET", "POST"]);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["GET"]);
    this.webda.addRoute("/plop", { method: "POST" });
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["GET", "POST"]);
    let call = [];
    this.webda.log = (level, ...args) => {
      call.push({ level, args });
    };
    this.webda.addRoute("/plop", { method: "GET" });
    assert.deepStrictEqual(call, [{ level: "WARN", args: ["GET /plop overlap with another defined route"] }]);
  }

  @test
  async testRouteWithPrefix() {
    this.webda.addRoute("/test/{uuid}", { method: "GET" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/prefix/test/plop", "https");
    httpContext.setPrefix("/prefix");
    let ctx = await this.webda.newContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.strictEqual(ctx.getPathParameters().uuid, "plop");
  }

  @test
  async testRouteWithOverlap() {
    this.webda.addRoute("/test/{uuid}", { method: "GET" });
    this.webda.addRoute("/test/{id}", { method: "GET" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/test/plop", "https");
    let ctx = await this.webda.newContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/test/plop"), ["GET"]);
  }
}
