import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident, runAsSystem } from "@webda/core";
import { EmailTest } from "../test/emailtest.js";

const rejectsWith = (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (err: any) => err.code === code);

@suite
class RecoveryTest extends EmailTest {
  async beforeEach() {
    await super.beforeEach();
    this.email.getParameters().redirects = {
      verified: "https://app/ok",
      failure: "https://app/ko",
      register: "https://app/reg"
    };
  }

  @test
  async verifyAfterRegistration() {
    await this.op("Auth.Email.Register", { email: "a@x.com", password: "longenough" });
    const token = this.tokenOf(this.lastMailUrl());
    assert.deepStrictEqual(await this.op("Auth.Email.Verify", { token }), { status: "verified" });
    assert.ok((await Ident.ref(Ident.key("a@x.com", "email")).get()).isVerified());
    assert.deepStrictEqual(await this.op("Auth.Email.Verify", { token }), { status: "verified" });
  }

  @test
  async addEmailToAccount() {
    const ctx = await this.ctx();
    await this.op("Auth.Email.Register", { email: "main@x.com", password: "longenough" }, ctx);
    this.mailer.sent = [];
    await this.op("Auth.Email.StartVerification", { email: "second@x.com" }, ctx);
    const ident = await Ident.ref(Ident.key("second@x.com", "email")).get();
    assert.strictEqual(ident.getUser().toString(), ctx.getCurrentUserId());
    assert.ok(!ident.isVerified());
    await rejectsWith(() => this.op("Auth.Email.StartVerification", { email: "second@x.com" }, ctx), "THROTTLED");
    await this.op("Auth.Email.Verify", { token: this.tokenOf(this.lastMailUrl()) });
    assert.ok((await Ident.ref(Ident.key("second@x.com", "email")).get()).isVerified());
    await rejectsWith(
      () => this.op("Auth.Email.StartVerification", { email: "second@x.com" }, ctx),
      "PRECONDITION_FAILED"
    );
  }

  @test
  async emailOwnedByOther() {
    await this.op("Auth.Email.Register", { email: "taken@x.com", password: "longenough" });
    const ctx = await this.ctx();
    await this.op("Auth.Email.Register", { email: "me@x.com", password: "longenough" }, ctx);
    await rejectsWith(
      () => this.op("Auth.Email.StartVerification", { email: "taken@x.com" }, ctx),
      "IDENT_LINKED_ELSEWHERE"
    );
  }

  @test
  async verifyOwnership() {
    const { signEmailToken } = await import("./tokens.js");
    await this.op("Auth.Email.Register", { email: "own@x.com", password: "longenough" });
    // Different sub on an owned ident: refused, nothing verified
    const other = await signEmailToken("verify", { email: "own@x.com", sub: "someone-else" });
    await rejectsWith(() => this.op("Auth.Email.Verify", { token: other }), "IDENT_LINKED_ELSEWHERE");
    assert.ok(!(await Ident.ref(Ident.key("own@x.com", "email")).get()).isVerified());
    // No sub on an owned ident: refused
    const nosub = await signEmailToken("verify", { email: "own@x.com" });
    await rejectsWith(() => this.op("Auth.Email.Verify", { token: nosub }), "IDENT_LINKED_ELSEWHERE");
    assert.ok(!(await Ident.ref(Ident.key("own@x.com", "email")).get()).isVerified());
    // Unowned ident and a sub: the sub becomes the owner
    const Model = this.auth.getIdentModel();
    const free = new Model({ ...Ident.key("free@x.com", "email"), email: "free@x.com" } as any);
    await runAsSystem(() => free.getRepository().create(free));
    const mine = await signEmailToken("verify", { email: "free@x.com", sub: "me-uuid" });
    await this.op("Auth.Email.Verify", { token: mine });
    const ident = await Ident.ref(Ident.key("free@x.com", "email")).get();
    assert.ok(ident.isVerified());
    assert.strictEqual(ident.getUser().toString(), "me-uuid");
  }

