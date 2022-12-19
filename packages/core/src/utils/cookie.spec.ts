import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { serialize as cookieSerialize } from "cookie";
import { Context, CookieOptions, SecureCookie } from "../index";
import { WebdaTest } from "../test";
import { SimpleOperationContext } from "./context";
import { HttpContext } from "./httpcontext";
import { Session } from "./session";

const SECRET =
  "Lp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5EN";

@suite
class CookieTest extends WebdaTest {
  _ctx: Context;
  async before() {
    await super.before();
    this._ctx = await this.webda.newContext(new HttpContext("test.webda.io", "GET", "/"));
    this.webda.updateContextWithRoute(this._ctx);
  }

  @test("Bad cookie") async testBadSecret() {
    let ctx = await this.newContext();
    ctx.getHttpContext().cookies = {};
    ctx.getHttpContext().cookies["test"] = "plop";
    let session = await SecureCookie.load("test", ctx, undefined);
    assert.strictEqual(Object.keys(session).length, 0);
  }

  @test
  async cov() {
    let session = await SecureCookie.load("test", new Context(this.webda, undefined, undefined), undefined);
    assert.strictEqual(Object.keys(session).length, 0);
    assert.strictEqual(
      await new SimpleOperationContext(this.webda).setInput(Buffer.from("plop")).getRawInputAsString(),
      "plop"
    );
    let ctx = await this.newContext();
    assert.ok(!new CookieOptions({}, ctx.getHttpContext()).secure);
    ctx.getHttpContext().protocol = "https:";
    assert.ok(new CookieOptions({}, ctx.getHttpContext()).secure);
  }

  @test("Oversize cookie") async testOversize() {
    var cookie = new Session().getProxy();
    cookie.identUsed = "PLOP".repeat(3000);
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
    await ctx.init();
    assert.strictEqual(ctx.getSession().identUsed, "PLOP".repeat(3000));
  }
}
