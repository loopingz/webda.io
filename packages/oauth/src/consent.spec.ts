import { suite, test } from "@webda/test";
import * as assert from "assert";
import { listOperations, useRouter, useService } from "@webda/core";
import { OAuthTest, query, registerTestOperations, unregisterTestOperations } from "./test/oauthtest.js";
import { OAuthCode, OAuthGrant } from "./models.model.js";
import { sha256 } from "./devicecode.js";
import { PENDING_COOKIE } from "./oauthserver.service.js";

@suite
class ConsentTest extends OAuthTest {
  /** @override */
  async beforeEach() {
    await super.beforeEach();
    registerTestOperations();
    // The store outlives a test: forget the remembered consents
    for (const uuid of ["u1:app", "u2:app", "u1:webda-cli"]) {
      if (await OAuthGrant.ref(uuid).exists()) await OAuthGrant.ref(uuid).delete();
    }
  }

  /** @override */
  async afterEach() {
    unregisterTestOperations();
    await super.afterEach();
  }

  @test
  async globKeptOnlyWhenEveryOperationIsSelected() {
    const b = await this.browser();
    await this.login(b, "u1");
    // Non-admin u1 selects everything offered under `*`: Admin.Purge was never shown, so `*` is not granted
    await this.authorize(b, { scope: "*", client_id: "webda-cli" });
    const req = await this.op(b, "OAuth.Consent.Get");
    const offered = req.operations.flatMap(g => g.ids.map(i => i.id));
    assert.ok(!offered.includes("Admin.Purge"));
    const all = await this.op(b, "OAuth.Consent.Decide", { allow: true, operations: offered, csrf: req.csrf });
    const scope = (await OAuthCode.ref(sha256(query(all.redirect).code)).get()).scope.split(" ");
    assert.ok(!scope.includes("*"), scope.join(" "));
    assert.ok(!scope.some(t => t.includes("*")), scope.join(" "));
    assert.deepStrictEqual([...scope].sort(), [...offered].sort());
    // Every operation of Task.* is callable and selected: the glob is kept
    await this.authorize(b, { scope: "Task.*", client_id: "webda-cli" });
    const task = await this.op(b, "OAuth.Consent.Get");
    const ids = task.operations[0].ids.map(i => i.id);
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ids, csrf: task.csrf });
    assert.strictEqual((await OAuthCode.ref(sha256(query(redirect).code)).get()).scope, "Task.*");
  }

  @test
  async consentListsOnlyCallableRequestedOperations() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.* Admin.* offline_access", client_id: "webda-cli" });
    const req = await this.op(b, "OAuth.Consent.Get");
    assert.strictEqual(req.flow, "code");
    assert.strictEqual(req.client.name, "Webda CLI");
    assert.strictEqual(req.client.id, "webda-cli");
    assert.strictEqual(req.user.id, "u1");
    assert.deepStrictEqual(
      req.operations.map(g => g.group),
      ["Task"]
    );
    assert.deepStrictEqual(
      req.operations[0].ids.map(i => i.id),
      ["Task.Get", "Task.Update", "Task.Comment.Add"]
    );
    assert.strictEqual(req.operations[0].ids[0].summary, "Read a task");
    assert.ok(req.operations[0].ids.every(i => i.preselected));
    assert.strictEqual(req.offlineAccess, true);
    assert.strictEqual(req.rememberable, true);
    assert.strictEqual(typeof req.csrf, "string");
  }

  @test
  async denyRedirectsWithAccessDenied() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.*" });
    const { csrf } = await this.op(b, "OAuth.Consent.Get");
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", { allow: false, operations: [], csrf });
    assert.deepStrictEqual(query(redirect), { error: "access_denied", state: "s" });
    assert.ok(redirect.startsWith("http://127.0.0.1:1234/callback?"));
    // The pending request is gone: no second decision
    assert.strictEqual(b.jar[PENDING_COOKIE], undefined);
    await assert.rejects(() => this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf }));
  }

  @test
  async csrfRequired() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.*" });
    await assert.rejects(
      () => this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf: "wrong" }),
      /403|Forbidden/
    );
    // Missing: rejected by the input schema
    await assert.rejects(() => this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"] }), /400/);
    await assert.rejects(
      () => this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf: "" }),
      /403|Forbidden/
    );
    // The CSRF token is bound to the pending request of this browser, not to another one
    const other = await this.browser();
    await this.login(other, "u1");
    await this.authorize(other, { scope: "Task.*" });
    const { csrf } = await this.op(other, "OAuth.Consent.Get");
    await assert.rejects(
      () => this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf }),
      /403|Forbidden/
    );
    // A rejected decision keeps the pending request
    assert.ok(b.jar[PENDING_COOKIE]);
  }

  @test
  async allowNarrowsAndRemembers() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.* offline_access" });
    const { csrf } = await this.op(b, "OAuth.Consent.Get");
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", {
      allow: true,
      operations: ["Task.Get", "User.Me"],
      csrf,
      remember: true
    });
    assert.ok(query(redirect).code);
    assert.strictEqual(query(redirect).state, "s");
    const grant = await OAuthGrant.ref({ uuid: "u1:app" } as any).get();
    assert.strictEqual(grant.scope, "Task.Get offline_access"); // User.Me dropped: not requested
    assert.strictEqual(grant.userId, "u1");
    assert.strictEqual(grant.clientId, "app");
    const ttl = grant.expiresAt - Date.now();
    assert.ok(ttl > 90 * 24 * 3600 * 1000 - 60000 && ttl <= 90 * 24 * 3600 * 1000, String(ttl));
    // second authorize skips the page
    const again = await this.authorize(b, { scope: "Task.Get" });
    assert.ok(query(again.headers.Location).code);
    // wider request shows the page with Task.Get preselected only
    const wider = await this.authorize(b, { scope: "Task.*" });
    assert.strictEqual(wider.headers.Location, "http://test.webda.io/oauth/consent");
    const req = await this.op(b, "OAuth.Consent.Get");
    assert.deepStrictEqual(
      req.operations[0].ids.filter(i => i.preselected).map(i => i.id),
      ["Task.Get"]
    );
    // prompt=consent always shows the page; prompt=none errors
    assert.strictEqual(
      (await this.authorize(b, { scope: "Task.Get", prompt: "consent" })).headers.Location,
      "http://test.webda.io/oauth/consent"
    );
    assert.strictEqual(
      query((await this.authorize(b, { scope: "Task.*", prompt: "none" })).headers.Location).error,
      "consent_required"
    );
  }

  @test
  async codeCarriesTheGrantedScopeAndIdentity() {
    const b = await this.browser();
    await this.login(b, "u1");
    const challenge = (await this.authorize(b, { scope: "Task.*" })).ctx.parameter("code_challenge");
    const { csrf } = await this.op(b, "OAuth.Consent.Get");
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", {
      allow: true,
      operations: ["Task.Get", "Task.Update", "Task.Comment.Add"],
      csrf
    });
    const code = query(redirect).code;
    const stored = await OAuthCode.ref(sha256(code)).get();
    // Every operation of the glob selected: the glob is kept; offline_access was not requested
    assert.strictEqual(stored.scope, "Task.*");
    assert.strictEqual(stored.clientId, "app");
    assert.strictEqual(stored.redirectUri, "http://127.0.0.1:1234/callback");
    assert.strictEqual(stored.codeChallenge, challenge);
    assert.deepStrictEqual(stored.identity, {
      userId: "u1",
      identId: "u1@email",
      provider: "email",
      amr: ["pwd"],
      mfa: "none"
    });
    const ttl = stored.expiresAt - Date.now();
    assert.ok(ttl > 55000 && ttl <= 60000, String(ttl));
    // Not remembered without `remember`
    assert.strictEqual(await OAuthGrant.ref("u1:app").exists(), false);
  }

  @test
  async neverGrantsMoreThanRequestedOrCallable() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.Get Admin.*", client_id: "webda-cli" });
    const { csrf } = await this.op(b, "OAuth.Consent.Get");
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", {
      allow: true,
      operations: ["Task.Get", "Task.Update", "Admin.Purge", "*", "Task.*", "offline_access"],
      csrf,
      remember: true
    });
    const stored = await OAuthCode.ref(sha256(query(redirect).code)).get();
    // Task.Update not requested, Admin.Purge not callable, globs are not operation ids
    assert.strictEqual(stored.scope, "Task.Get");
    assert.strictEqual((await OAuthGrant.ref("u1:webda-cli").get()).scope, "Task.Get");
  }

  @test
  async offlineAccessOnlyWhenRequested() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.Get" });
    const req = await this.op(b, "OAuth.Consent.Get");
    assert.strictEqual(req.offlineAccess, false);
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", {
      allow: true,
      operations: ["Task.Get", "offline_access"],
      csrf: req.csrf
    });
    assert.strictEqual((await OAuthCode.ref(sha256(query(redirect).code)).get()).scope, "Task.Get");
  }

  @test
  async allowWithoutOperation() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.* offline_access" });
    const { csrf } = await this.op(b, "OAuth.Consent.Get");
    await assert.rejects(() => this.op(b, "OAuth.Consent.Decide", { allow: true, operations: [], csrf }), /400|Bad/);
    // offline_access alone grants nothing; the user can still decide
    assert.ok(b.jar[PENDING_COOKIE]);
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", { allow: false, operations: [], csrf });
    assert.strictEqual(query(redirect).error, "access_denied");
  }

  @test
  async rememberedGrantIsPerUserAndClient() {
    await OAuthGrant.create({
      uuid: "u2:app",
      userId: "u2",
      clientId: "app",
      scope: "Task.*",
      createdAt: 0,
      lastUsedAt: 0,
      expiresAt: Date.now() + 100000
    } as any);
    const b = await this.browser();
    await this.login(b, "u1");
    assert.strictEqual(
      (await this.authorize(b, { scope: "Task.Get" })).headers.Location,
      "http://test.webda.io/oauth/consent"
    );
    // A later decision with `remember` replaces the remembered scope
    const { csrf } = await this.op(b, "OAuth.Consent.Get");
    await this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf, remember: true });
    const b2 = await this.browser();
    await this.login(b2, "u2");
    await this.authorize(b2, { scope: "Task.*", prompt: "consent" });
    const { csrf: csrf2 } = await this.op(b2, "OAuth.Consent.Get");
    await this.op(b2, "OAuth.Consent.Decide", {
      allow: true,
      operations: ["Task.Update"],
      csrf: csrf2,
      remember: true
    });
    const grant = await OAuthGrant.ref("u2:app").get();
    assert.strictEqual(grant.scope, "Task.Update");
    assert.strictEqual(grant.createdAt, 0);
    assert.strictEqual((await OAuthGrant.ref("u1:app").get()).scope, "Task.Get");
  }

  @test
  async rememberDisabled() {
    useService<any>("OAuthServer").getParameters().rememberConsent = false;
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.*" });
    const req = await this.op(b, "OAuth.Consent.Get");
    assert.strictEqual(req.rememberable, false);
    await this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf: req.csrf, remember: true });
    assert.strictEqual(await OAuthGrant.ref("u1:app").exists(), false);
  }

  @test
  async expiredGrantIgnored() {
    await OAuthGrant.create({
      uuid: "u1:app",
      userId: "u1",
      clientId: "app",
      scope: "*",
      createdAt: 0,
      lastUsedAt: 0,
      expiresAt: Date.now() - 1
    } as any);
    const b = await this.browser();
    await this.login(b, "u1");
    assert.strictEqual(
      (await this.authorize(b, { scope: "Task.*" })).headers.Location,
      "http://test.webda.io/oauth/consent"
    );
  }

  @test
  async oauthOperationsAreNeverOffered() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "*", client_id: "webda-cli" });
    const req = await this.op(b, "OAuth.Consent.Get");
    const groups = req.operations.map(g => g.group);
    assert.ok(groups.includes("Task") && groups.includes("User"), groups.join(","));
    assert.ok(!groups.includes("OAuth"), groups.join(","));
    assert.ok(!groups.includes("Admin"), groups.join(","));
  }

  @test
  async nothingToGrant() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Admin.*", client_id: "webda-cli" });
    const req = await this.op(b, "OAuth.Consent.Get");
    assert.deepStrictEqual(req.operations, []);
  }

  @test
  async requiresTheBrowserSessionOfThePendingUser() {
    // Without a pending request
    const fresh = await this.browser();
    await this.login(fresh, "u1");
    await assert.rejects(() => this.op(fresh, "OAuth.Consent.Get"), /400|Bad/);
    // Not logged in
    const b = await this.browser();
    await this.authorize(b, { scope: "Task.*" });
    await assert.rejects(() => this.op(b, "OAuth.Consent.Get"), /401|Unauthorized/);
    // Logged in after the request: the consent binds to that user
    await this.login(b, "u1");
    const { csrf } = await this.op(b, "OAuth.Consent.Get");
    // Another user logs in on the same browser: the request is refused
    await this.login(b, "u2");
    await assert.rejects(() => this.op(b, "OAuth.Consent.Get"), /403|Forbidden/);
    await assert.rejects(
      () => this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf }),
      /403|Forbidden/
    );
    // A bearer (scoped) session cannot consent
    await this.login(b, "u1");
    b.ctx.getSession().scopes = ["*"];
    await assert.rejects(() => this.op(b, "OAuth.Consent.Get"), /401|Unauthorized/);
  }

  @test
  async pendingOfALoggedInUserIsBound() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.*" });
    await this.login(b, "u2");
    await assert.rejects(() => this.op(b, "OAuth.Consent.Get"), /403|Forbidden/);
  }
}