  @test
  async recoveryFlow() {
    await this.op("Auth.Email.Register", { email: "r@x.com", password: "longenough" });
    const login = await this.op("Auth.Email.Login", { email: "r@x.com", password: "longenough" });
    this.mailer.sent = [];
    assert.strictEqual(await this.op("Auth.Password.StartRecovery", { email: "r@x.com" }), undefined);
    assert.strictEqual(this.mailer.sent[0].template, "EMAIL_RECOVERY");
    const token = this.tokenOf(this.lastMailUrl());
    const ctx = await this.ctx();
    await this.op("Auth.Password.Recover", { token, password: "brandnewpass" }, ctx);
    assert.ok(!ctx.getSession().isLogged());
    assert.ok((await Ident.ref(Ident.key("r@x.com", "email")).get()).isVerified());
    await rejectsWith(() => this.op("Auth.Password.Recover", { token, password: "anotherpass" }), "TOKEN_INVALID");
    await rejectsWith(() => this.op("Auth.Refresh", { refreshToken: login.refreshToken }), "TOKEN_INVALID");
    await rejectsWith(
      () => this.op("Auth.Email.Login", { email: "r@x.com", password: "longenough" }),
      "INVALID_CREDENTIALS"
    );
    assert.strictEqual(
      (await this.op("Auth.Email.Login", { email: "r@x.com", password: "brandnewpass" })).status,
      "ok"
    );
  }

  @test
  async recoveryDoesNotLeak() {
    assert.strictEqual(await this.op("Auth.Password.StartRecovery", { email: "ghost@x.com" }), undefined);
    assert.strictEqual(this.mailer.sent.length, 0);
    await this.op("Auth.Email.Register", { email: "t@x.com", password: "longenough" });
    this.mailer.sent = [];
    await this.op("Auth.Password.StartRecovery", { email: "t@x.com" });
    await this.op("Auth.Password.StartRecovery", { email: "t@x.com" });
    assert.strictEqual(this.mailer.sent.length, 1);
  }

  @test
  async changePassword() {
    const ctx = await this.ctx();
    await this.op("Auth.Email.Register", { email: "c@x.com", password: "longenough" }, ctx);
    await rejectsWith(
      () => this.op("Auth.Password.Change", { current: "wrongwrong", next: "brandnewpass" }, ctx),
      "FORBIDDEN"
    );
    await this.op("Auth.Password.Change", { current: "longenough", next: "brandnewpass" }, ctx);
    assert.strictEqual(
      (await this.op("Auth.Email.Login", { email: "c@x.com", password: "brandnewpass" })).status,
      "ok"
    );
    // Not logged in: refused
    await rejectsWith(
      () => this.op("Auth.Password.Change", { current: "brandnewpass", next: "yetanotherpass" }),
      "UNAUTHORIZED"
    );
  }

  @test
  async verifyRedirect() {
    await this.op("Auth.Email.Register", { email: "rd@x.com", password: "longenough" });
    const token = this.tokenOf(this.lastMailUrl());
    const ok = await this.ctx();
    await this.inContext(ok, () => this.email.verifyRedirect(Object.assign(ok, { parameter: () => token }) as any));
    assert.strictEqual(ok.getResponseHeaders().Location, "https://app/ok?validation=email");
    const ko = await this.ctx();
    await this.inContext(ko, () => this.email.verifyRedirect(Object.assign(ko, { parameter: () => "bad" }) as any));
    assert.strictEqual(ko.getResponseHeaders().Location, "https://app/ko?reason=TOKEN_INVALID");
  }

  @test
  async verifyRedirectRegister() {
    this.email.getParameters().verification = "before";
    await this.op("Auth.Email.Register", { email: "pre@x.com", password: "longenough" });
    const token = this.tokenOf(this.lastMailUrl());
    const c = await this.ctx();
    await this.inContext(c, () => this.email.verifyRedirect(Object.assign(c, { parameter: () => token }) as any));
    assert.strictEqual(
      c.getResponseHeaders().Location,
      `https://app/reg?token=${encodeURIComponent(token)}&email=${encodeURIComponent("pre@x.com")}`
    );
  }
}
