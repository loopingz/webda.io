import { suite, test } from "@webda/test";
import * as assert from "assert";
import { RouteInfo } from "./router";
import { TestApplication, WebdaTest } from "../test";
import { HttpContext } from "../utils/httpcontext";
import { RESTDomainService } from "./restdomainservice";
import { ImageUser } from "../services/binary.spec";

/**
 * Test the Router
 */
@suite
class RouterTest extends WebdaTest {
  /**
   * Add the ImageUser model to the app
   * @param app
   * @returns
   */
  tweakApp(app: TestApplication): Promise<void> {
    app.addModel("ImageUser", ImageUser);
    // Add the binaries relationship
    app.getRelations("WebdaDemo/ImageUser").binaries = [
      {
        attribute: "images",
        cardinality: "MANY"
      },
      {
        attribute: "profile",
        cardinality: "ONE"
      }
    ];
    return super.tweakApp(app);
  }

  @test
  testGetRouteMethodsFromUrl() {
    const info: RouteInfo = { methods: ["GET"], executor: "DefinedMailer" };
    this.webda.addRoute("/plop", info);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/"), ["GET", "POST"]);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["GET"]);
    this.webda.addRoute("/plop", { methods: ["POST"], executor: "DefinedMailer" });
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/plop"), ["POST", "GET"]);
    const call = [];
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
    const httpContext = new HttpContext("test.webda.io", "GET", "/prefix/test/plop", "https");
    httpContext.setPrefix("/prefix");
    const ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.strictEqual(ctx.getParameters().uuid, "plop");
  }

  @test
  async testRouteWithOverlap() {
    this.webda.addRoute("/test/{uuid}", { methods: ["GET"], executor: "DefinedMailer" });
    this.webda.addRoute("/test/{id}", { methods: ["GET"], executor: "DefinedMailer" });
    const httpContext = new HttpContext("test.webda.io", "GET", "/test/plop", "https");
    const ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(this.webda.getRouter().getRouteMethodsFromUrl("/test/plop"), ["GET"]);
  }

  @test
  async testRouteWithWeirdSplit() {
    this.webda.addRoute("/test/{uuid}at{domain}", { methods: ["GET"], executor: "DefinedMailer" });
    const httpContext = new HttpContext("test.webda.io", "GET", "/test/plopatgoogle", "https");
    const ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getParameters(), {
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
    assert.deepStrictEqual(ctx.getParameters(), {
      uuid: "plop"
    });
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop/users", "https");
    ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getParameters(), {
      uuid: "plop"
    });
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop/users/plip", "https");
    ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getParameters(), {
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
    assert.deepStrictEqual(ctx.getParameters(), { path: "plop/toto/plus" });
    httpContext = new HttpContext("test.webda.io", "GET", "/test2/plop/toto/plus?query3=12&query2=test,test2", "https");
    ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getParameters(), {
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
    assert.deepStrictEqual(ctx.getParameters(), { email: "test@webda.io" });
    httpContext = new HttpContext("test.webda.io", "GET", "/email/callback?email=test%40webda.io", "https");
    ctx = await this.webda.newWebContext(httpContext);
    this.webda.updateContextWithRoute(ctx);
    assert.deepStrictEqual(ctx.getParameters(), { email: "test@webda.io" });
  }

  @test
  async testRouteWithQueryParam() {
    this.webda.addRoute("/test/plop{?uuid?}", { methods: ["GET"], executor: "DefinedMailer" });
    let httpContext = new HttpContext("test.webda.io", "GET", "/test/plop", "http");
    let ctx = await this.webda.newWebContext(httpContext);
    assert.strictEqual(this.webda.updateContextWithRoute(ctx), true);
    assert.strictEqual(ctx.getParameters().uuid, undefined);
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop?uuid=bouzouf", "http");
    ctx = await this.webda.newWebContext(httpContext);
    assert.strictEqual(this.webda.updateContextWithRoute(ctx), true);
    assert.strictEqual(ctx.getParameters().uuid, "bouzouf");
    this.webda.addRoute("/test/plop2{?params+}", { methods: ["GET"], executor: "DefinedMailer" });
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop2", "http");
    ctx = await this.webda.newWebContext(httpContext);
    assert.strictEqual(this.webda.updateContextWithRoute(ctx), false);
    httpContext = new HttpContext("test.webda.io", "GET", "/test/plop2?uuid=plop", "http");
    ctx = await this.webda.newWebContext(httpContext);
    assert.strictEqual(this.webda.updateContextWithRoute(ctx), true);
    assert.strictEqual(ctx.getParameters().params.uuid, "plop");
  }

  @test
  completeOpenApi() {
    const api = { paths: {}, info: { title: "Plop", version: "1.0" }, openapi: "", tags: [{ name: "test" }] };
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

  /**
   * Ensure models url are available
   */
  @test
  async getModelUrl() {
    await this.addService(RESTDomainService, {});
    const url = this.webda.getRouter().getModelUrl(new ImageUser());
    assert.strictEqual(url, "/imageUsers");
  }
}
