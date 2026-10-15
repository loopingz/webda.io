import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { RefreshToken, useService } from "@webda/core";
import { OAuthTest, registerTestOperations, unregisterTestOperations } from "./test/oauthtest.js";
import { OAuthCode, OAuthDeviceCode, OAuthGrant } from "./models.model.js";

@suite
class RevokeTest extends OAuthTest {
  /** @override */
  async beforeEach() {
    await super.beforeEach();
    registerTestOperations();
    // The store outlives a test: start from no OAuth record
    for await (const t of RefreshToken.iterate("hash != ''", [])) await t.ref().delete();
    for await (const c of OAuthCode.iterate("hash != ''", [])) await c.ref().delete();
    for await (const d of OAuthDeviceCode.iterate("userCode != ''", [])) await d.ref().delete();
    for await (const g of OAuthGrant.iterate("uuid != ''", [])) await g.ref().delete();
  }

  /** @override */
  async afterEach() {
    unregisterTestOperations();
    await super.afterEach();
  }

  @test
  async revokeRefreshTokenKillsAccessToken() {
    const t = await this.fullTokens({ scope: "Task.* offline_access" });
    const res = await this.form("/oauth/revoke", { token: t.refresh_token, client_id: "app" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers["Cache-Control"], "no-store");
    assert.strictEqual(await useService("TokenService").verifyAccess(t.access_token), undefined);
    assert.strictEqual(
      (await this.tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: "app" })).body
        .error,
      "invalid_grant"
    );
  }

  @test
  async revokeAccessTokenAndUnknownToken() {
    const t = await this.fullTokens({ scope: "Task.* offline_access" });
    assert.strictEqual((await this.form("/oauth/revoke", { token: t.access_token, client_id: "app" })).status, 200);
    assert.strictEqual(await useService("TokenService").verifyAccess(t.access_token), undefined);
    // The access token revokes its family: the refresh token is dead too
    assert.strictEqual(
      (await this.tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: "app" })).body
        .error,
      "invalid_grant"
    );
    assert.strictEqual((await this.form("/oauth/revoke", { token: "garbage", client_id: "app" })).status, 200);
  }

  @test
  async revokeJsonBody() {
    const t = await this.fullTokens({ scope: "Task.* offline_access" });
    const res = await this.form(
      "/oauth/revoke",
      { token: t.refresh_token, token_type_hint: "refresh_token", client_id: "app" },
      true
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await useService("TokenService").verifyAccess(t.access_token), undefined);
  }

  @test
  async revokeOtherClientsTokenIgnored() {
    const t = await this.fullTokens({ scope: "Task.* offline_access" });
    assert.strictEqual(
      (await this.form("/oauth/revoke", { token: t.refresh_token, client_id: "webda-cli" })).status,
      200
    );
    assert.strictEqual(
      (await this.form("/oauth/revoke", { token: t.access_token, client_id: "webda-cli" })).status,
      200
    );
    assert.ok(await useService("TokenService").verifyAccess(t.access_token));
  }

  @test
  async revokeRequiresTokenAndClient() {
    const t = await this.fullTokens({ scope: "Task.* offline_access" });
    const missing = await this.form("/oauth/revoke", { token: t.refresh_token });
    assert.strictEqual(missing.status, 400);
    assert.strictEqual(missing.body.error, "invalid_request");
    assert.strictEqual((await this.form("/oauth/revoke", { client_id: "app" })).body.error, "invalid_request");
    const unknown = await this.form("/oauth/revoke", { token: t.refresh_token, client_id: "nope" });
    assert.strictEqual(unknown.status, 401);
    assert.strictEqual(unknown.body.error, "invalid_client");
    assert.ok(await useService("TokenService").verifyAccess(t.access_token));
  }

  @test
  async sessionsGrantsRevokeForget() {
    const b = await this.browser();
    const t = await this.fullTokens({ scope: "Task.* offline_access", browser: b, remember: true });
    const sessions = await this.op(b, "OAuth.Sessions");
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].clientId, "app");
    assert.strictEqual(sessions[0].family, t.family);
    assert.strictEqual(sessions[0].name, "App");
    assert.strictEqual(sessions[0].scope, "Task.* offline_access");
    const grants = await this.op(b, "OAuth.Grants");
    assert.strictEqual(grants.length, 1);
    assert.strictEqual(grants[0].clientId, "app");
    assert.strictEqual(grants[0].scope, "Task.* offline_access");
    await this.op(b, "OAuth.Forget", { clientId: "app" });
    assert.strictEqual((await this.op(b, "OAuth.Grants")).length, 0);
    assert.ok(await useService("TokenService").verifyAccess(t.access_token), "forget keeps tokens");
    await this.op(b, "OAuth.Revoke", { clientId: "app" });
    assert.strictEqual(await useService("TokenService").verifyAccess(t.access_token), undefined);
    assert.strictEqual((await this.op(b, "OAuth.Sessions")).length, 0);
    // another user's family cannot be revoked
    const other = await this.fullTokens({ scope: "Task.* offline_access", user: "u2" });
    await this.op(b, "OAuth.Revoke", { family: other.family });
    assert.ok(await useService("TokenService").verifyAccess(other.access_token));
  }

  @test
  async revokeOneFamily() {
    const b = await this.browser();
    const first = await this.fullTokens({ scope: "Task.* offline_access", browser: b });
    const second = await this.fullTokens({ scope: "Task.* offline_access", browser: b });
    assert.strictEqual((await this.op(b, "OAuth.Sessions")).length, 2);
    await this.op(b, "OAuth.Revoke", { family: first.family });
    assert.strictEqual(await useService("TokenService").verifyAccess(first.access_token), undefined);
    assert.ok(await useService("TokenService").verifyAccess(second.access_token));
    const sessions = await this.op(b, "OAuth.Sessions");
    assert.deepStrictEqual(
      sessions.map((s: any) => s.family),
      [second.family]
    );
  }

  @test
  async sessionsListOnlyLiveFamilies() {
    const b = await this.browser();
    // Without offline_access the refresh record is expired, not revoked: not a live session
    const online = await this.fullTokens({ scope: "Task.*", browser: b });
    assert.strictEqual(online.refresh_token, undefined);
    assert.strictEqual((await this.op(b, "OAuth.Sessions")).length, 0);
    // Rotated: only the current token of the family is listed, with its last use
    const offline = await this.fullTokens({ scope: "Task.* offline_access", browser: b });
    const refreshed = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: offline.refresh_token,
      client_id: "app"
    });
    assert.strictEqual(refreshed.status, 200);
    const sessions = await this.op(b, "OAuth.Sessions");
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].family, offline.family);
    assert.ok(sessions[0].lastUsedAt);
    // A first-party login (no client) is not a connected app
    await useService("TokenService").issue(b.ctx.getSession());
    assert.strictEqual((await this.op(b, "OAuth.Sessions")).length, 1);
    // Revoking by client also kills a family without refresh token
    await this.op(b, "OAuth.Revoke", { clientId: "app" });
    assert.strictEqual(await useService("TokenService").verifyAccess(online.access_token), undefined);
  }

  @test
  async grantsListOnlyUnexpiredOwnGrants() {
    const b = await this.browser();
    await this.fullTokens({ scope: "Task.* offline_access", browser: b, remember: true });
    await this.fullTokens({ scope: "Task.* offline_access", user: "u2", remember: true });
    assert.strictEqual((await this.op(b, "OAuth.Grants")).length, 1);
    await OAuthGrant.ref("u1:app").patch({ expiresAt: Date.now() - 1 } as any);
    assert.strictEqual((await this.op(b, "OAuth.Grants")).length, 0);
  }

  @test
  async forgetAndRevokeOnlyOwnRecords() {
    const b = await this.browser();
    await this.login(b, "u1");
    const other = await this.fullTokens({ scope: "Task.* offline_access", user: "u2", remember: true });
    await this.op(b, "OAuth.Forget", { clientId: "app" });
    await this.op(b, "OAuth.Revoke", { clientId: "app" });
    assert.ok(await OAuthGrant.ref("u2:app").exists());
    assert.ok(await useService("TokenService").verifyAccess(other.access_token));
    assert.deepStrictEqual(await this.op(b, "OAuth.Sessions"), []);
  }

  @test
  async operationsRequireLogin() {
    const anonymous = await this.browser();
    for (const [id, input] of [
      ["OAuth.Sessions", undefined],
      ["OAuth.Grants", undefined],
      ["OAuth.Revoke", { clientId: "app" }],
      ["OAuth.Forget", { clientId: "app" }]
    ] as const) {
      await assert.rejects(() => this.op(anonymous, id, input), /401/, id);
    }
    // A delegated (scoped) token does not manage connected apps
    const bearer = await this.browser();
    await this.login(bearer, "u1");
    bearer.ctx.getSession().scopes = ["*"];
    await assert.rejects(() => this.op(bearer, "OAuth.Sessions"), /401|403/);
  }

  @test
  async revokeNeedsFamilyOrClient() {
    const b = await this.browser();
    await this.login(b, "u1");
    await assert.rejects(() => this.op(b, "OAuth.Revoke", {}), /400/);
  }

  @test
  async sweepRemovesExpiredRecords() {
    const server = useService<any>("OAuthServer");
    const now = Date.now();
    const identity = { userId: "u1", identId: "u1@email", amr: [], mfa: "none" };
    const code = (hash: string, expiresAt: number) =>
      OAuthCode.create({
        hash,
        clientId: "app",
        redirectUri: "http://127.0.0.1/callback",
        codeChallenge: "c",
        identity,
        scope: "Task.*",
        expiresAt
      } as any);
    // Used codes are kept an access token lifetime after their expiry, for reuse detection
    await code("old", now - server.accessTtl() * 1000 - 60_000);
    await code("recent", now - 1000);
    const device = (userCode: string, expiresAt: number) =>
      OAuthDeviceCode.create({
        userCode,
        secretHash: "s",
        clientId: "app",
        requestedScope: "Task.*",
        status: "pending",
        expiresAt,
        interval: 5
      } as any);
    await device("BBBBBBBB", now - 1000);
    await device("CCCCCCCC", now + 60_000);
    const grant = (userId: string, expiresAt: number) =>
      OAuthGrant.create({
        uuid: `${userId}:app`,
        userId,
        clientId: "app",
        scope: "Task.*",
        createdAt: now,
        lastUsedAt: now,
        expiresAt
      } as any);
    await grant("u1", now - 1000);
    await grant("u2", now + 60_000);
    assert.strictEqual(await server.sweep(), 3);
    assert.ok(!(await OAuthCode.ref("old").exists()));
    assert.ok(await OAuthCode.ref("recent").exists());
    assert.ok(!(await OAuthDeviceCode.ref("BBBBBBBB").exists()));
    assert.ok(await OAuthDeviceCode.ref("CCCCCCCC").exists());
    assert.ok(!(await OAuthGrant.ref("u1:app").exists()));
    assert.ok(await OAuthGrant.ref("u2:app").exists());
    assert.strictEqual(await server.sweep(), 0);
  }

  @test
  async sweepRemovesMoreThanAPage() {
    const server = useService<any>("OAuthServer");
    const now = Date.now();
    const alphabet = "BCDFGHJKLMNPQRSTVWXZ";
    // Expired and live codes interleaved, more than a query page of each
    for (let i = 0; i < 250; i++) {
      const userCode = `BBBBBB${alphabet[Math.floor(i / 20)]}${alphabet[i % 20]}`;
      await OAuthDeviceCode.create({
        userCode,
        secretHash: "s",
        clientId: "webda-cli",
        requestedScope: "Task.*",
        status: "pending",
        expiresAt: i % 5 === 0 ? now + 60_000 : now - 1000,
        interval: 5
      } as any);
    }
    for (let i = 0; i < 130; i++) {
      await OAuthGrant.create({
        uuid: `u${i}:app`,
        userId: `u${i}`,
        clientId: "app",
        scope: "Task.*",
        createdAt: now,
        lastUsedAt: now,
        expiresAt: now - 1000
      } as any);
    }
    assert.strictEqual(await server.sweep(), 200 + 130);
    let left = 0;
    for await (const d of OAuthDeviceCode.iterate("userCode != ''", [])) {
      assert.ok(d.expiresAt > now);
      left++;
    }
    assert.strictEqual(left, 50);
    for await (const _ of OAuthGrant.iterate("uuid != ''", [])) assert.fail("expired grant left");
  }

  @test
  async sweepKeepsReconsentedGrant() {
    const server = useService<any>("OAuthServer");
    const now = Date.now();
    await OAuthGrant.create({
      uuid: "u1:app",
      userId: "u1",
      clientId: "app",
      scope: "Task.*",
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now - 1000
    } as any);
    const stale = await OAuthGrant.ref("u1:app").get();
    // The user consents again after the sweep read the grant
    await OAuthGrant.ref("u1:app").patch({ expiresAt: now + 60_000 } as any);
    const iterate = OAuthGrant.iterate.bind(OAuthGrant);
    vi.spyOn(OAuthGrant, "iterate").mockImplementation(((q: string, p: any) =>
      q === "expiresAt < ?"
        ? (async function* staleRead() {
            yield stale;
          })()
        : iterate(q, p)) as any);
    try {
      assert.strictEqual(await server.sweep(), 0);
    } finally {
      vi.restoreAllMocks();
    }
    assert.ok(await OAuthGrant.ref("u1:app").exists());
  }

  @test
  async sweepSkipsVanishedGrant() {
    const server = useService<any>("OAuthServer");
    const now = Date.now();
    await OAuthGrant.create({
      uuid: "u1:app",
      userId: "u1",
      clientId: "app",
      scope: "Task.*",
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now - 1000
    } as any);
    const stale = await OAuthGrant.ref("u1:app").get();
    // The user forgets the app after the sweep read the grant
    await OAuthGrant.ref("u1:app").delete();
    const iterate = OAuthGrant.iterate.bind(OAuthGrant);
    vi.spyOn(OAuthGrant, "iterate").mockImplementation(((q: string, p: any) =>
      q === "expiresAt < ?"
        ? (async function* staleRead() {
            yield stale;
          })()
        : iterate(q, p)) as any);
    try {
      assert.strictEqual(await server.sweep(), 0);
    } finally {
      vi.restoreAllMocks();
    }
  }

  @test
  async sweepRunsOneAtATime() {
    const server = useService<any>("OAuthServer");
    const first = server.sweep();
    assert.strictEqual(server.sweep(), first);
    await first;
    assert.notStrictEqual(server.sweep(), first);
  }
}
