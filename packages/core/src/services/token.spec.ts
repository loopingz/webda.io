import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { Session } from "../session/session.js";
import { TokenInvalid, TokenService } from "./token.service.js";
import { RefreshToken } from "../models/refreshtoken.model.js";
import { RevokedAccess } from "../models/revokedaccess.model.js";
import { useService } from "../core/hooks.js";
import { useCrypto } from "./cryptoservice.service.js";
import { InvalidScope } from "../session/scope.js";

@suite
class TokenServiceTest extends WebdaApplicationTest {
  service: TokenService;

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: { AuthStore: { type: "Webda/MemoryStore", models: ["Webda/RefreshToken", "Webda/RevokedAccess"] } }
    };
  }

  async beforeEach() {
    await super.beforeEach();
    this.service = useService("TokenService");
    // The service and its memory store survive between tests: start each one without denylist state
    (this.service as any).revocationHits.clear();
    (this.service as any).revocationMisses.clear();
    this.service.getParameters().revocationCheck = true;
    this.service.getParameters().revocationCacheTtl = 10;
    for await (const entry of RevokedAccess.iterate("")) {
      await entry.ref().delete();
    }
  }

  session(user: string = "u1"): Session {
    const s = new Session();
    s.login(user, "a@b.c:email", { provider: "email", amr: ["pwd"] });
    return s;
  }

  @test
  async issueAndVerify() {
    const s = this.session();
    const tokens = await this.service.issue(s);
    assert.strictEqual(tokens.expiresIn, 900);
    assert.ok(s.refreshFamily);
    const claims = await this.service.verifyAccess(tokens.accessToken);
    assert.strictEqual(claims.sub, "u1");
    assert.strictEqual(claims.fam, s.refreshFamily);
    assert.deepStrictEqual(claims.amr, ["pwd"]);
    assert.strictEqual(await this.service.verifyAccess("garbage"), undefined);
    // only the hash is stored
    const stored = await RefreshToken.query("userId = 'u1'");
    assert.strictEqual(stored.results.length, 1);
    assert.notStrictEqual(stored.results[0].hash, tokens.refreshToken);
  }

  @test
  async wrongAudience() {
    const crypto = useCrypto();
    const claims = { sub: "u1", ident: "a:b", amr: ["pwd"], fam: "f", mfa: "none" };
    assert.strictEqual(
      await this.service.verifyAccess(await crypto.jwtSign(claims, { audience: "webda-email", expiresIn: 60 })),
      undefined
    );
    assert.strictEqual(await this.service.verifyAccess(await crypto.jwtSign(claims, { expiresIn: 60 })), undefined);
    assert.ok(
      await this.service.verifyAccess(await crypto.jwtSign(claims, { audience: "webda-access", expiresIn: 60 }))
    );
  }

  @test
  async refreshRejectsAccessToken() {
    const t = await this.service.issue(this.session());
    await assert.rejects(() => this.service.refresh(t.accessToken), TokenInvalid);
    await assert.rejects(() => this.service.refresh(undefined as any), TokenInvalid);
  }

  @test
  async refreshAcceptsLegacyRecordWithoutMfaState() {
    const tokens = await this.service.issue(this.session());
    const repository = RefreshToken.getRepository();
    const get = repository.get;
    // Model repositories supplied by applications may return legacy records without newer session fields.
    repository.get = async (...args: Parameters<typeof get>) => {
      const record = await get.apply(repository, args);
      (record as any).mfa = undefined;
      record.mfaVerifications = undefined;
      return record;
    };
    try {
      const refreshed = await this.service.refresh(tokens.refreshToken);
      assert.strictEqual(refreshed.session.mfa, "none");
      assert.deepStrictEqual(refreshed.session.mfaVerifications, {});
      assert.ok(refreshed.accessToken);
    } finally {
      repository.get = get;
    }
  }

  @test
  async refreshPreservesMfaScopeAndOriginalVerificationTime() {
    const session = this.session();
    session.mfaVerifications = {
      "User.Mfa.Verify": { method: "totp", owner: "Webda/User/u1", verifiedAt: 123 },
      "User.PaymentMfa.Verify": { method: "totp", owner: "Webda/User/u1", verifiedAt: 456 }
    };
    const tokens = await this.service.issue(session);
    const refreshed = await this.service.refresh(tokens.refreshToken);
    assert.deepStrictEqual(refreshed.session.mfaVerifications, session.mfaVerifications);
    const claims = await this.service.verifyAccess(refreshed.accessToken);
    assert.deepStrictEqual(claims.mfaVerifications, session.mfaVerifications);
  }

  @test
  async rotationAndReuse() {
    const first = await this.service.issue(this.session());
    const second = await this.service.refresh(first.refreshToken);
    assert.notStrictEqual(second.refreshToken, first.refreshToken);
    assert.strictEqual(second.session.userId, "u1");
    // reuse of the rotated token revokes the family
    await assert.rejects(() => this.service.refresh(first.refreshToken), TokenInvalid);
    await assert.rejects(() => this.service.refresh(second.refreshToken), TokenInvalid);
  }

  @test
  async expiredAndUnknown() {
    await assert.rejects(() => this.service.refresh("unknown"), TokenInvalid);
    this.service.getParameters().refreshTtl = -1;
    const t = await this.service.issue(this.session());
    this.service.getParameters().refreshTtl = 2592000;
    await assert.rejects(() => this.service.refresh(t.refreshToken), TokenInvalid);
  }

  @test
  async revokeUser() {
    const a = await this.service.issue(this.session());
    const b = await this.service.issue(this.session());
    await this.service.revokeUser("u1");
    await assert.rejects(() => this.service.refresh(a.refreshToken), TokenInvalid);
    await assert.rejects(() => this.service.refresh(b.refreshToken), TokenInvalid);
  }

  @test
  async revokeUserBindsParameters() {
    const a = await this.service.issue(this.session());
    // a quote in the id must not widen or break the query
    await this.service.revokeUser("x' OR userId != 'y");
    assert.ok(await this.service.refresh(a.refreshToken));
  }

  @test
  async concurrentRefresh() {
    const t = await this.service.issue(this.session());
    const results = await Promise.allSettled([
      this.service.refresh(t.refreshToken),
      this.service.refresh(t.refreshToken)
    ]);
    assert.strictEqual(results.filter(r => r.status === "fulfilled").length, 1);
    const failed = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    assert.ok(failed.reason instanceof TokenInvalid);
    // The winner's new token must be dead too: the family was revoked
    const winner = (results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<any>).value;
    await assert.rejects(() => this.service.refresh(winner.refreshToken), TokenInvalid);
  }

  @test
  async issueRequiresLoggedSession() {
    const pending = new Session();
    pending.login("fresh1", "a@b.c:email", { provider: "email", amr: ["pwd"], mfa: "pending" });
    await assert.rejects(() => this.service.issue(pending), TokenInvalid);
    await assert.rejects(() => this.service.issue(new Session()), TokenInvalid);
    assert.strictEqual((await RefreshToken.query("userId = 'fresh1'")).results.length, 0);
  }

  @test
  async mfaSurvivesRefresh() {
    const s = new Session();
    s.login("u1", "a@b.c:email", { provider: "email", amr: ["pwd", "otp"], mfa: "verified" });
    const t = await this.service.issue(s);
    const r = await this.service.refresh(t.refreshToken);
    assert.strictEqual((await this.service.verifyAccess(r.accessToken)).mfa, "verified");
    assert.strictEqual(r.session.mfa, "verified");
  }

  @test
  async revocationDuringRefresh() {
    const t = await this.service.issue(this.session("u2"));
    const repo: any = RefreshToken.getRepository();
    const original = repo.patch.bind(repo);
    let injected = false;
    repo.patch = async (...args: any[]) => {
      if (!injected) {
        injected = true;
        await this.service.revokeUser("u2");
      }
      return original(...args);
    };
    try {
      await assert.rejects(() => this.service.refresh(t.refreshToken), TokenInvalid);
    } finally {
      repo.patch = original;
    }
    const all = (await RefreshToken.query("userId = 'u2'")).results;
    assert.ok(all.length >= 1);
    assert.strictEqual(all.filter(r => !r.revokedAt).length, 0);
  }

  @test
  async storageErrorDoesNotRevoke() {
    const t = await this.service.issue(this.session("u3"));
    const repo: any = RefreshToken.getRepository();
    const original = repo.patch.bind(repo);
    repo.patch = async () => {
      throw new Error("db down");
    };
    try {
      await assert.rejects(() => this.service.refresh(t.refreshToken), /db down/);
    } finally {
      repo.patch = original;
    }
    const all = (await RefreshToken.query("userId = 'u3'")).results;
    assert.strictEqual(all.filter(r => r.revokedAt).length, 0);
    assert.ok(await this.service.refresh(t.refreshToken));
  }

  @test
  async issueCarriesScopeAndClient() {
    const svc = this.service;
    const tokens = await svc.issue(this.session(), undefined, {
      clientId: "webda-cli",
      scope: ["Task.*", "offline_access"],
      name: "cli on host"
    });
    const claims = await svc.verifyAccess(tokens.accessToken);
    assert.strictEqual(claims.scope, "Task.* offline_access");
    assert.strictEqual(claims.client_id, "webda-cli");
    const stored = await RefreshToken.ref({ hash: (svc as any).hash(tokens.refreshToken) } as any).get();
    assert.strictEqual(stored.clientId, "webda-cli");
    assert.strictEqual(stored.scope, "Task.* offline_access");
    assert.strictEqual(stored.name, "cli on host");
    assert.ok(tokens.family);
  }

  @test
  async loadFromTokenSetsScopes() {
    const svc = this.service;
    const manager = useService("SessionManager") as any;
    const tokens = await svc.issue(this.session(), undefined, { clientId: "c", scope: ["Task.*"] });
    const loaded = await manager.loadFromToken(await this.newContext(), tokens.accessToken);
    assert.deepStrictEqual(loaded.scopes, ["Task.*"]);
    assert.strictEqual(loaded.clientId, "c");
    const plain = await svc.issue(this.session());
    const unscoped = await manager.loadFromToken(await this.newContext(), plain.accessToken);
    assert.strictEqual(unscoped.scopes, undefined);
  }

  @test
  async refreshKeepsOrNarrowsScope() {
    const svc = this.service;
    const first = await svc.issue(this.session(), undefined, { clientId: "c", scope: ["Task.*", "offline_access"] });
    const second = await svc.refresh(first.refreshToken, { clientId: "c" });
    assert.deepStrictEqual(second.scope, ["Task.*", "offline_access"]);
    const third = await svc.refresh(second.refreshToken, { clientId: "c", scope: ["Task.Get"] });
    assert.strictEqual((await svc.verifyAccess(third.accessToken)).scope, "Task.Get");
    await assert.rejects(() => svc.refresh(third.refreshToken, { clientId: "c", scope: ["User.*"] }), InvalidScope);
    // the failed narrowing did not burn the refresh token
    assert.ok(await svc.refresh(third.refreshToken, { clientId: "c" }));
  }

  @test
  async refreshRejectsOtherClient() {
    const svc = this.service;
    const first = await svc.issue(this.session(), undefined, { clientId: "c", scope: ["*"] });
    await assert.rejects(() => svc.refresh(first.refreshToken, { clientId: "other" }), TokenInvalid);
  }

  @test
  async logoutClearsScopes() {
    const session = this.session();
    session.scopes = ["*"];
    session.clientId = "c";
    session.logout();
    assert.strictEqual(session.scopes, undefined);
    assert.strictEqual(session.clientId, undefined);
  }

  @test
  async revokedFamilyRejectedImmediately() {
    const svc = this.service;
    const tokens = await svc.issue(this.session());
    assert.ok(await svc.verifyAccess(tokens.accessToken));
    await svc.revokeFamily(tokens.family);
    assert.strictEqual(await svc.verifyAccess(tokens.accessToken), undefined);
  }

  @test
  async revokedUserOnlyBlocksOlderTokens() {
    const svc = this.service;
    const before = await svc.issue(this.session());
    await svc.revokeUser("u1");
    // Same second as the revocation: iat (1 s resolution) cannot order the tokens, iatMs does
    await new Promise(r => setTimeout(r, 5));
    const after = await svc.issue(this.session());
    assert.strictEqual(await svc.verifyAccess(before.accessToken), undefined);
    assert.ok(await svc.verifyAccess(after.accessToken));
    // A token without iatMs is judged on iat: accepted once issued in a later second than the revocation
    await new Promise(r => setTimeout(r, 1100));
    const later = await useCrypto().jwtSign(
      { sub: "u1", ident: "a:b", amr: ["pwd"], fam: "legacy", mfa: "none" },
      { audience: "webda-access", expiresIn: 60 }
    );
    assert.ok(await svc.verifyAccess(later));
    // another user is not affected
    assert.ok(await svc.verifyAccess((await svc.issue(this.session("u2"))).accessToken));
  }

  @test
  async missCacheDelaysOtherInstanceRevocation() {
    const svc = this.service;
    svc.getParameters().revocationCacheTtl = 10;
    const tokens = await svc.issue(this.session());
    assert.ok(await svc.verifyAccess(tokens.accessToken)); // caches the miss
    // another instance revokes: write the row directly, bypassing this instance's cache
    await RevokedAccess.create({ key: `fam:${tokens.family}`, expiresAt: Date.now() + 900_000 } as any);
    assert.ok(await svc.verifyAccess(tokens.accessToken), "miss still cached");
    svc.getParameters().revocationCacheTtl = 0;
    (svc as any).revocationMisses.clear();
    assert.strictEqual(await svc.verifyAccess(tokens.accessToken), undefined);
  }

  @test
  async revocationCheckDisabled() {
    const svc = this.service;
    svc.getParameters().revocationCheck = false;
    const tokens = await svc.issue(this.session());
    await svc.revokeFamily(tokens.family);
    assert.ok(await svc.verifyAccess(tokens.accessToken));
  }

  @test
  async sweepRemovesExpired() {
    await RevokedAccess.create({ key: "fam:old", expiresAt: Date.now() - 1 } as any);
    await RevokedAccess.create({ key: "fam:new", expiresAt: Date.now() + 60_000 } as any);
    assert.strictEqual(await this.service.sweepRevoked(), 1);
    assert.strictEqual(await RevokedAccess.ref({ key: "fam:old" } as any).exists(), false);
    assert.strictEqual(await RevokedAccess.ref({ key: "fam:new" } as any).exists(), true);
  }

  @test
  async userRevocationRaisedByAnotherInstanceIsSeenAfterTtl() {
    const svc = this.service;
    const first = await svc.issue(this.session());
    await svc.revokeUser("u1");
    await new Promise(r => setTimeout(r, 5));
    const second = await svc.issue(this.session());
    assert.ok(await svc.verifyAccess(second.accessToken)); // caches the user hit
    // another instance revokes again
    await RevokedAccess.ref({ key: "user:u1" } as any).patch({ notBefore: Date.now() } as any);
    assert.ok(await svc.verifyAccess(second.accessToken), "still inside the TTL");
    svc.getParameters().revocationCacheTtl = 0.05;
    (svc as any).revocationHits.clear();
    assert.strictEqual(await svc.verifyAccess(second.accessToken), undefined);
    assert.strictEqual(await svc.verifyAccess(first.accessToken), undefined);
    // a hit is only cached for the TTL
    const hit = (svc as any).revocationHits.get("user:u1");
    assert.ok(hit.until <= Date.now() + 50);
  }

  @test
  async cachesArePruned() {
    const svc: any = this.service;
    svc.revocationMisses.set("fam:a", Date.now() - 1);
    svc.revocationMisses.set("fam:b", Date.now() + 60_000);
    svc.revocationHits.set("fam:c", { entry: { expiresAt: Date.now() - 1 }, until: Date.now() - 1 });
    svc.revocationHits.set("fam:d", { entry: { expiresAt: Date.now() + 60_000 }, until: Date.now() + 60_000 });
    await svc.sweepRevoked();
    assert.deepStrictEqual([...svc.revocationMisses.keys()], ["fam:b"]);
    assert.deepStrictEqual([...svc.revocationHits.keys()], ["fam:d"]);
  }

  @test
  async concurrentRevocationsDoNotThrow() {
    const svc = this.service;
    const tokens = await svc.issue(this.session());
    await Promise.all([svc.revokeFamily(tokens.family), svc.revokeFamily(tokens.family)]);
    await Promise.all([svc.revokeUser("u1"), svc.revokeUser("u1")]);
    // simulate losing the exists/create race: the row appears between our create attempt and the fallback
    await RevokedAccess.create({ key: "fam:race", expiresAt: Date.now() + 1000 } as any);
    await (svc as any).denylist("fam:race");
    assert.strictEqual(await svc.verifyAccess(tokens.accessToken), undefined);
  }

  @test
  async tokenWithoutSubjectSkipsUserLookup() {
    const svc: any = this.service;
    let looked: string[] = [];
    const original = svc.lookupRevoked.bind(svc);
    svc.lookupRevoked = async (key: string) => {
      looked.push(key);
      return original(key);
    };
    assert.strictEqual(await svc.isRevoked({ fam: "f", amr: [], mfa: "none" } as any), false);
    assert.deepStrictEqual(looked, ["fam:f"]);
  }
}
