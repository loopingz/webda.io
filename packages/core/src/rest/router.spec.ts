import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { User } from "./models/user";
import { RouteInfo } from "./router";
import { WebdaTest } from "./test";
import { HttpContext } from "./utils/httpcontext";

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
    assert.strictEqual(this.webda.getRouter().getFinalUrl("//test/plop"), "/test/plop");
    this.webda.getRouter().remapRoutes();
  }

  @test
  async testRouteWithPrefix() {
    this.webda.addRoute("/test/{uuid}", { methods: ["GET"], executor: "DefinedMailer" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/prefix/test/plop", "https");
    httpContext.setPrefix("/prefix");
    let ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.strictEqual(ctx.getPathParameters().uuid, "plop");
  }

  @test
  async testRouteWithOverlap() {
    this.webda.addRoute("/test/{uuid}", { methods: ["GET"], executor: "DefinedMailer" });
    this.webda.addRoute("/test/{id}", { methods: ["GET"], executor: "DefinedMailer" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/test/plop", "https");
    let ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/test/plop"), ["GET"]);
  }

  @test
  async testRouteWithWeirdSplit() {
    this.webda.addRoute("/test/{uuid}at{domain}", { methods: ["GET"], executor: "DefinedMailer" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/test/plopatgoogle", "https");
    let ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getPathParameters(), {
      uuid: "plop",
      domain: "google"
    });
  }

  @test
  async testRouteWithSubPath() {
    this.webda.addRoute("/test/{uuid}", { methods: ["GET"], executor: "DefinedMailer" });
    this.webda.addRoute("/test/{uuid}/users", { methods: ["GET"], executor: "DefinedMailer2" });
    this.webda.addRoute("/test/{puid}/users/{uuid}", { methods: ["GET"], executor: "DefinedMailer3" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/test/plop", "https");
    let ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getPathParameters(), {
      uuid: "plop"
    });
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop/users", "https");
    ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getPathParameters(), {
      uuid: "plop"
    });
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop/users/plip", "https");
    ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getPathParameters(), {
      uuid: "plip",
      puid: "plop"
    });
  }

  @test
  async testRouteWithPath() {
    this.webda.addRoute("/test/{+path}", { methods: ["GET"], executor: "DefinedMailer" });
    this.webda.addRoute("/test2/{+path}{?query*}", { methods: ["GET"], executor: "DefinedMailer" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/test/plop/toto/plus", "https");
    let ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getPathParameters(), { path: "plop/toto/plus" });
    httpContext = new HttpContext("test.webda.io", "GET", "/test2/plop/toto/plus?query3=12&query2=test,test2", "https");
    ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getPathParameters(), {
      path: "plop/toto/plus",
      query: {
        query3: "12",
        query2: "test,test2"
      }
    });
  }

  @test
  async testRouteWithEmail() {
    this.webda.addRoute("/email/{email}/test", { methods: ["GET"], executor: "DefinedMailer" });
    this.webda.addRoute("/email/callback{?email,test?}", { methods: ["GET"], executor: "DefinedMailer" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/email/test%40webda.io/test", "https");
    let ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getPathParameters(), { email: "test@webda.io" });
    httpContext = new HttpContext("test.webda.io", "GET", "/email/callback?email=test%40webda.io", "https");
    ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getPathParameters(), { email: "test@webda.io" });
  }

  @test
  async testRouteWithQueryParam() {
    this.webda.addRoute("/test/plop{?uuid?}", { methods: ["GET"], executor: "DefinedMailer" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/test/plop", "http");
    let ctx = await this.webda.newWebContext(httpContext);
    assert.strictEqual(this.webda.updateContextWithRoute(ctx), true);
    assert.strictEqual(ctx.getPathParameters().uuid, undefined);
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop?uuid=bouzouf", "http");
    ctx = await this.webda.newWebContext(httpContext);
    assert.strictEqual(this.webda.updateContextWithRoute(ctx), true);
    assert.strictEqual(ctx.getPathParameters().uuid, "bouzouf");
    this.webda.addRoute("/test/plop2{?params+}", { methods: ["GET"], executor: "DefinedMailer" });
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop2", "http");
    ctx = await this.webda.newWebContext(httpContext);
    assert.strictEqual(this.webda.updateContextWithRoute(ctx), false);
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop2?uuid=plop", "http");
    ctx = await this.webda.newWebContext(httpContext);
    assert.strictEqual(this.webda.updateContextWithRoute(ctx), true);
    assert.strictEqual(ctx.getPathParameters().params.uuid, "plop");
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

  @test
  cov() {
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
    this.webda.addRoute("/cov", info);
    this.webda.addRoute("/cov", info);
    this.webda.addRoute("/cov", { ...info, methods: ["PUT"] });
    this.webda.getRouter().removeRoute("/cov", info);
    this.webda.getRouter().getRoutes();
  }

  @test
  getModelUrl() {
    let routes = this.webda.getRouter().getRoutes();
    console.log(routes["/memory/users{?q}"][0].openapi);
    let url = this.webda.getRouter().getModelUrl(new User());
    console.log(url);
  }
}
