import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident, runAsSystem, useCore, useService } from "@webda/core";
import { vi } from "vitest";
import { EmailTest } from "../test/emailtest.js";

const rejectsWith = (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (err: any) => err.code === code);

@suite
class RecoveryTest extends EmailTest {
  async beforeEach() {
    await super.beforeEach();
    this.email.getParameters().redirects = {
      verified: "https://app/ok",
      failure: "https://app/ko",
      register: "https://app/reg",
      confirm: "https://app/confirm"
    };
  }

  /** Wait for the mails sent without being awaited */
  async flush() {
    await this.email.flushMails();
  }

  /** Call the GET route with a token and the session of ctx, return the redirect */
  async redirectOf(token: string, ctx?: any): Promise<string> {
    const c: any = Object.assign(ctx ?? (await this.ctx()), { parameter: () => token });
    await this.inContext(c, () => this.email.verifyRedirect(c));
    return c.getResponseHeaders().Location;
  }

  /**
   * Round trip a session through the cookie session manager, as the next request would see it
   * @param ctx - context holding the session
   * @returns the session loaded from the cookie
   */
  async reload(ctx: any): Promise<any> {
    const manager: any = useService("SessionManager" as any);
    const out = await this.newContext<any>();
    await manager.save(out, ctx.getSession());
    // SecureCookie.save is not awaited by save()
    await new Promise(resolve => setTimeout(resolve, 20));
    const next = await this.newContext<any>();
    const sent: any = out.getResponseCookies();
    next.getHttpContext().cookies = {};
    for (const name of Object.keys(sent)) next.getHttpContext().cookies[name] = sent[name].value;
    return manager.load(next);
  }

  /**
   * @param accessToken - access token
   * @returns the session loaded from the Bearer token
   */
  async bearer(accessToken: string): Promise<any> {
    const next = await this.newContext<any>();
    next.getHttpContext().headers["authorization"] = `Bearer ${accessToken}`;
    return (useService("SessionManager" as any) as any).load(next);
  }

  @test
  async recoveryEndsSessions() {
    const ctx = await this.ctx();
    const login: any = await this.op("Auth.Email.Register", { email: "se@x.com", password: "longenough" }, ctx);
    assert.ok((await this.reload(ctx)).isLogged());
    assert.ok((await this.bearer(login.accessToken)).isLogged());
    await this.op("Auth.Password.StartRecovery", { email: "se@x.com" });
    await this.flush();
    // changedAt must be strictly after authAt
    await new Promise(resolve => setTimeout(resolve, 5));
    await this.op("Auth.Password.Recover", { token: this.tokenOf(this.lastMailUrl()), password: "brandnewpass" });
    assert.ok(!(await this.reload(ctx)).isLogged());
    assert.ok(!(await this.bearer(login.accessToken)).isLogged());
  }

  @test
  async changePasswordEndsOtherSessions() {
    const ctx = await this.ctx();
    await this.op("Auth.Email.Register", { email: "cs@x.com", password: "longenough" }, ctx);
    const other = await this.ctx();
    await this.op("Auth.Email.Login", { email: "cs@x.com", password: "longenough" }, other);
    await new Promise(resolve => setTimeout(resolve, 5));
    await this.op("Auth.Password.Change", { current: "longenough", next: "brandnewpass" }, ctx);
    assert.ok(!(await this.reload(other)).isLogged());
    // The session that changed the password stays logged in
    assert.ok((await this.reload(ctx)).isLogged());
  }

  @test
  async verifyAfterRegistration() {
    const ctx = await this.ctx();
    await this.op("Auth.Email.Register", { email: "a@x.com", password: "longenough" }, ctx);
    const token = this.tokenOf(this.lastMailUrl());
    assert.deepStrictEqual(await this.op("Auth.Email.Verify", { token }, ctx), { status: "verified" });
    assert.ok((await Ident.ref(Ident.key("a@x.com", "email")).get()).isVerified());
    assert.deepStrictEqual(await this.op("Auth.Email.Verify", { token }, ctx), { status: "verified" });
  }

