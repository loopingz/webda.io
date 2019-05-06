import { WebdaTest } from "../test";
import { SecureCookie, Context } from "../index";
import { HttpContext } from "./context";
import { test, suite } from "mocha-typescript";

const SECRET =
  "Lp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5EN";
var assert = require("assert");

@suite
class CookieTest extends WebdaTest {
  _ctx: Context;
  async before() {
    await super.before();
    this._ctx = await this.webda.newContext(
      new HttpContext("test.webda.io", "GET", "/")
    );
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
    assert.equal(cookie["title"], "TITLE");
    assert.equal(cookie["desc"], "DESCRIPTION");
    assert.equal(cookie.needSave(), false);
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
    assert.equal(cookie["title"], "TITLE");
    assert.equal(cookie["desc"], "DESCRIPTION");
    assert.equal(cookie["test"], "PLOP");
    assert.equal(cookie.needSave(), true);
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
    assert.equal(cookie["title"], "TITLE2");
    assert.equal(cookie["desc"], "DESCRIPTION");
    assert.equal(cookie.needSave(), true);
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
    assert.equal(cookie["title"], undefined);
    assert.equal(cookie["desc"], "DESCRIPTION");
    assert.equal(cookie.needSave(), true);
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
    assert.equal(cookie.needSave(), false);
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
    assert.equal(cookie["title"], "TITLE");
    assert.equal(cookie["desc"], "DESCRIPTION");
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
    assert.equal(cookie.title, cookie2.title);
    assert.equal(cookie2.needSave(), false);
    assert.equal(cookie.desc, cookie2.desc);
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
    assert.equal(cookie["title"], "TITLE");
    assert.equal(cookie["desc"], "DESCRIPTION");
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
    assert.equal(exception, false);
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
    assert.equal(exception, true);
  }
}