@suite
class ConsentRestTest extends OAuthTest {
  /** @override */
  getTestConfiguration(): any {
    const config = super.getTestConfiguration();
    config.services.REST = { type: "Webda/RESTOperationsTransport" };
    return config;
  }

  @test
  async restRoutesSitUnderThePendingCookiePath() {
    const ops = listOperations();
    assert.deepStrictEqual(ops["OAuth.Consent.Get"].rest, { method: "get", path: "oauth/consent/request" });
    assert.deepStrictEqual(ops["OAuth.Consent.Decide"].rest, { method: "post", path: "oauth/consent/decide" });
    const routes = useRouter().getRoutes();
    for (const [path, method] of [
      ["/oauth/consent/request", "GET"],
      ["/oauth/consent/decide", "POST"]
    ]) {
      const route = Object.keys(routes).find(r => r === path);
      assert.ok(route, `${path} in ${Object.keys(routes).join(",")}`);
      assert.ok(JSON.stringify(routes[route]).includes(method), path);
    }
    // Through the router, like a browser: the pending cookie (path /oauth) reaches the operations
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.*" });
    assert.strictEqual(b.paths[PENDING_COOKIE], "/oauth");
    const res = await this.get(b, "/oauth/consent/request");
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.client.id, "app");
  }
}