  @test
  async addEmailToAccount() {
    const ctx = await this.ctx();
    await this.op("Auth.Email.Register", { email: "main@x.com", password: "longenough" }, ctx);
    this.mailer.sent = [];
    await this.op("Auth.Email.StartVerification", { email: "second@x.com" }, ctx);
    // Unowned until the link is used by the same session
    let ident = await Ident.ref(Ident.key("second@x.com", "email")).get();
    assert.ok(!ident.getUser());
    assert.ok(!ident.isVerified());
    await rejectsWith(() => this.op("Auth.Email.StartVerification", { email: "second@x.com" }, ctx), "THROTTLED");
    await this.op("Auth.Email.Verify", { token: this.tokenOf(this.lastMailUrl()) }, ctx);
    ident = await Ident.ref(Ident.key("second@x.com", "email")).get();
    assert.ok(ident.isVerified());
    assert.strictEqual(ident.getUser().toString(), ctx.getCurrentUserId());
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
    const ctx = await this.ctx();
    await this.op("Auth.Email.Register", { email: "own@x.com", password: "longenough" }, ctx);
    const me = ctx.getCurrentUserId();
    // Different sub on an owned ident: refused, nothing verified
    const other = await signEmailToken("verify", { email: "own@x.com", sub: "someone-else" });
    await rejectsWith(() => this.op("Auth.Email.Verify", { token: other }, ctx), "IDENT_LINKED_ELSEWHERE");
    // No sub on an owned ident: refused
    const nosub = await signEmailToken("verify", { email: "own@x.com" });
    await rejectsWith(() => this.op("Auth.Email.Verify", { token: nosub }, ctx), "IDENT_LINKED_ELSEWHERE");
    assert.ok(!(await Ident.ref(Ident.key("own@x.com", "email")).get()).isVerified());
    // Unowned ident and a matching session: the sub becomes the owner
    const Model = this.auth.getIdentModel();
    const free = new Model({ ...Ident.key("free@x.com", "email"), email: "free@x.com" } as any);
    await runAsSystem(() => free.getRepository().create(free));
    const mine = await signEmailToken("verify", { email: "free@x.com", sub: me });
    await this.op("Auth.Email.Verify", { token: mine }, ctx);
    const ident = await Ident.ref(Ident.key("free@x.com", "email")).get();
    assert.ok(ident.isVerified());
    assert.strictEqual(ident.getUser().toString(), me);
  }

  @test
  async squatterChain() {
    // A registers the victim's email (after mode) and the link reaches the victim
    const ctxA = await this.ctx();
    await this.op("Auth.Email.Register", { email: "victim@x.com", password: "longenough" }, ctxA);
    const token = this.tokenOf(this.lastMailUrl());
    const a = ctxA.getCurrentUserId();
    // Victim logged out
    await rejectsWith(() => this.op("Auth.Email.Verify", { token }), "UNAUTHORIZED");
    // Victim logged in as someone else
    const victim = await this.ctx();
    await this.op("Auth.Email.Register", { email: "real@x.com", password: "longenough" }, victim);
    await rejectsWith(() => this.op("Auth.Email.Verify", { token }, victim), "IDENT_LINKED_ELSEWHERE");
    assert.ok(!(await Ident.ref(Ident.key("victim@x.com", "email")).get()).isVerified());
    // The victim's later verified OAuth login must not land in A's account
    const ctxO = await this.ctx();
    const res: any = await this.inContext(ctxO, () =>
      this.auth.complete({
        provider: "google",
        providerUid: "victim-google",
        email: "victim@x.com",
        emailVerified: true,
        amr: ["oauth"]
      } as any)
    );
    const g = await Ident.ref(Ident.key("victim-google", "google")).get();
    assert.notStrictEqual(g.getUser().toString(), a);
    assert.notStrictEqual(res.user?.uuid, a);
  }

  @test
  async verifyRedirectNeedsSession() {
    const ctxA = await this.ctx();
    await this.op("Auth.Email.Register", { email: "rd@x.com", password: "longenough" }, ctxA);
    const token = this.tokenOf(this.lastMailUrl());
    // No session (mail scanner): nothing changes
    assert.strictEqual(
      await this.redirectOf(token),
      `https://app/confirm?reason=LOGIN_REQUIRED&token=${encodeURIComponent(token)}`
    );
    assert.ok(!(await Ident.ref(Ident.key("rd@x.com", "email")).get()).isVerified());
    // Another user: nothing changes either
    const other = await this.ctx();
    await this.op("Auth.Email.Register", { email: "other@x.com", password: "longenough" }, other);
    assert.ok((await this.redirectOf(token, other)).startsWith("https://app/confirm?reason=LOGIN_REQUIRED"));
    assert.ok(!(await Ident.ref(Ident.key("rd@x.com", "email")).get()).isVerified());
    // The owner's session verifies
    assert.strictEqual(await this.redirectOf(token, ctxA), "https://app/ok?validation=email");
    assert.ok((await Ident.ref(Ident.key("rd@x.com", "email")).get()).isVerified());
  }

