import { suite, test } from "@webda/test";
import * as assert from "assert";
import { expand, listOperations, registerOperation, useInstanceStorage, useRouter, useService } from "@webda/core";
import { OAuthTest, query, registerTestOperations, unregisterTestOperations } from "./test/oauthtest.js";
import { OAuthCode, OAuthGrant, OAuthRegisteredClient } from "./models.model.js";
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

  /**
   * @param uuid - client id
   * @param redirect - registered redirect URI
   * @returns the stored registered client
   */
  async registered(uuid: string, redirect: string): Promise<OAuthRegisteredClient> {
    const now = Date.now();
    if (await OAuthRegisteredClient.ref(uuid).exists()) await OAuthRegisteredClient.ref(uuid).delete();
    return OAuthRegisteredClient.create({
      uuid,
      name: "Registered",
      redirect_uris: [redirect],
      scope: "Task.*",
      createdAt: now,
      expiresAt: now + 86400_000,
      ip: "127.0.0.1"
    } as any);
  }

  @test
  async consentMarksRegisteredUnverified() {
    const b = await this.browser();
    await this.login(b, "u1");
    for (const [id, redirect, host] of [
      ["dcr_loop", "http://127.0.0.1:1234/callback", "local application"],
      ["dcr_priv", "com.example.app:/cb", "local application"],
      ["dcr_web", "https://claude.ai/callback", "claude.ai"]
    ]) {
      await this.registered(id, redirect);
      await this.authorize(b, { client_id: id, redirect_uri: redirect, scope: "Task.Get" });
      const req = await this.op(b, "OAuth.Consent.Get");
      assert.strictEqual(req.client.verified, false, id);
      assert.strictEqual(req.client.host, host, id);
    }
  }

  @test
  async staticClientVerified() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.Get" });
    const req = await this.op(b, "OAuth.Consent.Get");
    assert.strictEqual(req.client.verified, true);
    assert.strictEqual(req.client.host, undefined);
  }

  @test
  async stepUpKeepsEarlierScope() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.Get" });
    let req = await this.op(b, "OAuth.Consent.Get");
    await this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf: req.csrf, remember: true });
    // Step-up: Task.Update is not covered, the consent page is shown
    const step = await this.authorize(b, { scope: "Task.Update" });
    assert.strictEqual(step.headers.Location, "http://test.webda.io/oauth/consent");
    req = await this.op(b, "OAuth.Consent.Get");
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", {
      allow: true,
      operations: ["Task.Update"],
      csrf: req.csrf,
      remember: true
    });
    const scope = (await OAuthCode.ref(sha256(query(redirect).code)).get()).scope.split(" ");
    assert.deepStrictEqual(scope.sort(), ["Task.Get", "Task.Update"]);
    const grant = await OAuthGrant.ref({ uuid: "u1:app" } as any).get();
    assert.deepStrictEqual(grant.scope.split(" ").sort(), ["Task.Get", "Task.Update"]);
  }

  @test
  async rememberedOperationsAreAlreadyAllowed() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.Get" });
    let req = await this.op(b, "OAuth.Consent.Get");
    await this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf: req.csrf, remember: true });
    await this.authorize(b, { scope: "Task.Get Task.Update" });
    req = await this.op(b, "OAuth.Consent.Get");
    const ids = Object.fromEntries(req.operations.flatMap(g => g.ids).map(i => [i.id, i]));
    assert.strictEqual(ids["Task.Get"].alreadyAllowed, true);
    assert.ok(!ids["Task.Update"].alreadyAllowed);
    // The page renders them disabled
    const script = (await this.get(b, "/oauth/consent")).text;
    assert.ok(script.includes("box.disabled = op.alreadyAllowed === true"));
    assert.ok(script.includes("(already allowed)"));
    // Unticking is impossible: only the new operation is sent, the token still carries the remembered one
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", {
      allow: true,
      operations: ["Task.Update"],
      csrf: req.csrf
    });
    const scope = (await OAuthCode.ref(sha256(query(redirect).code)).get()).scope.split(" ");
    assert.deepStrictEqual(scope.sort(), ["Task.Get", "Task.Update"]);
  }

  @test
  async rememberedOperationsOutsideRequestAreListed() {
    const b = await this.browser();
    await this.login(b, "u1");
    await this.authorize(b, { scope: "Task.Get offline_access" });
    let req = await this.op(b, "OAuth.Consent.Get");
    await this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf: req.csrf, remember: true });
    // Step-up asking only Task.Update: the remembered Task.Get is carried into the token, so it is shown
    await this.authorize(b, { scope: "Task.Update" });
    req = await this.op(b, "OAuth.Consent.Get");
    const ids = Object.fromEntries(req.operations.flatMap(g => g.ids).map(i => [i.id, i]));
    assert.deepStrictEqual(Object.keys(ids).sort(), ["Task.Get", "Task.Update"]);
    assert.strictEqual(ids["Task.Get"].alreadyAllowed, true);
    assert.strictEqual(ids["Task.Get"].preselected, true);
    assert.ok(!ids["Task.Update"].alreadyAllowed);
    // offline_access is never carried over
    assert.strictEqual(req.offlineAccess, false);
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", {
      allow: true,
      operations: ["Task.Update"],
      csrf: req.csrf
    });
    const scope = (await OAuthCode.ref(sha256(query(redirect).code)).get()).scope.split(" ");
    assert.deepStrictEqual(scope.sort(), ["Task.Get", "Task.Update"]);
  }

  @test
  async rememberedOperationsOutsideAllowedScopesAreNotListed() {
    const b = await this.browser();
    await this.login(b, "u1");
    await OAuthGrant.create({
      uuid: "u1:app",
      userId: "u1",
      clientId: "app",
      scope: "Task.*",
      createdAt: 0,
      lastUsedAt: 0,
      expiresAt: Date.now() + 100000
    } as any);
    const params = useService<any>("OAuthServer").getParameters();
    const previous = params.clients.app.allowedScopes;
    try {
      params.clients.app.allowedScopes = "Task.Update Task.Get offline_access";
      await this.authorize(b, { scope: "Task.Update", prompt: "consent" });
      const req = await this.op(b, "OAuth.Consent.Get");
      const ids = req.operations.flatMap(g => g.ids).map(i => i.id);
      assert.deepStrictEqual(ids.sort(), ["Task.Get", "Task.Update"]);
    } finally {
      params.clients.app.allowedScopes = previous;
    }
  }

  @test
  async stepUpHonoursNarrowedAllowedScopes() {
    const b = await this.browser();
    await this.login(b, "u1");
    await OAuthGrant.create({
      uuid: "u1:app",
      userId: "u1",
      clientId: "app",
      scope: "Task.*",
      createdAt: 0,
      lastUsedAt: 0,
      expiresAt: Date.now() + 100000
    } as any);
    const params = useService<any>("OAuthServer").getParameters();
    const previous = params.clients.app.allowedScopes;
    try {
      params.clients.app.allowedScopes = "Task.Update offline_access";
      await this.authorize(b, { scope: "Task.Update", prompt: "consent" });
      const req = await this.op(b, "OAuth.Consent.Get");
      const { redirect } = await this.op(b, "OAuth.Consent.Decide", {
        allow: true,
        operations: ["Task.Update"],
        csrf: req.csrf
      });
      const scope = (await OAuthCode.ref(sha256(query(redirect).code)).get()).scope.split(" ");
      assert.deepStrictEqual(scope, ["Task.Update"]);
    } finally {
      params.clients.app.allowedScopes = previous;
    }
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
    // The fully selected groups are granted as group globs, the others as ids
    assert.ok(scope.includes("Task.*") && scope.includes("User.*"), scope.join(" "));
    assert.ok(!scope.includes("Admin.*"), scope.join(" "));
    assert.deepStrictEqual(expand(scope, Object.keys(listOperations())).sort(), [...offered].sort());
    // Every operation of Task.* is callable and selected: the glob is kept
    await this.authorize(b, { scope: "Task.*", client_id: "webda-cli" });
    const task = await this.op(b, "OAuth.Consent.Get");
    const ids = task.operations[0].ids.map(i => i.id);
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ids, csrf: task.csrf });
    assert.strictEqual((await OAuthCode.ref(sha256(query(redirect).code)).get()).scope, "Task.*");
  }

  @test
  async rememberedWildcardSkipsConsentForNonAdmin() {
    // Many operations: the granted scope must not list them one by one
    const bulk = Array.from({ length: 300 }, (_, i) => `Bulk.Operation${i}`);
    for (const id of bulk) registerOperation(id, { service: "OAuthServer", method: "metadata" });
    try {
      const b = await this.browser();
      await this.login(b, "u1");
      const redirectUri = "http://127.0.0.1:1234/callback";
      const exchange = async (location: string) => {
        const res = await this.tokenRequest({
          grant_type: "authorization_code",
          code: query(location).code,
          code_verifier: b.verifier,
          client_id: "webda-cli",
          redirect_uri: redirectUri
        });
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        return res.body;
      };
      // First authorization: the consent page, everything offered selected and remembered
      const first = await this.authorize(b, { scope: "* offline_access", client_id: "webda-cli" });
      assert.strictEqual(first.headers.Location, "http://test.webda.io/oauth/consent");
      const req = await this.op(b, "OAuth.Consent.Get");
      const offered = req.operations.flatMap(g => g.ids.map(i => i.id));
      assert.ok(!offered.includes("Admin.Purge"));
      const { redirect } = await this.op(b, "OAuth.Consent.Decide", {
        allow: true,
        operations: offered,
        csrf: req.csrf,
        remember: true
      });
      const tokens = await exchange(redirect);
      const scope = tokens.scope.split(" ");
      // Group globs, never `*` (Admin.Purge was not granted) nor the list of the operation ids
      assert.ok(scope.includes("Bulk.*") && scope.includes("Task.*") && scope.includes("User.*"), tokens.scope);
      assert.ok(!scope.includes("*") && !scope.includes("Admin.*"), tokens.scope);
      assert.ok(scope.includes("offline_access"), tokens.scope);
      assert.ok(tokens.scope.length < 300, `${tokens.scope.length}: ${tokens.scope}`);
      assert.ok(tokens.access_token.length < 2048, `access token of ${tokens.access_token.length} bytes`);
      // Second authorization: the remembered consent answers `*`, the consent page is skipped
      const again = await this.authorize(b, { scope: "* offline_access", client_id: "webda-cli" });
      assert.ok(again.headers.Location.startsWith(redirectUri), again.headers.Location);
      const second = await exchange(again.headers.Location);
      assert.deepStrictEqual(second.scope.split(" ").sort(), [...scope].sort());
      // prompt=none is answered as well
      const silent = await this.authorize(b, { scope: "* offline_access", client_id: "webda-cli", prompt: "none" });
      assert.ok(query(silent.headers.Location).code, silent.headers.Location);
      // A new callable operation is not covered by the remembered consent: asked again
      registerOperation("Other.New", { service: "OAuthServer", method: "metadata" });
      try {
        const changed = await this.authorize(b, { scope: "* offline_access", client_id: "webda-cli" });
        assert.strictEqual(changed.headers.Location, "http://test.webda.io/oauth/consent");
      } finally {
        delete useInstanceStorage().operations["Other.New"];
      }
    } finally {
      for (const id of bulk) delete useInstanceStorage().operations[id];
    }
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
    // A later decision with `remember` adds to the remembered scope
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
    assert.strictEqual(grant.scope, "Task.* Task.Update");
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
  async browserOperationsAreServedByTheOAuthServerOnly() {
    const ops = listOperations();
    for (const id of ["OAuth.Consent.Get", "OAuth.Consent.Decide", "OAuth.Device.Lookup"]) {
      // Hidden from every transport: the REST transport does not expose them a second time
      assert.strictEqual(ops[id].hidden, true, id);
      assert.strictEqual(ops[id].rest, undefined, id);
    }
    const routes = useRouter().getRoutes();
    for (const [path, method] of [
      ["/oauth/consent/request", "GET"],
      ["/oauth/consent/decide", "POST"],
      ["/oauth/device/lookup", "POST"]
    ]) {
      assert.strictEqual(routes[path]?.length, 1, `${path} in ${Object.keys(routes).join(",")}`);
      assert.ok(JSON.stringify(routes[path]).includes(method), path);
    }
    // Not exposed by the REST transport under its default path either
    assert.strictEqual(routes["/oauth/consent/get"], undefined);
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
