import { WebdaTest } from "../test";
import { SecureCookie, Context } from "../index";
import { HttpContext } from "./context";
import { test, suite } from "@testdeck/mocha";
import * as assert from "assert";

const SECRET =
  "Lp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5EN";

@suite
class CookieTest extends WebdaTest {
  _ctx: Context;
  async before() {
    await super.before();
    this._ctx = await this.webda.newContext(new HttpContext("test.webda.io", "GET", "/"));
  }

  @test("No changes") testNoChanges() {
    var cookie = new SecureCookie(
      "test",
      {
        secret: SECRET
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
        secret: SECRET
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
        secret: SECRET
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
        secret: SECRET
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
        secret: SECRET
      },
      this._ctx,
      {}
    );
    assert.strictEqual(cookie.needSave(), false);
  }

  @test("Normal enc/dec") testEncryption() {
    var cookie = new SecureCookie(
      "test",
      {
        secret: SECRET
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
    cookie._changed = true;
    cookie.save(this._ctx);
    let cookies = this._ctx.getResponseCookies();
    let httpContext = this._ctx.getHttpContext();
    httpContext.cookies = httpContext.cookies || {};
    for (let i in cookies) {
      httpContext.cookies[i] = cookies[i].value;
    }
    var cookie2 = new SecureCookie(
      "test",
      {
        secret: SECRET
      },
      this._ctx
    );
    assert.strictEqual(cookie.title, cookie2.title);
    assert.strictEqual(cookie2.needSave(), false);
    assert.strictEqual(cookie.desc, cookie2.desc);
  }

  @test("Bad secret") testBadSecret() {
    var cookie = new SecureCookie(
      "test",
      {
        secret: SECRET
      },
      this._ctx,
      {
        title: "TITLE",
        desc: "DESCRIPTION"
      }
    ).getProxy();
    assert.strictEqual(cookie["title"], "TITLE");
    assert.strictEqual(cookie["desc"], "DESCRIPTION");
    cookie.save(this._ctx);
    var exception = false;
    try {
      new SecureCookie(
        "test",
        {
          secret: SECRET + "2"
        },
        this._ctx
      );
    } catch (err) {
      exception = true;
    }
    assert.strictEqual(exception, false);
    // TODO Add test for s_fid=3C43F8B5AAFA0B87-0087E6884E64AFFD; s_dslv=1462619672626; s_dslv_s=Less%20than%201%20day;
  }

  @test("bad secret length") testBadSecretLength() {
    let exception = false;
    try {
      new SecureCookie(
        "test",
        {
          secret: "BOUZOUF"
        },
        this._ctx
      );
    } catch (err) {
      exception = true;
    }
    assert.strictEqual(exception, true);
  }
}
