import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident, runAsSystem, useService } from "@webda/core";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { AuthTest } from "./test/authtest.js";
import { addStubProviders, stubProvidersConfig } from "./test/stubprovider.js";
import { Authentication } from "./authentication.service.js";
import { LastLoginMethod, TokenInvalid } from "./errors.js";

/**
 * Errors are compared by code: the service is compiled while the spec imports src
 * @param fn - code expected to throw
 * @param cls - expected error class
 * @param message - assertion message
 */
const rejectsWith = (fn: () => Promise<unknown>, cls: { name: string }, message?: string) =>
  assert.rejects(fn, { code: cls.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase() }, message);

const google = (uid: string, email?: string) => ({
  provider: "google",
  providerUid: uid,
  email,
  emailVerified: true,
  amr: ["oauth"],
  profile: { name: "G" }
});

@suite
class SharedOpsTest extends AuthTest {
  auth: Authentication;

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/User", "Webda/Ident", "Webda/RefreshToken"] },
        Authentication: { type: "Webda/Authentication" },
        ...stubProvidersConfig("google")
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    addStubProviders(app, "google");
  }

  async beforeEach() {
    await super.beforeEach();
    this.auth = useService("Authentication" as any);
    delete (this.auth as any).mfaMethods;
  }

  async login(uid: string) {
    const ctx = await this.ctx();
    const res: any = await this.inContext(ctx, () => this.auth.complete(google(uid, `${uid}@x.com`)));
    return { ctx, res };
  }

  @test
  async logoutRevokes() {
    const { ctx, res } = await this.login("l1");
    await this.op("Auth.Logout", {}, ctx);
    assert.ok(!ctx.getSession().isLogged());
    await rejectsWith(() => this.op("Auth.Refresh", { refreshToken: res.refreshToken }), TokenInvalid);
  }

  @test
  async logoutAllowedWhilePending() {
    const ctx = await this.ctx();
    (this.auth as any).mfaMethods = () => ["totp"];
    await this.inContext(ctx, () => this.auth.complete(google("m1")));
    assert.ok(ctx.getSession().isPending());
    await rejectsWith(() => this.op("Auth.Idents", {}, ctx), { name: "Unauthorized" });
    await this.op("Auth.Logout", {}, ctx);
    assert.ok(!ctx.getSession().isPending());
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async refreshRotates() {
    const { res } = await this.login("r1");
    const next = await this.op("Auth.Refresh", { refreshToken: res.refreshToken });
    assert.ok(next.accessToken && next.refreshToken !== res.refreshToken);
    assert.strictEqual((next as any).session, undefined);
  }

  @test
  async listIdents() {
    const { ctx } = await this.login("i1");
    const list = await this.op("Auth.Idents", {}, ctx);
    assert.deepStrictEqual(list.map(i => `${i.providerUid}:${i.provider}`).sort(), ["i1:google", "i1@x.com:email"]);
    assert.ok(list.every(i => i.__profile === undefined && i.__tokens === undefined));
    // another user's idents are not listed
    const other = await this.login("i2");
    const list2 = await this.op("Auth.Idents", {}, other.ctx);
    assert.strictEqual(list2.length, 2);
  }

  @test
  async unlinkRules() {
    const { ctx } = await this.login("u1");
    await this.op("Auth.Unlink", { provider: "email", providerUid: "u1@x.com" }, ctx);
    assert.ok(!(await Ident.ref(Ident.key("u1@x.com", "email")).exists()));
    await rejectsWith(() => this.op("Auth.Unlink", { provider: "google", providerUid: "u1" }, ctx), LastLoginMethod);
    await rejectsWith(() => this.op("Auth.Unlink", { provider: "google", providerUid: "nope" }, ctx), {
      name: "NotFound"
    });
  }

  @test
  async unlinkKeepsAUsableLoginMethod() {
    // OAuth-only user: the email ident has no password behind it, it is no login method
    const { ctx } = await this.login("o1");
    await rejectsWith(() => this.op("Auth.Unlink", { provider: "google", providerUid: "o1" }, ctx), LastLoginMethod);
    assert.ok(await Ident.ref(Ident.key("o1", "google")).exists());
    // With a password the email ident is usable
    const user = await ctx.getCurrentUser<any>();
    await user.password.set("longenough");
    await user.save();
    await this.op("Auth.Unlink", { provider: "google", providerUid: "o1" }, ctx);
    assert.ok(!(await Ident.ref(Ident.key("o1", "google")).exists()));
  }

  @test
  async unlinkedEventHasNoSecrets() {
    const { ctx } = await this.login("ev1");
    const user = await ctx.getCurrentUser<any>();
    await user.password.set("longenough");
    await user.save();
    await runAsSystem(() =>
      Ident.ref(Ident.key("ev1", "google")).patch({ __tokens: { access: "secret" }, __profile: { name: "P" } } as any)
    );
    const events: any[] = [];
    this.auth.on("Authentication.Unlinked" as any, (evt: any) => {
      events.push(evt);
    });
    await this.op("Auth.Unlink", { provider: "google", providerUid: "ev1" }, ctx);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].ident.provider, "google");
    assert.strictEqual(events[0].ident.providerUid, "ev1");
    assert.strictEqual(events[0].ident.__tokens, undefined);
    assert.strictEqual(events[0].ident.__profile, undefined);
  }

  @test
  async unlinkKeepsPasswordLogin() {
    const { ctx } = await this.login("p1");
    const user = await ctx.getCurrentUser<any>();
    await user.password.set("longenough");
    await user.save();
    await rejectsWith(
      () => this.op("Auth.Unlink", { provider: "email", providerUid: "p1@x.com" }, ctx),
      LastLoginMethod
    );
  }

  @test
  async anonymousRefused() {
    await rejectsWith(() => this.op("Auth.Idents"), { name: "Unauthorized" });
    await rejectsWith(() => this.op("Auth.Logout"), { name: "Unauthorized" });
    await rejectsWith(() => this.op("Auth.Unlink", { provider: "a", providerUid: "b" }), { name: "Unauthorized" });
  }
}
