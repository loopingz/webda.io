import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { Session } from "../session/session.js";
import { TokenInvalid, TokenService } from "./token.service.js";
import { RefreshToken } from "../models/refreshtoken.model.js";
import { useService } from "../core/hooks.js";
import { useCrypto } from "./cryptoservice.service.js";

@suite
class TokenServiceTest extends WebdaApplicationTest {
  service: TokenService;

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: { AuthStore: { type: "Webda/MemoryStore", models: ["Webda/RefreshToken"] } }
    };
  }

  async beforeEach() {
    await super.beforeEach();
    this.service = useService("TokenService");
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
}