  @test
  async verifyRedirectFailureAndRegister() {
    assert.strictEqual(await this.redirectOf("bad"), "https://app/ko?reason=TOKEN_INVALID");
    this.email.getParameters().verification = "before";
    await this.op("Auth.Email.Register", { email: "pre@x.com", password: "longenough" });
    const token = this.tokenOf(this.lastMailUrl());
    assert.strictEqual(
      await this.redirectOf(token),
      `https://app/reg?token=${encodeURIComponent(token)}&email=${encodeURIComponent("pre@x.com")}`
    );
  }

  @test
  async startVerificationLoggedOutIsUniform() {
    // verified + owned
    const ctx = await this.ctx();
    await this.op("Auth.Email.Register", { email: "v@x.com", password: "longenough" }, ctx);
    await this.op("Auth.Email.Verify", { token: this.tokenOf(this.lastMailUrl()) }, ctx);
    // owned, unverified
    await this.op("Auth.Email.Register", { email: "o@x.com", password: "longenough" });
    // unowned
    const Model = this.auth.getIdentModel();
    const free = new Model({ ...Ident.key("u@x.com", "email"), email: "u@x.com" } as any);
    await runAsSystem(() => free.getRepository().create(free));
    this.mailer.sent = [];
    for (const email of ["v@x.com", "o@x.com", "u@x.com", "unknown@x.com"]) {
      assert.strictEqual(await this.op("Auth.Email.StartVerification", { email }), undefined);
    }
    await this.flush();
    assert.deepStrictEqual(this.mailer.sent.map((m: any) => m.to).sort(), ["u@x.com", "unknown@x.com"]);
    // Resend is silently throttled
    await this.op("Auth.Email.StartVerification", { email: "unknown@x.com" });
    await this.flush();
    assert.strictEqual(this.mailer.sent.length, 2);
  }

  @test
  async recoveryFlow() {
    await this.op("Auth.Email.Register", { email: "r@x.com", password: "longenough" });
    const login = await this.op("Auth.Email.Login", { email: "r@x.com", password: "longenough" });
    this.mailer.sent = [];
    assert.strictEqual(await this.op("Auth.Password.StartRecovery", { email: "r@x.com" }), undefined);
    await this.flush();
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
  async recoveryResetsLoginAttempts() {
    await this.op("Auth.Email.Register", { email: "lk@x.com", password: "longenough" });
    for (let i = 0; i < 4; i++) {
      await assert.rejects(() => this.op("Auth.Email.Login", { email: "lk@x.com", password: "wrongwrong" }));
    }
    await rejectsWith(() => this.op("Auth.Email.Login", { email: "lk@x.com", password: "longenough" }), "THROTTLED");
    await this.op("Auth.Password.StartRecovery", { email: "lk@x.com" });
    await this.flush();
    await this.op("Auth.Password.Recover", { token: this.tokenOf(this.lastMailUrl()), password: "brandnewpass" });
    assert.strictEqual((await Ident.ref(Ident.key("lk@x.com", "email")).get())._loginAttempts, 0);
    assert.strictEqual(
      (await this.op("Auth.Email.Login", { email: "lk@x.com", password: "brandnewpass" })).status,
      "ok"
    );
  }

  @test
  async recoverRequiresTokenService() {
    await this.op("Auth.Email.Register", { email: "ts@x.com", password: "longenough" });
    await this.op("Auth.Password.StartRecovery", { email: "ts@x.com" });
    await this.flush();
    const token = this.tokenOf(this.lastMailUrl());
    const core: any = useCore();
    const original = core.getService.bind(core);
    const spy = vi
      .spyOn(core, "getService")
      .mockImplementation((name: any) => (name === "TokenService" ? undefined : original(name)));
    try {
      await assert.rejects(() => this.op("Auth.Password.Recover", { token, password: "brandnewpass" }), /TokenService/);
    } finally {
      spy.mockRestore();
    }
  }

  @test
  async recoveryDoesNotLeak() {
    assert.strictEqual(await this.op("Auth.Password.StartRecovery", { email: "ghost@x.com" }), undefined);
    await this.flush();
    assert.strictEqual(this.mailer.sent.length, 0);
    await this.op("Auth.Email.Register", { email: "t@x.com", password: "longenough" });
    this.mailer.sent = [];
    await this.op("Auth.Password.StartRecovery", { email: "t@x.com" });
    await this.op("Auth.Password.StartRecovery", { email: "t@x.com" });
    await this.flush();
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
    await rejectsWith(
      () => this.op("Auth.Password.Change", { current: "brandnewpass", next: "yetanotherpass" }),
      "UNAUTHORIZED"
    );
  }
}
