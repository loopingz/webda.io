import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { serialize as cookieSerialize } from "cookie";
import { CookieOptions, SecureCookie, WebContext } from "../index";
import { WebdaSimpleTest } from "../test";
import { SimpleOperationContext } from "./context";
import { WebContextMock } from "./context.spec";
import { HttpContext } from "./httpcontext";
import { Session } from "./session";
import { UnpackedConfiguration } from "../application";

const SECRET =
  "Lp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5EN";

@suite
class CookieTest extends WebdaSimpleTest {
  _ctx: WebContext;
  async before() {
    await super.before();
    this._ctx = await this.webda.newWebContext(new HttpContext("test.webda.io", "GET", "/"));
    this.webda.updateContextWithRoute(this._ctx);
  }

  getTestConfiguration() {
    return {
      parameters: {
        cookie: {
          sameSite: "None",
          name: "test"
        }
      }
    };
  }

  @test("Bad cookie") async testBadSecret() {
    let ctx = await this.newContext();
    ctx.getHttpContext().cookies = {};
    ctx.getHttpContext().cookies["test"] = "plop";
    let session = await SecureCookie.load("test", ctx, undefined);
    console.log(session);
    assert.strictEqual(Object.keys(session).length, 0);
  }

  @test
  async cov() {
    let session = await SecureCookie.load("test", new WebContextMock(this.webda, undefined, undefined), undefined);
    assert.strictEqual(Object.keys(session).length, 0);
    assert.strictEqual(
      await new SimpleOperationContext(this.webda).setInput(Buffer.from("plop")).getRawInputAsString(),
      "plop"
    );
    let ctx = await this.newContext();
    assert.ok(!new CookieOptions({}, ctx.getHttpContext()).secure);
    ctx.getHttpContext().protocol = "https:";
    assert.ok(new CookieOptions({}, ctx.getHttpContext()).secure);
    let opts = new CookieOptions({ domain: true }, ctx.getHttpContext());
    assert.strictEqual(opts.domain, "test.webda.io");
    opts = new CookieOptions({}, ctx.getHttpContext());
    assert.strictEqual(opts.domain, undefined);
    opts = new CookieOptions({ domain: "google.com" }, ctx.getHttpContext());
    assert.strictEqual(opts.domain, "google.com");
  }

  @test("Oversize cookie") async testOversize() {
    var cookie = new Session().getProxy();
    cookie.identUsed = "PLOP".repeat(3005);
    assert.strictEqual(cookie.isDirty(), true);
    await SecureCookie.save("test", this._ctx, cookie);
    assert.strictEqual(Object.keys(this._ctx.getResponseCookies()).length, 5);
    for (let i = 1; i < 5; i++) {
      const cookie = this._ctx.getResponseCookies()[`test${i > 1 ? i : ""}`];
      assert.strictEqual(cookieSerialize(cookie.name, cookie.value, cookie.options || {}).length, 4096);
    }
    let ctx = await this.newContext();
    let cookies = this._ctx.getResponseCookies();
    ctx.getHttpContext().cookies = {};
    Object.keys(cookies).forEach(k => {
      ctx.getHttpContext().cookies[k] = cookies[k].value;
    });
    await ctx.init(true);
    assert.ok(ctx.getSession().identUsed === "PLOP".repeat(3005));
  }
}
