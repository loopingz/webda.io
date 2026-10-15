import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { useService } from "@webda/core";
import { OAuthTest, query, registerTestOperations, unregisterTestOperations } from "./test/oauthtest.js";
import { OAuthDeviceCode, OAuthGrant } from "./models.model.js";
import { DEVICE_GRANT } from "./oauthserver.service.js";
import { sha256 } from "./devicecode.js";

@suite
class DeviceFlowTest extends OAuthTest {
  /** @override */
  async beforeEach() {
    await super.beforeEach();
    registerTestOperations();
    for await (const d of OAuthDeviceCode.iterate("userCode != ''", [])) await d.ref().delete();
    for await (const g of OAuthGrant.iterate("uuid != ''", [])) await g.ref().delete();
    useService<any>("OAuthServer").lookupFailures.clear();
  }

  /** @override */
  async afterEach() {
    vi.restoreAllMocks();
    unregisterTestOperations();
    await super.afterEach();
  }

  /**
   * @param deviceCode - device_code
   * @param clientId - client_id
   * @returns the token endpoint response
   */
  poll(deviceCode: string, clientId: string = "webda-cli") {
    return this.tokenRequest({ grant_type: DEVICE_GRANT, device_code: deviceCode, client_id: clientId });
  }

  /**
   * Start a device flow and approve it in a browser as u1
   * @param scope - requested scope
   * @param operations - operations selected on the consent page
   * @returns the device_code
   */
  async approved(scope: string, operations: string[]): Promise<string> {
    const start = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope });
    const b = await this.browser();
    await this.login(b, "u1");
    await this.op(b, "OAuth.Device.Lookup", { userCode: start.body.user_code });
    const req = await this.op(b, "OAuth.Consent.Get");
    await this.op(b, "OAuth.Consent.Decide", { allow: true, operations, csrf: req.csrf });
    return start.body.device_code;
  }

  @test
  async deviceFlowApprove() {
    const start = await this.form("/oauth/device_authorization", {
      client_id: "webda-cli",
      scope: "Task.* offline_access",
      hostname: "box"
    });
    assert.match(start.body.user_code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    assert.strictEqual(start.body.verification_uri, "http://test.webda.io/oauth/device");
    assert.strictEqual(
      start.body.verification_uri_complete,
      `http://test.webda.io/oauth/device?user_code=${start.body.user_code}`
    );
    assert.strictEqual(start.body.interval, 5);
    const poll = () => this.poll(start.body.device_code);
    assert.strictEqual((await poll()).body.error, "authorization_pending");
    assert.strictEqual((await poll()).body.error, "slow_down"); // polled within interval
    const b = await this.browser();
    await this.login(b, "u1");
    const { redirect } = await this.op(b, "OAuth.Device.Lookup", { userCode: start.body.user_code.toLowerCase() });
    assert.strictEqual(redirect, "http://test.webda.io/oauth/consent");
    const req = await this.op(b, "OAuth.Consent.Get");
    assert.strictEqual(req.flow, "device");
    assert.strictEqual(req.hostname, "box");
    assert.strictEqual(req.rememberable, false);
    await this.op(b, "OAuth.Consent.Decide", { allow: true, operations: ["Task.Get"], csrf: req.csrf });
    await this.advancePoll(start.body.device_code); // sets lastPolledAt in the past
    const tokens = await poll();
    assert.strictEqual(tokens.status, 200);
    assert.strictEqual(tokens.body.scope, "Task.Get offline_access");
    assert.ok(tokens.body.refresh_token);
    const claims = await useService("TokenService").verifyAccess(tokens.body.access_token);
    assert.strictEqual(claims!.sub, "u1");
    assert.strictEqual(claims!.client_id, "webda-cli");
    await this.advancePoll(start.body.device_code);
    assert.strictEqual((await poll()).body.error, "invalid_grant"); // consumed
  }

  @test
  async deviceFlowDenyAndExpire() {
    const start = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    const b = await this.browser();
    await this.login(b, "u1");
    await this.op(b, "OAuth.Device.Lookup", { userCode: start.body.user_code });
    const req = await this.op(b, "OAuth.Consent.Get");
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", { allow: false, operations: [], csrf: req.csrf });
    assert.strictEqual(query(redirect).error, "access_denied");
    await this.advancePoll(start.body.device_code);
    assert.strictEqual(
      (
        await this.tokenRequest({
          grant_type: DEVICE_GRANT,
          device_code: start.body.device_code,
          client_id: "webda-cli"
        })
      ).body.error,
      "access_denied"
    );
    // The denied record is deleted
    assert.ok(!(await OAuthDeviceCode.ref(start.body.user_code.replace("-", "")).exists()));
    const second = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    await OAuthDeviceCode.ref({ userCode: second.body.user_code.replace("-", "") } as any).patch({
      expiresAt: Date.now() - 1
    } as any);
    assert.strictEqual(
      (
        await this.tokenRequest({
          grant_type: DEVICE_GRANT,
          device_code: second.body.device_code,
          client_id: "webda-cli"
        })
      ).body.error,
      "expired_token"
    );
  }

  @test
  async deviceFlowRules() {
    assert.strictEqual(
      (await this.form("/oauth/device_authorization", { client_id: "app", scope: "Task.*" })).body.error,
      "unauthorized_client"
    );
    const start = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    const tampered = start.body.device_code.replace(/\.(.)/, (_m: string, c: string) => "." + (c === "A" ? "B" : "A"));
    assert.strictEqual(
      (await this.tokenRequest({ grant_type: DEVICE_GRANT, device_code: tampered, client_id: "webda-cli" })).body.error,
      "invalid_grant"
    );
    // remembered consent never skips the device page
    await OAuthGrant.create({
      uuid: "u1:webda-cli",
      userId: "u1",
      clientId: "webda-cli",
      scope: "*",
      createdAt: 0,
      lastUsedAt: 0,
      expiresAt: Date.now() + 1e6
    } as any);
    const b = await this.browser();
    await this.login(b, "u1");
    assert.strictEqual(
      (await this.op(b, "OAuth.Device.Lookup", { userCode: start.body.user_code })).redirect,
      "http://test.webda.io/oauth/consent"
    );
  }

  @test
  async deviceLookupRateLimited() {
    const b = await this.browser();
    await this.login(b, "u1");
    for (let i = 0; i < 5; i++) {
      await assert.rejects(() => this.op(b, "OAuth.Device.Lookup", { userCode: "BCDF-GHJK" }), /404|NotFound/);
    }
    await assert.rejects(() => this.op(b, "OAuth.Device.Lookup", { userCode: "BCDF-GHJK" }), /429|TooMany/);
  }

  @test
  async deviceAuthorizationValidation() {
    const unknown = await this.form("/oauth/device_authorization", { client_id: "nope", scope: "Task.*" });
    assert.strictEqual(unknown.status, 400);
    assert.strictEqual(unknown.body.error, "unauthorized_client");
    assert.strictEqual(unknown.headers["Cache-Control"], "no-store");
    assert.strictEqual(
      (await this.form("/oauth/device_authorization", { scope: "Task.*" })).body.error,
      "unauthorized_client"
    );
    for (const scope of ["Task.?", "offline_access", "x".repeat(1100)]) {
      const res = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope });
      assert.strictEqual(res.status, 400, scope);
      assert.strictEqual(res.body.error, "invalid_scope", scope);
    }
    const start = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" }, true);
    assert.strictEqual(start.status, 200);
    assert.strictEqual(start.headers["Cache-Control"], "no-store");
    assert.strictEqual(start.body.expires_in, 600);
    const [userCode, secret] = start.body.device_code.split(".");
    assert.strictEqual(userCode, start.body.user_code.replace("-", ""));
    assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
    const stored = await OAuthDeviceCode.ref(userCode).get();
    // Only the hash of the secret is stored
    assert.strictEqual(stored.secretHash, sha256(secret));
    assert.ok(!JSON.stringify(stored).includes(secret));
    assert.strictEqual(stored.status, "pending");
    assert.strictEqual(stored.requestedScope, "Task.*");
    assert.strictEqual(stored.interval, 5);
  }

  @test
  async deviceUserCodeCollisionRetried() {
    const devicecode = await import("./devicecode.js");
    const first = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    const taken = first.body.user_code.replace("-", "");
    const server = useService<any>("OAuthServer");
    let calls = 0;
    vi.spyOn(server, "newUserCode").mockImplementation(() => (++calls < 3 ? taken : devicecode.generateUserCode()));
    const second = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    assert.strictEqual(second.status, 200);
    assert.notStrictEqual(second.body.user_code, first.body.user_code);
    assert.strictEqual(calls, 3);
    // The existing record is untouched
    assert.strictEqual(
      (await OAuthDeviceCode.ref(taken).get()).secretHash,
      sha256(first.body.device_code.split(".")[1])
    );
    // Bounded: a generator stuck on taken codes fails
    vi.spyOn(server, "newUserCode").mockImplementation(() => taken);
    const stuck = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    assert.strictEqual(stuck.status, 500);
    assert.strictEqual(stuck.body.error, "server_error");
  }

  @test
  async devicePollingRules() {
    const start = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    const code = start.body.device_code;
    const userCode = code.split(".")[0];
    assert.strictEqual(
      (await this.tokenRequest({ grant_type: DEVICE_GRANT, client_id: "webda-cli" })).body.error,
      "invalid_request"
    );
    assert.strictEqual((await this.poll("garbage")).body.error, "invalid_grant");
    assert.strictEqual((await this.poll("BCDFGHJK.secret")).body.error, "invalid_grant");
    // Only device clients, and bound to its client
    assert.strictEqual((await this.poll(code, "app")).body.error, "unauthorized_client");
    const clients = useService<any>("OAuthServer").getParameters().clients;
    clients.tv = { name: "TV", redirect_uris: [], deviceFlow: true };
    try {
      assert.strictEqual((await this.poll(code, "tv")).body.error, "invalid_grant");
    } finally {
      delete clients.tv;
    }
    const first = await this.poll(code);
    assert.strictEqual(first.status, 400);
    assert.strictEqual(first.body.error, "authorization_pending");
    assert.strictEqual(first.headers["Cache-Control"], "no-store");
    assert.strictEqual((await this.poll(code)).body.error, "slow_down");
    assert.strictEqual((await OAuthDeviceCode.ref(userCode).get()).interval, 10);
    // 6 s later is still too fast for the raised interval
    await OAuthDeviceCode.ref(userCode).patch({ lastPolledAt: Date.now() - 6000 } as any);
    assert.strictEqual((await this.poll(code)).body.error, "slow_down");
    assert.strictEqual((await OAuthDeviceCode.ref(userCode).get()).interval, 15);
    await OAuthDeviceCode.ref(userCode).patch({ lastPolledAt: Date.now() - 16_000 } as any);
    assert.strictEqual((await this.poll(code)).body.error, "authorization_pending");
    // An expired code is expired whatever its status
    await OAuthDeviceCode.ref(userCode).patch({ expiresAt: Date.now() - 1, lastPolledAt: 0 } as any);
    assert.strictEqual((await this.poll(code)).body.error, "expired_token");
  }

  @test
  async deviceTokensWithoutOfflineAccess() {
    const code = await this.approved("Task.*", ["Task.Get", "Task.Update"]);
    await this.advancePoll(code);
    const tokens = await this.poll(code);
    assert.strictEqual(tokens.status, 200);
    assert.strictEqual(tokens.body.scope, "Task.Get Task.Update");
    assert.strictEqual(tokens.body.refresh_token, undefined);
  }

  @test
  async deviceConcurrentExchangeSingleUse() {
    const code = await this.approved("Task.* offline_access", ["Task.Get"]);
    await this.advancePoll(code);
    const results = await Promise.all([this.poll(code), this.poll(code), this.poll(code)]);
    assert.strictEqual(results.filter(r => r.status === 200).length, 1);
    for (const r of results.filter(r => r.status !== 200)) {
      assert.ok(["invalid_grant", "slow_down"].includes(r.body.error), r.body.error);
    }
    assert.strictEqual((await OAuthDeviceCode.ref(code.split(".")[0]).get()).status, "consumed");
  }

  @test
  async deviceConsumeConditionFailure() {
    const code = await this.approved("Task.*", ["Task.Get"]);
    await this.advancePoll(code);
    const userCode = code.split(".")[0];
    // Another exchange consumes the code between the read and the compare-and-set
    const server = useService<any>("OAuthServer");
    const original = server.issueTokens.bind(server);
    const issue = vi.spyOn(server, "issueTokens").mockImplementation(original as any);
    const repo = OAuthDeviceCode.ref(userCode);
    const get = repo.get.bind(repo);
    const stale = await get();
    await repo.patch({ status: "consumed" } as any);
    vi.spyOn(OAuthDeviceCode, "ref").mockReturnValue({
      get: async () => stale,
      exists: async () => true,
      patch: (data: any, field?: any, cond?: any) => repo.patch(data, field, cond),
      delete: () => repo.delete()
    } as any);
    assert.strictEqual((await this.poll(code)).body.error, "invalid_grant");
    assert.strictEqual(issue.mock.calls.length, 0);
  }

  @test
  async deviceLookupRules() {
    const anonymous = await this.browser();
    await assert.rejects(() => this.op(anonymous, "OAuth.Device.Lookup", { userCode: "BCDF-GHJK" }), /401/);
    const start = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    const b = await this.browser();
    await this.login(b, "u1");
    // Spaces, dashes and case are normalized
    const typed = ` ${start.body.user_code.toLowerCase().replace("-", " ")} `;
    assert.ok((await this.op(b, "OAuth.Device.Lookup", { userCode: typed })).redirect);
    // Malformed input is a plain failure
    await assert.rejects(() => this.op(b, "OAuth.Device.Lookup", { userCode: "AAAA-AAAA" }), /404/);
    await assert.rejects(() => this.op(b, "OAuth.Device.Lookup", { userCode: 42 }), /400/);
    // A code no longer pending cannot be looked up again
    const userCode = start.body.user_code.replace("-", "");
    await OAuthDeviceCode.ref(userCode).patch({ status: "approved" } as any);
    await assert.rejects(() => this.op(b, "OAuth.Device.Lookup", { userCode: start.body.user_code }), /404/);
    // Nor an expired one
    const other = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    await OAuthDeviceCode.ref(other.body.user_code.replace("-", "")).patch({ expiresAt: Date.now() - 1 } as any);
    await assert.rejects(() => this.op(b, "OAuth.Device.Lookup", { userCode: other.body.user_code }), /404/);
    // Every failure has the same message
    const messages = new Set<string>();
    for (const userCode of ["AAAA-AAAA", start.body.user_code]) {
      await this.op(b, "OAuth.Device.Lookup", { userCode }).catch(err => messages.add(err.message));
    }
    assert.strictEqual(messages.size, 1);
  }

  @test
  async deviceLookupSuccessIsNotAFailure() {
    const start = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    const b = await this.browser();
    await this.login(b, "u1");
    for (let i = 0; i < 4; i++) {
      await assert.rejects(() => this.op(b, "OAuth.Device.Lookup", { userCode: "BCDF-GHJK" }), /404/);
    }
    await this.op(b, "OAuth.Device.Lookup", { userCode: start.body.user_code });
    await assert.rejects(() => this.op(b, "OAuth.Device.Lookup", { userCode: "BCDF-GHJK" }), /404/);
    // Five failures: even a valid code is refused now
    await assert.rejects(() => this.op(b, "OAuth.Device.Lookup", { userCode: start.body.user_code }), /429/);
  }

  @test
  async deviceLookupRateLimitedPerIp() {
    const start = await this.form("/oauth/device_authorization", { client_id: "webda-cli", scope: "Task.*" });
    // New sessions do not reset the client IP budget
    for (let i = 0; i < 20; i++) {
      const b = await this.browser();
      await this.login(b, `u${i}`);
      await assert.rejects(() => this.op(b, "OAuth.Device.Lookup", { userCode: "BCDF-GHJK" }), /404/);
    }
    const fresh = await this.browser();
    await this.login(fresh, "u1");
    await assert.rejects(() => this.op(fresh, "OAuth.Device.Lookup", { userCode: start.body.user_code }), /429/);
    // The window is 10 minutes
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 600_001);
    await OAuthDeviceCode.ref(start.body.user_code.replace("-", "")).patch({ expiresAt: now + 3_600_000 } as any);
    assert.ok((await this.op(fresh, "OAuth.Device.Lookup", { userCode: start.body.user_code })).redirect);
  }
}
