import { suite, test } from "@webda/test";
import * as assert from "assert";
import { RefreshToken, useService } from "@webda/core";
import { OAuthTest, registerTestOperations, unregisterTestOperations } from "./test/oauthtest.js";
import { OAuthCode } from "./models.model.js";
import { sha256 } from "./devicecode.js";

/** Every operation of Task.*: the consent keeps the glob */
const ALL_TASK = ["Task.Get", "Task.Update", "Task.Comment.Add"];

@suite
class TokenEndpointTest extends OAuthTest {
  /** @override */
  async beforeEach() {
    await super.beforeEach();
    registerTestOperations();
  }

  /** @override */
  async afterEach() {
    unregisterTestOperations();
    const params = useService<any>("OAuthServer").getParameters();
    params.accessTtl = undefined;
    params.refreshTtl = undefined;
    await super.afterEach();
  }

  /**
   * @param flow - result of consentFlow
   * @returns the token request exchanging its code
   */
  codeBody(flow: { code: string; verifier: string; redirectUri: string }): Record<string, string> {
    return {
      grant_type: "authorization_code",
      code: flow.code,
      code_verifier: flow.verifier,
      client_id: "app",
      redirect_uri: flow.redirectUri
    };
  }

  @test
  async codeExchangeEndToEnd() {
    const { code, verifier, redirectUri } = await this.consentFlow({
      scope: "Task.* offline_access",
      operations: ALL_TASK
    });
    const res = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: "app",
      redirect_uri: redirectUri
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.token_type, "Bearer");
    assert.strictEqual(res.body.scope, "Task.* offline_access");
    assert.strictEqual(res.body.expires_in, 900);
    assert.ok(res.body.refresh_token);
    assert.strictEqual(res.headers["Cache-Control"], "no-store");
    assert.strictEqual(res.headers["Pragma"], "no-cache");
    const claims = await useService("TokenService").verifyAccess(res.body.access_token);
    assert.strictEqual(claims.client_id, "app");
    assert.strictEqual(claims.sub, "u1");
    assert.strictEqual(claims.scope, "Task.* offline_access");
    // The family is recorded on the code and named after the client
    const stored = await OAuthCode.ref(sha256(code)).get();
    assert.strictEqual(stored.family, claims.fam);
    assert.ok(stored.usedAt);
    const refresh = await RefreshToken.ref({ hash: sha256(res.body.refresh_token) } as any).get();
    assert.strictEqual(refresh.name, "App");
    assert.strictEqual(refresh.clientId, "app");
  }

  @test
  async jsonBodyAccepted() {
    const flow = await this.consentFlow({ scope: "Task.*", operations: ["Task.Get"] });
    const res = await this.tokenRequest(this.codeBody(flow), true);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.access_token);
  }

  @test
  async noRefreshWithoutOfflineAccess() {
    const { code, verifier, redirectUri } = await this.consentFlow({ scope: "Task.*", operations: ["Task.Get"] });
    const res = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: "app",
      redirect_uri: redirectUri
    });
    assert.strictEqual(res.body.refresh_token, undefined);
    assert.strictEqual(res.body.scope, "Task.Get");
    // The access token stays valid, the stored refresh token of the family is unusable
    const claims = await useService("TokenService").verifyAccess(res.body.access_token);
    assert.ok(claims);
    for await (const t of RefreshToken.iterate("family = ?", [claims.fam])) {
      assert.ok(t.expiresAt < Date.now());
    }
  }

  @test
  async badExchanges() {
    const flow = await this.consentFlow({ scope: "Task.*", operations: ["Task.Get"] });
    const base = this.codeBody(flow);
    for (const bad of [
      { code_verifier: "wrong".padEnd(43, "x") },
      { client_id: "webda-cli" },
      { redirect_uri: "http://127.0.0.1:9/callback" },
      { code: "nope" }
    ]) {
      const res = await this.tokenRequest({ ...base, ...bad });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, "invalid_grant");
      assert.strictEqual(res.headers["Cache-Control"], "no-store");
      assert.strictEqual(res.headers["Pragma"], "no-cache");
    }
    assert.strictEqual(
      (await this.tokenRequest({ ...base, grant_type: "password" })).body.error,
      "unsupported_grant_type"
    );
  }

  @test
  async eachMismatchRejectsAFreshCode() {
    // Every check on its own, each on an unused code
    const cases: Record<string, string>[] = [
      { code_verifier: "wrong".padEnd(43, "x") },
      { code_verifier: "short" },
      { code_verifier: "x".repeat(129) },
      { code_verifier: "!".repeat(43) },
      { client_id: "webda-cli" },
      { redirect_uri: "http://127.0.0.1:9/callback" },
      { redirect_uri: "http://127.0.0.1:1234/callback?x" }
    ];
    for (const bad of cases) {
      const flow = await this.consentFlow({ scope: "Task.*", operations: ["Task.Get"] });
      const res = await this.tokenRequest({ ...this.codeBody(flow), ...bad });
      assert.strictEqual(res.status, 400, JSON.stringify(bad));
      assert.strictEqual(res.body.error, "invalid_grant", JSON.stringify(bad));
      assert.strictEqual(res.body.error_description, "Invalid authorization code");
      // The code is burnt: the right request fails too
      assert.strictEqual((await this.tokenRequest(this.codeBody(flow))).body.error, "invalid_grant");
    }
  }

  @test
  async missingParameters() {
    const flow = await this.consentFlow({ scope: "Task.*", operations: ["Task.Get"] });
    const base = this.codeBody(flow);
    for (const name of ["code", "code_verifier", "client_id", "redirect_uri"]) {
      const res = await this.tokenRequest({ ...base, [name]: undefined });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, "invalid_request", name);
    }
    assert.strictEqual((await this.tokenRequest({ ...base, grant_type: undefined })).body.error, "invalid_request");
    // Nothing above consumed the code
    assert.strictEqual((await this.tokenRequest(base)).status, 200);
    for (const name of ["refresh_token", "client_id"]) {
      const res = await this.tokenRequest({
        grant_type: "refresh_token",
        refresh_token: "r",
        client_id: "app",
        [name]: undefined
      });
      assert.strictEqual(res.body.error, "invalid_request", name);
    }
  }

  @test
  async malformedBodies() {
    const call = async (contentType: string, body: string) => {
      const { HttpContext, runWithContext, useRouter } = await import("@webda/core");
      const http = new HttpContext("test.webda.io", "POST", "/oauth/token", "http", 80, {
        "content-type": contentType
      });
      http.setBody(body);
      const ctx = await this.newWebContext<any>(http);
      await runWithContext(ctx, () => useRouter().execute(ctx));
      return {
        status: ctx.statusCode,
        body: JSON.parse(ctx.getResponseBody().toString()),
        headers: ctx.getResponseHeaders()
      };
    };
    for (const [type, body] of [
      ["application/json", "{not json"],
      ["application/json", "[1]"],
      ["text/plain", "grant_type=authorization_code"],
      ["application/x-www-form-urlencoded", "grant_type=refresh_token&grant_type=authorization_code"]
    ]) {
      const res = await call(type, body);
      assert.strictEqual(res.status, 400, `${type} ${body}`);
      assert.strictEqual(res.body.error, "invalid_request", `${type} ${body}`);
      assert.strictEqual(res.headers["Cache-Control"], "no-store");
    }
  }

  @test
  async codeReuseRevokesFamily() {
    const flow = await this.consentFlow({ scope: "Task.* offline_access", operations: ALL_TASK });
    const body = this.codeBody(flow);
    const [a, b] = await Promise.all([this.tokenRequest(body), this.tokenRequest(body)]);
    const ok = [a, b].filter(r => r.status === 200);
    assert.strictEqual(ok.length, 1);
    assert.strictEqual([a, b].find(r => r.status !== 200)!.body.error, "invalid_grant");
    const third = await this.tokenRequest(body);
    assert.strictEqual(third.body.error, "invalid_grant");
    assert.strictEqual(await useService("TokenService").verifyAccess(ok[0].body.access_token), undefined);
    const refresh = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: ok[0].body.refresh_token,
      client_id: "app"
    });
    assert.strictEqual(refresh.body.error, "invalid_grant");
  }

  @test
  async reuseWhileIssuingRevokesFamily() {
    // The second presentation runs entirely after the code is consumed and before the family is recorded: it cannot
    // revoke anything itself, the first exchange must notice it
    const flow = await this.consentFlow({ scope: "Task.* offline_access", operations: ALL_TASK });
    const server = useService<any>("OAuthServer");
    const original = server.issueTokens;
    let second: any;
    server.issueTokens = async (...args: any[]) => {
      second = await this.tokenRequest(this.codeBody(flow));
      return original.apply(server, args);
    };
    try {
      const first = await this.tokenRequest(this.codeBody(flow));
      assert.strictEqual(first.status, 200);
      assert.strictEqual(second.body.error, "invalid_grant");
      assert.strictEqual(await useService("TokenService").verifyAccess(first.body.access_token), undefined);
    } finally {
      server.issueTokens = original;
    }
  }

  @test
  async familyNotRecordedOnReusedCode() {
    // The code is marked reused while the tokens are issued: the conditional write of the family fails and the
    // exchange revokes the family itself, without reading the code back
    const flow = await this.consentFlow({ scope: "Task.* offline_access", operations: ALL_TASK });
    const server = useService<any>("OAuthServer");
    const original = server.issueTokens;
    server.issueTokens = async (...args: any[]) => {
      await OAuthCode.ref(sha256(flow.code)).patch({ reusedAt: Date.now() } as any);
      return original.apply(server, args);
    };
    try {
      const first = await this.tokenRequest(this.codeBody(flow));
      assert.strictEqual(first.status, 200);
      assert.strictEqual(await useService("TokenService").verifyAccess(first.body.access_token), undefined);
      assert.strictEqual((await OAuthCode.ref(sha256(flow.code)).get()).family, undefined);
    } finally {
      server.issueTokens = original;
    }
  }

  @test
  async sequentialReuseRevokesFamily() {
    const flow = await this.consentFlow({ scope: "Task.* offline_access", operations: ALL_TASK });
    const first = await this.tokenRequest(this.codeBody(flow));
    assert.strictEqual(first.status, 200);
    assert.ok(await useService("TokenService").verifyAccess(first.body.access_token));
    const again = await this.tokenRequest(this.codeBody(flow));
    assert.strictEqual(again.status, 400);
    assert.strictEqual(again.body.error, "invalid_grant");
    assert.strictEqual(await useService("TokenService").verifyAccess(first.body.access_token), undefined);
    const refresh = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: first.body.refresh_token,
      client_id: "app"
    });
    assert.strictEqual(refresh.body.error, "invalid_grant");
  }

  @test
  async expiredCode() {
    const flow = await this.consentFlow({ scope: "Task.*", operations: ["Task.Get"] });
    for await (const c of OAuthCode.iterate("hash != ''", []))
      await c.ref().patch({ expiresAt: Date.now() - 1 } as any);
    const res = await this.tokenRequest({
      grant_type: "authorization_code",
      code: flow.code,
      code_verifier: flow.verifier,
      client_id: "app",
      redirect_uri: flow.redirectUri
    });
    assert.strictEqual(res.body.error, "invalid_grant");
  }

  @test
  async refreshGrant() {
    const flow = await this.consentFlow({ scope: "Task.* offline_access", operations: ALL_TASK });
    const first = await this.tokenRequest({
      grant_type: "authorization_code",
      code: flow.code,
      code_verifier: flow.verifier,
      client_id: "app",
      redirect_uri: flow.redirectUri
    });
    const narrowed = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: first.body.refresh_token,
      client_id: "app",
      scope: "Task.Get offline_access"
    });
    assert.strictEqual(narrowed.status, 200);
    assert.strictEqual(narrowed.body.scope, "Task.Get offline_access");
    assert.strictEqual(narrowed.body.token_type, "Bearer");
    assert.strictEqual(narrowed.headers["Cache-Control"], "no-store");
    assert.ok(narrowed.body.refresh_token);
    assert.notStrictEqual(narrowed.body.refresh_token, first.body.refresh_token);
    const wider = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: narrowed.body.refresh_token,
      client_id: "app",
      scope: "User.*"
    });
    assert.strictEqual(wider.status, 400);
    assert.strictEqual(wider.body.error, "invalid_scope");
    const other = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: narrowed.body.refresh_token,
      client_id: "webda-cli"
    });
    assert.strictEqual(other.body.error, "invalid_grant");
    // Neither failure burnt the token; without scope the stored one is kept
    const same = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: narrowed.body.refresh_token,
      client_id: "app"
    });
    assert.strictEqual(same.body.scope, "Task.Get offline_access");
    // Reusing a rotated token revokes the family
    const reused = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: narrowed.body.refresh_token,
      client_id: "app"
    });
    assert.strictEqual(reused.body.error, "invalid_grant");
    assert.strictEqual(await useService("TokenService").verifyAccess(same.body.access_token), undefined);
  }

  @test
  async refreshScopeEdgeCases() {
    const flow = await this.consentFlow({ scope: "Task.* offline_access", operations: ALL_TASK });
    const first = await this.tokenRequest(this.codeBody(flow));
    const refresh = (extra: Record<string, string>) =>
      this.tokenRequest({
        grant_type: "refresh_token",
        refresh_token: first.body.refresh_token,
        client_id: "app",
        ...extra
      });
    // No operation left, or a malformed scope
    assert.strictEqual((await refresh({ scope: "offline_access" })).body.error, "invalid_scope");
    assert.strictEqual((await refresh({ scope: "Task.?" })).body.error, "invalid_scope");
    assert.strictEqual((await refresh({ scope: "x".repeat(2000) })).body.error, "invalid_scope");
    // Unknown client
    const unknown = await refresh({ client_id: "nobody" });
    assert.strictEqual(unknown.status, 401);
    assert.strictEqual(unknown.body.error, "invalid_client");
    // Dropping offline_access: no new refresh token
    const narrowed = await refresh({ scope: "Task.Get" });
    assert.strictEqual(narrowed.status, 200);
    assert.strictEqual(narrowed.body.scope, "Task.Get");
    assert.strictEqual(narrowed.body.refresh_token, undefined);
    assert.ok(await useService("TokenService").verifyAccess(narrowed.body.access_token));
    // Garbage refresh token
    const garbage = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: "garbage",
      client_id: "app"
    });
    assert.strictEqual(garbage.body.error, "invalid_grant");
  }

  @test
  async firstPartyRefreshTokenRefused() {
    const session = (await this.browser()).ctx.getSession();
    session.login("u1", "u1@email", { provider: "email", amr: ["pwd"] });
    const tokens = await useService("TokenService").issue(session);
    const res = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: "app"
    });
    assert.strictEqual(res.body.error, "invalid_grant");
  }

  @test
  async lifetimesFromParameters() {
    const params = useService<any>("OAuthServer").getParameters();
    params.accessTtl = 120;
    params.refreshTtl = 600;
    const flow = await this.consentFlow({ scope: "Task.* offline_access", operations: ALL_TASK });
    const first = await this.tokenRequest(this.codeBody(flow));
    assert.strictEqual(first.body.expires_in, 120);
    const stored = await RefreshToken.ref({ hash: sha256(first.body.refresh_token) } as any).get();
    assert.ok(stored.expiresAt <= Date.now() + 600_000);
    const second = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: first.body.refresh_token,
      client_id: "app"
    });
    assert.strictEqual(second.body.expires_in, 120);
  }

  @test
  async deviceGrantRejectsMalformedCode() {
    const res = await this.tokenRequest({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: "x",
      client_id: "webda-cli"
    });
    assert.strictEqual(res.body.error, "invalid_grant");
  }

  @test
  async internalErrorsAreNotLeaked() {
    const server = useService<any>("OAuthServer");
    const original = server.exchangeCode;
    server.exchangeCode = async () => {
      throw new Error("secret internal detail");
    };
    try {
      const res = await this.tokenRequest({ grant_type: "authorization_code" });
      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.body.error, "server_error");
      assert.ok(!JSON.stringify(res.body).includes("secret"));
      assert.strictEqual(res.headers["Cache-Control"], "no-store");
    } finally {
      server.exchangeCode = original;
    }
  }
}
