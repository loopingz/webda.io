import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "./test";
import { HttpContext } from "./utils/context";

@suite
class RouterTest extends WebdaTest {
  @test
  testGetRouteMethodsFromUrl() {
    this.webda.addRoute("/plop", { methods: ["GET"], executor: "DefinedMailer" });
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/"), ["GET", "POST"]);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["GET"]);
    this.webda.addRoute("/plop", { methods: ["POST"], executor: "DefinedMailer" });
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["GET", "POST"]);
    let call = [];
    this.webda.log = (level, ...args) => {
      call.push({ level, args });
    };
    this.webda.addRoute("/plop", { methods: ["GET"], executor: "DefinedMailer" });
    assert.deepStrictEqual(call, [
      { level: "TRACE", args: ["Add route /plop"] },
      { level: "WARN", args: ["GET /plop overlap with another defined route"] }
    ]);
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
}
