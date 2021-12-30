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
  async cov() {
    // Get the last lines
    this.ctx.logIn();
    this.ctx.getRoute();
    assert.notStrictEqual(this.ctx.getService("Users"), undefined);
    assert.notStrictEqual(this.ctx.getService<Service>("Users"), undefined);
    this.ctx = new Context(this.webda, new HttpContext("test.webda.io", "GET", "/uritemplate/plop"));
    this.ctx.setPathParameters({ id: "plop" });
    this.ctx.setServiceParameters({ id: "service" });
    assert.strictEqual(this.ctx.getServiceParameters().id, "service");
    assert.strictEqual(this.ctx.getPathParameters().id, "plop");
    this.ctx.setExtension("mine", "plop");
    assert.strictEqual(this.ctx.getExtension("mine"), "plop");
    // @ts-ignore
    assert.strictEqual(this.ctx.getRequestParameters(), this.ctx.parameters);
    assert.strictEqual(this.ctx.isGlobal(), false);
    // @ts-ignore
    this.ctx.session = undefined;
    assert.strictEqual(this.ctx.getSession(), undefined);
    assert.strictEqual(this.ctx._promises.length, 0);
    this.ctx.addAsyncRequest((async () => {})());
    assert.strictEqual(this.ctx._promises.length, 1);

    let caught = false;
    this.ctx.on("error", () => {
      caught = true;
    });
    this.ctx.emitError("plop");
    assert.ok(caught);
    this.ctx.log("INFO", "Test");

    assert.rejects(() => this.ctx.execute(), /Not Implemented/);
    let called = false;
    this.ctx._executor = {
      // @ts-ignore
      plop: () => {
        called = true;
      }
    };

    this.ctx._route = {
      // @ts-ignore
      _method: this.ctx._executor.plop
    };
    await this.ctx.execute();
    assert.ok(called);

    // @ts-ignore
    this.ctx._ended = true;
    await this.ctx.end();

    this.ctx.getHttpContext().setBody(undefined);
    this.ctx.getRequestBody();

    // @ts-ignore
    this.ctx._ended = false;
    // @ts-ignore
    this.ctx._buffered = true;
    this.ctx._stream = {
      _body: []
    };
    this.ctx.statusCode = 204;
    await this.ctx.end();
    assert.strictEqual(this.ctx.statusCode, 200);
    // @ts-ignore
    this.ctx._body = undefined;
    this.ctx._write("ppop", "", () => {});

    assert.strictEqual(this.ctx.hasFlushedHeaders(), false);
    this.ctx.setFlushedHeaders();
    assert.strictEqual(this.ctx.hasFlushedHeaders(), true);
    this.ctx.setFlushedHeaders(false);
    assert.strictEqual(this.ctx.hasFlushedHeaders(), false);
  }

  @test
  getRequest() {
    // Need to finish this
    let req = this.ctx.getRequest();
    // cov
    req.setTimeout(1, () => {});
  }

  @test
  getAbsoluteUrl() {
    let ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 80, undefined, {
      cookie: "PHPSESSID=298zf09hf012fh2; csrftoken=u32t4o3tb3gg43; _gat=1"
    });
    assert.strictEqual(ctx.getAbsoluteUrl("/test"), "http://test.webda.io/test");
    assert.deepStrictEqual(ctx.getCookies(), {
      PHPSESSID: "298zf09hf012fh2",
      csrftoken: "u32t4o3tb3gg43",
      _gat: "1"
    });
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "https", 80);
    assert.strictEqual(ctx.getAbsoluteUrl(), "https://test.webda.io:80/uritemplate/plop");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 443);
    assert.strictEqual(ctx.getAbsoluteUrl("/test"), "http://test.webda.io:443/test");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 18080);
    assert.strictEqual(ctx.getAbsoluteUrl(), "http://test.webda.io:18080/uritemplate/plop");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "https", 443);
    assert.strictEqual(ctx.getAbsoluteUrl("/test"), "https://test.webda.io/test");
    assert.strictEqual(ctx.getAbsoluteUrl("ftp://test"), "ftp://test");
    assert.strictEqual(ctx.getAbsoluteUrl("test/ftp://test"), "https://test.webda.io/test/ftp://test");
    assert.strictEqual(ctx.getAbsoluteUrl("https://www.loopingz.com"), "https://www.loopingz.com");
    ctx.setPrefix("/plop/");
    assert.strictEqual(ctx.prefix, "/plop");
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
    assert.strictEqual(this.ctx.getResponseHeaders().Location, "https://www.loopingz.com");
    assert.strictEqual(this.ctx.statusCode, 302);
  }
  @test
  generic() {
    this.ctx.init();
    assert.notStrictEqual(this.ctx.getWebda(), undefined);
    // @ts-ignore
    this.ctx.session = undefined;
    assert.strictEqual(this.ctx.getCurrentUserId(), undefined);
    assert.notStrictEqual(this.ctx.getStream(), undefined);
    this.ctx._cookie = undefined;
    this.ctx.cookie("test", "plop");
    this.ctx.cookie("test2", "plop2");
    assert.strictEqual(this.ctx._cookie["test"].value, "plop");
    assert.strictEqual(this.ctx._cookie["test2"].value, "plop2");
    this.ctx.writeHead(undefined, {
      test: "plop"
    });
    assert.strictEqual(this.ctx.getResponseHeaders()["test"], "plop");
    this.ctx.setHeader("X-Webda", "HEAD");
    assert.strictEqual(this.ctx.getResponseHeaders()["X-Webda"], "HEAD");
    this.ctx.write(400);
    assert.strictEqual(this.ctx.getResponseBody(), 400);
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
      assert.strictEqual(this.ctx.session._changed, false);
      callback([
        {
          name: "zzz"
        }
      ]);
      // @ts-ignore
      assert.strictEqual(this.ctx.session._changed, true);
    };
    this.ctx.getSession();
    // @ts-ignore
    Object.observe = undefined;
  }

  @test
  defaultLocale() {
    assert.strictEqual(this.ctx.getLocale(), "es-ES");
  }

  @test
  approxLocale() {
    this.ctx.getHttpContext().getHeaders()["Accept-Language"] = "en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.strictEqual(this.ctx.getLocale(), "en");
  }

  @test
  exactLocale() {
    this.ctx.getHttpContext().getHeaders()["Accept-Language"] = "fr-FR,fr;q=0.8,en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.strictEqual(this.ctx.getLocale(), "fr-FR");
  }

  @test
  fallbackLocale() {
    this.ctx.getHttpContext().getHeaders()["Accept-Language"] = "zn-CH,zn;q=0.8,en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.strictEqual(this.ctx.getLocale(), "en");
  }
}

@suite
class HttpContextTest {
  @test
  lowerCaseHeader() {
    let ctx = new HttpContext("test.webda.io", "GET", "/test", "http", 80, {}, { "X-Test": "weBda" });
    assert.strictEqual(ctx.getHeader("X-Test"), "weBda");
    assert.strictEqual(ctx.getHeader("X-Test"), ctx.getHeader("x-test"));
    assert.strictEqual(ctx.getPort(), 80);
  }
}
