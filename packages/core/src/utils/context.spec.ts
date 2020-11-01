import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { Service } from "../services/service";
import { WebdaTest } from "../test";
import { Context, HttpContext } from "./context";
import { SecureCookie } from "./cookie";

@suite
class ContextTest extends WebdaTest {
  ctx: Context;
  async before() {
    await super.before();
    this.ctx = new Context(this.webda, new HttpContext("test.webda.io", "GET", "/"));
  }

  @test
  cov() {
    // Get the last lines
    this.ctx.logIn();
    console.log(this.ctx.getRoute());
    assert.notEqual(this.ctx.getService("Users"), undefined);
    assert.notEqual(this.ctx.getService<Service>("Users"), undefined);
    this.ctx = new Context(this.webda, new HttpContext("test.webda.io", "GET", "/uritemplate/plop"));
    this.ctx.setPathParameters({ id: "plop" });
    this.ctx.setServiceParameters({ id: "service" });
    assert.equal(this.ctx.getServiceParameters().id, "service");
    assert.equal(this.ctx.getPathParameters().id, "plop");
  }

  @test
  getFullUrl() {
    let ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 80);
    assert.strictEqual(ctx.getFullUrl("/test"), "http://test.webda.io/test");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "https", 80);
    assert.strictEqual(ctx.getFullUrl(), "https://test.webda.io:80/uritemplate/plop");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 443);
    assert.strictEqual(ctx.getFullUrl("/test"), "http://test.webda.io:443/test");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 18080);
    assert.strictEqual(ctx.getFullUrl(), "http://test.webda.io:18080/uritemplate/plop");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "https", 443);
    assert.strictEqual(ctx.getFullUrl("/test"), "https://test.webda.io/test");
  }

  @test
  expressCompatibility() {
    this.ctx = new Context(this.webda, new HttpContext("test.webda.io", "GET", "/uritemplate/plop"));
    assert.strictEqual(this.ctx.statusCode, 204);
    assert.strictEqual(this.ctx.status(403), this.ctx);
    assert.strictEqual(this.ctx.statusCode, 403);
    this.ctx = new Context(this.webda, new HttpContext("test.webda.io", "GET", "/uritemplate/plop"));
    assert.strictEqual(this.ctx.statusCode, 204);
    assert.strictEqual(this.ctx.json({ plop: "test" }), this.ctx);
    assert.strictEqual(this.ctx.getResponseBody(), '{"plop":"test"}');
    assert.strictEqual(this.ctx.statusCode, 200);
  }

  @test
  async redirect() {
    this.ctx.init();
    this.ctx.redirect("https://www.loopingz.com");
    assert.equal(this.ctx.getResponseHeaders().Location, "https://www.loopingz.com");
    assert.equal(this.ctx.statusCode, 302);
  }
  @test
  generic() {
    this.ctx.init();
    assert.notEqual(this.ctx.getWebda(), undefined);
    // @ts-ignore
    this.ctx.session = undefined;
    assert.equal(this.ctx.getCurrentUserId(), undefined);
    assert.notEqual(this.ctx.getStream(), undefined);
    this.ctx._cookie = undefined;
    this.ctx.cookie("test", "plop");
    this.ctx.cookie("test2", "plop2");
    assert.equal(this.ctx._cookie["test"].value, "plop");
    assert.equal(this.ctx._cookie["test2"].value, "plop2");
    this.ctx.writeHead(undefined, {
      test: "plop"
    });
    assert.equal(this.ctx.getResponseHeaders()["test"], "plop");
    this.ctx.setHeader("X-Webda", "HEAD");
    assert.equal(this.ctx.getResponseHeaders()["X-Webda"], "HEAD");
    this.ctx.write(400);
    assert.equal(this.ctx.getResponseBody(), 400);
    // @ts-ignore
    this.ctx.session = new SecureCookie(
      "test",
      {
        secret:
          "Lp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5EN"
      },
      this.ctx
    );
    // @ts-ignore
    Object.observe = (obj, callback) => {
      callback([
        {
          name: "_changed"
        }
      ]);
      // @ts-ignore
      assert.equal(this.ctx.session._changed, false);
      callback([
        {
          name: "zzz"
        }
      ]);
      // @ts-ignore
      assert.equal(this.ctx.session._changed, true);
    };
    this.ctx.getSession();
    // @ts-ignore
    Object.observe = undefined;
  }

  @test
  defaultLocale() {
    assert.equal(this.ctx.getLocale(), "es-ES");
  }

  @test
  approxLocale() {
    this.ctx.getHttpContext().getHeaders()["Accept-Language"] = "en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.equal(this.ctx.getLocale(), "en");
  }

  @test
  exactLocale() {
    this.ctx.getHttpContext().getHeaders()["Accept-Language"] = "fr-FR,fr;q=0.8,en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.equal(this.ctx.getLocale(), "fr-FR");
  }

  @test
  fallbackLocale() {
    this.ctx.getHttpContext().getHeaders()["Accept-Language"] = "zn-CH,zn;q=0.8,en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.equal(this.ctx.getLocale(), "en");
  }
}

@suite
class HttpContextTest {
  @test
  lowerCaseHeader() {
    let ctx = new HttpContext("test.webda.io", "GET", "/test", "http", 80, {}, { "X-Test": "weBda" });
    assert.equal(ctx.getHeader("X-Test"), "weBda");
    assert.equal(ctx.getHeader("X-Test"), ctx.getHeader("x-test"));
    assert.equal(ctx.getPort(), 80);
  }
}
