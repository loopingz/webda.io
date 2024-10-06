import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { MemoryStore } from "../stores/memory";
import { WebdaSimpleTest } from "../test";
import { OperationContext } from "./context";
import { CookieSessionManager, UnknownSession } from "./session";

@suite
class SessionTest {
  @test
  basic() {
    const session = new UnknownSession().getProxy();
    session.plop = "test";
    assert.ok(session.isDirty());
    assert.ok(!session.isLogged());
    session.login("user1", "ident1");
    assert.ok(session.isLogged());
    session.logout();
    assert.ok(!session.isLogged());
  }
}

@suite
class SessionStoreTest extends WebdaSimpleTest {
  /**
   * @override
   */
  getTestConfiguration() {
    return {
      parameters: {
        ignoreBeans: true,
        cookie: {
          name: "test"
        }
      }
    };
  }

  @test
  async sessionStore() {
    // Test MemoryStore
    const store = (this.webda.getServices()["SessionStore"] = await new MemoryStore(this.webda, "SessionStore", {})
      .resolve()
      .init());
    this.getService<CookieSessionManager>("SessionManager").resolve();
    const ctx = await this.newContext();
    ctx.getSession().identUsed = "bouzouf";
    await ctx.end();
    const sessions = await store.getAll();
    assert.strictEqual(sessions.length, 1);
    const cookie = await this.webda.getCrypto().jwtVerify(ctx.getResponseCookies()["test"].value);
    assert.strictEqual(cookie.uuid, undefined);
    assert.strictEqual(cookie.identUsed, undefined);
    assert.strictEqual(cookie.sub, sessions[0].getUuid());

    const ctx2 = await this.newContext();
    ctx2.getHttpContext().cookies = {
      test: ctx.getResponseCookies()["test"].value
    };
    await ctx2.init(true);
    const session = ctx2.getSession<UnknownSession>();
    assert.strictEqual(session.uuid, sessions[0].getUuid());
    assert.strictEqual(session.identUsed, "bouzouf");
    assert.strictEqual(session.sub, undefined);
    const opCtx = new OperationContext(this.webda);
    // cov
    await this.getService<CookieSessionManager>("SessionManager").load(opCtx);
    await this.getService<CookieSessionManager>("SessionManager").save(opCtx, undefined);
  }
}
