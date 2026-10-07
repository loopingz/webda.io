import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Session, UnknownSession } from "./session.js";
import { WebdaApplicationTest } from "../test/application.js";
import { registerUserResolver, useService } from "../core/hooks.js";
import { useModel } from "../application/hooks.js";
import { useCrypto } from "../services/cryptoservice.service.js";

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
    assert.strictEqual(session.mfa, "none");
    assert.deepStrictEqual(session.amr, []);
    session.logout();
    assert.ok(!session.isLogged());
  }

  @test
  pendingMfa() {
    const session = new Session();
    session.login("user1", "a@b.c:email", { provider: "email", amr: ["pwd"], mfa: "pending" });
    assert.ok(!session.isLogged());
    assert.ok(session.isPending());
    assert.strictEqual(session.provider, "email");
    session.refreshFamily = "fam";
    session.logout();
    assert.strictEqual(session.provider, undefined);
    assert.strictEqual(session.amr, undefined);
    assert.strictEqual(session.mfa, undefined);
    assert.strictEqual(session.refreshFamily, undefined);
  }

  @test
  statelessNotSerialized() {
    const session = new Session();
    session.stateless = true;
    assert.ok(!Object.keys(session).includes("stateless"));
  }
}

@suite
class BearerSessionTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: { AuthStore: { type: "Webda/MemoryStore", models: ["Webda/RefreshToken", "Webda/User"] } }
    };
  }

  async contextWith(headers: Record<string, string>) {
    const ctx = await this.newContext();
    Object.assign(ctx.getHttpContext().headers, headers);
    return ctx;
  }

  async token() {
    const s = new Session();
    s.login("u1", "a@b.c:email", { provider: "email", amr: ["pwd"] });
    return (await useService("TokenService").issue(s)).accessToken;
  }

  @test
  async bearerWins() {
    const ctx = await this.contextWith({ authorization: `Bearer ${await this.token()}` });
    const loaded = await useService("SessionManager").load(ctx);
    assert.strictEqual(loaded.userId, "u1");
    assert.ok(loaded.stateless);
    assert.ok(loaded.isLogged());
    assert.deepStrictEqual(loaded.amr, ["pwd"]);
  }

  @test
  async lowercaseScheme() {
    const ctx = await this.contextWith({ authorization: `bearer ${await this.token()}` });
    const loaded = await useService("SessionManager").load(ctx);
    assert.ok(loaded.isLogged());
  }

  @test
  async invalidBearerIsAnonymous() {
    const ctx = await this.contextWith({ authorization: "Bearer nope" });
    const loaded = await useService("SessionManager").load(ctx);
    assert.ok(!loaded.isLogged());
  }

  @test
  async invalidBearerDoesNotFallBackToCookie() {
    const manager = useService("SessionManager");
    const first = await this.newContext();
    const s = new Session();
    s.login("u1", "x:email");
    await manager.save(first, s);
    const ctx = await this.contextWith({ authorization: "Bearer nope" });
    const sent: any = first.getResponseCookies();
    ctx.getHttpContext().cookies = {};
    for (const name of Object.keys(sent)) {
      ctx.getHttpContext().cookies[name] = sent[name].value;
    }
    // Sanity: the same cookie alone does authenticate
    delete ctx.getHttpContext().headers["authorization"];
    assert.ok((await manager.load(ctx)).isLogged());
    ctx.getHttpContext().headers["authorization"] = "Bearer nope";
    const loaded = await manager.load(ctx);
    assert.ok(!loaded.isLogged());
  }

  @test
  async nonBearerSchemeIgnored() {
    const ctx = await this.contextWith({ authorization: "Basic abc" });
    const loaded = await useService("SessionManager").load(ctx);
    assert.ok(!loaded.stateless);
    assert.ok(!loaded.isLogged());
  }

  @test
  async statelessNotSaved() {
    const manager = useService("SessionManager");
    const saveAndCount = async (stateless: boolean) => {
      const ctx = await this.contextWith({});
      const s = new Session();
      s.stateless = stateless;
      s.login("u1", "x:email");
      await manager.save(ctx, s);
      // SecureCookie.save is async and not awaited by save()
      await new Promise(resolve => setTimeout(resolve, 20));
      return Object.keys(ctx.getResponseCookies() ?? {}).length;
    };
    assert.ok((await saveAndCount(false)) > 0, "control: regular session must set a cookie");
    assert.strictEqual(await saveAndCount(true), 0);
  }

  @test
  async bareBearerIsAnonymous() {
    const manager = useService("SessionManager");
    const first = await this.newContext();
    const s = new Session();
    s.login("u1", "x:email");
    await manager.save(first, s);
    await new Promise(resolve => setTimeout(resolve, 20));
    const ctx = await this.contextWith({ authorization: "Bearer" });
    const sent: any = first.getResponseCookies();
    ctx.getHttpContext().cookies = {};
    for (const name of Object.keys(sent)) {
      ctx.getHttpContext().cookies[name] = sent[name].value;
    }
    const loaded = await manager.load(ctx);
    assert.ok(!loaded.isLogged());
    assert.ok(loaded.stateless);
  }

  /**
   * Copy the cookies set on a context into a new one
   * @param from - context the session was saved on
   * @returns a context presenting those cookies
   */
  async withCookies(from: any) {
    await new Promise(resolve => setTimeout(resolve, 20));
    const ctx = await this.contextWith({});
    const sent: any = from.getResponseCookies();
    ctx.getHttpContext().cookies = {};
    for (const name of Object.keys(sent)) {
      ctx.getHttpContext().cookies[name] = sent[name].value;
    }
    return ctx;
  }

  @test
  async passwordChangeEndsOlderSessions() {
    // As registered by the Authentication service
    registerUserResolver({ resolve: async id => (useModel("User") as any).ref(id).get() });
    try {
      await this.checkPasswordChangeEndsOlderSessions();
    } finally {
      registerUserResolver(undefined);
    }
  }

  async checkPasswordChangeEndsOlderSessions() {
    const manager = useService("SessionManager");
    const user: any = await useModel("User").create({ email: "pw1@x.com" } as any);
    const uid = user.getUUID();
    user.password.setHash("$2b$10$hash", 1000);
    await user.save();
    const first = await this.newContext();
    const s = new Session();
    s.login(uid, "pw1@x.com:email");
    s.authAt = 2000;
    await manager.save(first, s);
    const token = (await useService("TokenService").issue(s)).accessToken;
    // Authenticated after the last change: kept
    assert.ok((await manager.load(await this.withCookies(first))).isLogged());
    assert.ok((await manager.load(await this.contextWith({ authorization: `Bearer ${token}` }))).isLogged());
    // Password changed after the authentication: anonymous
    user.password.setHash("$2b$10$other", 3000);
    await user.save();
    assert.ok(!(await manager.load(await this.withCookies(first))).isLogged());
    assert.ok(!(await manager.load(await this.contextWith({ authorization: `Bearer ${token}` }))).isLogged());
    // A session without authAt is not checked
    const legacy = await this.newContext();
    const l = new Session();
    l.login(uid, "pw1@x.com:email");
    await manager.save(legacy, l);
    assert.ok((await manager.load(await this.withCookies(legacy))).isLogged());
  }

  @test
  async pendingMfaToken() {
    const token = await useCrypto().jwtSign({ sub: "u1", ident: "x:email", amr: ["pwd"], fam: "f", mfa: "pending" }, {
      audience: "webda-access",
      expiresIn: 60
    } as any);
    const ctx = await this.contextWith({ authorization: `Bearer ${token}` });
    const loaded = await useService("SessionManager").load(ctx);
    assert.ok(!loaded.isLogged());
    assert.ok(loaded.isPending());
  }
}
