import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { serialize as cookieSerialize } from "cookie";
import { Context, SecureCookie } from "../index";
import { WebdaTest } from "../test";
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
  /*
  @test("No changes") testNoChanges() {
    var cookie = new SecureCookie(
      "test",
      {
        secretOrPublicKey: SECRET
      },
      this._ctx,
      {
        title: "TITLE",
        desc: "DESCRIPTION"
      }
    ).getProxy();
    assert.strictEqual(cookie["title"], "TITLE");
    assert.strictEqual(cookie["desc"], "DESCRIPTION");
    assert.strictEqual(cookie.needSave(), false);
  }

  @test("Add a value") testAddValue() {
    var cookie = new SecureCookie(
      "test",
      {
        secretOrPublicKey: SECRET
      },
      this._ctx,
      {
        title: "TITLE",
        desc: "DESCRIPTION"
      }
    ).getProxy();
    cookie.test = "PLOP";
    assert.strictEqual(cookie["title"], "TITLE");
    assert.strictEqual(cookie["desc"], "DESCRIPTION");
    assert.strictEqual(cookie["test"], "PLOP");
    assert.strictEqual(cookie.needSave(), true);
  }

  @test("Change a value") testChangeValue() {
    var cookie = new SecureCookie(
      "test",
      {
        secretOrPublicKey: SECRET
      },
      this._ctx,
      {
        title: "TITLE",
        desc: "DESCRIPTION"
      }
    ).getProxy();
    cookie.title = "TITLE2";
    assert.strictEqual(cookie["title"], "TITLE2");
    assert.strictEqual(cookie["desc"], "DESCRIPTION");
    assert.strictEqual(cookie.needSave(), true);
  }

  @test("Delete a value") testDeleteValue() {
    var cookie = new SecureCookie(
      "test",
      {
        secretOrPublicKey: SECRET
      },
      this._ctx,
      {
        title: "TITLE",
        desc: "DESCRIPTION"
      }
    ).getProxy();
    cookie["title"] = undefined;
    assert.strictEqual(cookie["title"], undefined);
    assert.strictEqual(cookie["desc"], "DESCRIPTION");
    assert.strictEqual(cookie.needSave(), true);
  }

  @test("Empty cookie") testEmptyCookie() {
    var cookie = new SecureCookie(
      "test",
      {
        secretOrPublicKey: SECRET
      },
      this._ctx,
      {}
    );
    assert.strictEqual(cookie.needSave(), false);
  }

  @test("session cookie") sessionCookie() {
    var cookie = new SessionCookie(this._ctx);
    assert.strictEqual(cookie.isLogged(), false);
    cookie.login("plop", "");
    assert.strictEqual(cookie.isLogged(), true);
  }

  @test("Cookie parameters") async testCookieParameters() {
    var cookie = new SecureCookie(
      "test",
      {
        secretOrPublicKey: SECRET
      },
      this._ctx,
      {}
    ).getProxy();
    cookie["title"] = "plop";
    assert.strictEqual(cookie.needSave(), true);
    await cookie.save(this._ctx);
    assert.deepStrictEqual(this._ctx.getResponseCookies()["test"].options, {
      path: "/",
      domain: "test.webda.io",
      httpOnly: true,
      secure: false,
      maxAge: 604800,
      sameSite: "None"
    });
    cookie["title"] = "plop2";
    assert.strictEqual(cookie.needSave(), true);
    // @ts-ignore
    this._ctx.parameters.cookie = {
      maxAge: 3600
    };
    await cookie.save(this._ctx);
    assert.deepStrictEqual(this._ctx.getResponseCookies()["test"].options, {
      path: "/",
      domain: "test.webda.io",
      httpOnly: true,
      secure: false,
      maxAge: 3600,
      sameSite: "Lax"
    });
  }

  @test("bad cookie")
  testBad() {
    this._ctx.getHttpContext().cookies = {
      testor: "badCookie"
    };
    let stub = sinon.stub(this._ctx, "log").callsFake(() => {});
    try {
      new SecureCookie(
        "testor",
        {
          secretOrPublicKey: "plop".repeat(64)
        },
        this._ctx
      );
      assert.strictEqual(stub.getCall(0).args[0], "WARN");
      assert.ok(stub.getCall(0).args[1].match(/Ignoring bad cookie/));
    } finally {
      stub.restore();
    }
  }

  @test("Normal enc/dec") async testEncryption() {
    var cookie = new SecureCookie(
      "test",
      {
        secretOrPublicKey: SECRET
      },
      this._ctx,
      {
        title: "TITLE",
        desc: "DESCRIPTION"
      }
    ).getProxy();
    assert.strictEqual(cookie["title"], "TITLE");
    assert.strictEqual(cookie["desc"], "DESCRIPTION");
    // Force encryption
    // @ts-ignore
    cookie.changed = true;
    await cookie.save(this._ctx);
    let cookies = this._ctx.getResponseCookies();
    let httpContext = this._ctx.getHttpContext();
    httpContext.cookies = httpContext.cookies || {};
    for (let i in cookies) {
      httpContext.cookies[i] = cookies[i].value;
    }
    var cookie2 = new SecureCookie(
      "test",
      {
        secretOrPublicKey: SECRET
      },
      this._ctx
    );
    assert.strictEqual(cookie.title, cookie2.title);
    assert.strictEqual(cookie2.needSave(), false);
    assert.strictEqual(cookie.desc, cookie2.desc);
  }

  
*/
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
