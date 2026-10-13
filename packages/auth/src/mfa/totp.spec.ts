import { suite, test } from "@webda/test";
import * as assert from "assert";
import { hotp, Ident, runAsSystem, totpStep, type User, useService, WebdaError } from "@webda/core";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { AuthTest } from "../test/authtest.js";
import { addStubProviders, stubProvidersConfig } from "../test/stubprovider.js";
import { Authentication } from "../authentication.service.js";
import { EmailPasswordProvider } from "../email/emailpassword.service.js";
import {
  InvalidMfaCode,
  MfaAlreadyEnabled,
  MfaNotEnabled,
  MfaNotPending,
  Throttled
} from "../errors.js";
import { TotpService } from "./totp.service.js";
import { extractCode, SecondFactorService } from "./secondfactor.service.js";

const code = (cls: { name: string }) =>
  cls.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();

const rejectsWith = (fn: () => Promise<unknown>, cls: { name: string }) =>
  assert.rejects(fn, (err: any) => err.code === code(cls));

class DummyFactorService extends SecondFactorService {
  readonly method = "dummy";
  protected async startEnrollment(user: User) {
    user.mfa!.getFactor("dummy");
    await runAsSystem(() => user.save());
    return { ready: true };
  }
  protected async check(_user: User, submittedCode: string) {
    return submittedCode === "FIXED_CODE_42";
  }
}

@suite
class TotpTest extends AuthTest {
  auth: Authentication;
  email: EmailPasswordProvider;
  totp: TotpService;
  events: string[] = [];

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: {
          type: "Webda/MemoryStore",
          models: ["Webda/User", "Webda/Ident", "Webda/RefreshToken"]
        },
        DefinedMailer: { type: "WebdaTest/Mailer" },
        Authentication: { type: "Webda/Authentication" },
        TokenService: { type: "Webda/TokenService" },
        emailAuth: {
          type: "Webda/EmailPasswordProvider",
          mailer: "DefinedMailer",
          verification: "none",
          redirects: {
            verified: "https://app/verified",
            failure: "https://app/failure",
            register: "https://app/register",
            recover: "https://app/recover"
          }
        },
        totpService: {
          type: "Webda/TotpService",
          throttle: { failedBeforeDelay: 3, lockout: 1000 }
        },
        dummyService: {
          type: "WebdaTest/DummyFactorService"
        },
        ...stubProvidersConfig("google")
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModda("Webda/Authentication", Authentication as any);
    app.addModda("Webda/EmailPasswordProvider", EmailPasswordProvider as any);
    app.addModda("Webda/TotpService", TotpService as any);
    app.addModda("WebdaTest/DummyFactorService", DummyFactorService as any);
    addStubProviders(app, "google");
  }

  async beforeEach() {
    await super.beforeEach();
    this.auth = useService("Authentication" as any);
    this.email = useService("emailAuth" as any);
    this.totp = useService("totpService" as any);
    delete (this.auth as any).mfaMethods;
    this.auth.removeAllListeners?.();
    this.events = [];
    for (const e of [
      "Authentication.Login",
      "Authentication.MfaEnabled",
      "Authentication.MfaDisabled",
      "Authentication.MfaVerified",
      "Authentication.MfaFailed"
    ]) {
      this.auth.on(e as any, () => {
        this.events.push(e);
      });
    }
  }

  private userSeq = 0;

  /** Helper to register and return a logged-in context */
  async registerUser(email?: string, password = "password123") {
    this.userSeq++;
    const userEmail = email ?? `user-${this.userSeq}-${Date.now()}@example.com`;
    const ctx = await this.ctx();
    const res: any = await this.op(
      "Auth.Email.Register",
      { email: userEmail, password, profile: { displayName: `User ${this.userSeq}` } },
      ctx
    );
    assert.strictEqual(res.status, "ok");
    return { ctx, email: userEmail, password, res };
  }

  @test
  async enrollConfirmLoginVerifyEndToEnd() {
    const { ctx, email, password } = await this.registerUser();

    // 1. Enroll
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, ctx);
    assert.ok(enrolled.secret);
    assert.ok(enrolled.uri.startsWith("otpauth://totp/"));
    assert.ok(enrolled.uri.includes(encodeURIComponent(email)));

    // 2. Confirm with valid code
    const step = totpStep();
    const confirmCode = hotp(enrolled.secret, step);
    const confirmed: any = await this.op("Auth.Totp.Confirm", { code: confirmCode }, ctx);
    assert.ok(Array.isArray(confirmed.recoveryCodes));
    assert.strictEqual(confirmed.recoveryCodes.length, 10);
    assert.ok(this.events.includes("Authentication.MfaEnabled"));

    // Session is verified and amr includes totp
    assert.strictEqual(ctx.getSession().mfa, "verified");
    assert.ok(ctx.getSession().amr.includes("totp"));

    // 3. Logout
    await this.op("Auth.Logout", {}, ctx);
    assert.ok(!ctx.getSession().isLogged());
    assert.ok(!ctx.getSession().isPending());

    // 4. Login returns mfa_required
    const loginRes: any = await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.strictEqual(loginRes.status, "mfa_required");
    assert.deepStrictEqual(loginRes.methods, ["totp"]);
    assert.ok(ctx.getSession().isPending());
    assert.ok(!ctx.getSession().isLogged());
    assert.strictEqual(loginRes.accessToken, undefined);

    // 5. Verify returns tokens and marks session verified
    const nextStep = totpStep() + 1;
    const verifyCode = hotp(enrolled.secret, nextStep);
    const verifyRes: any = await this.op("Auth.Totp.Verify", { code: verifyCode }, ctx);
    assert.strictEqual(verifyRes.status, "ok");
    assert.ok(verifyRes.accessToken);
    assert.ok(verifyRes.refreshToken);
    assert.strictEqual(ctx.getSession().mfa, "verified");
    assert.deepStrictEqual(ctx.getSession().amr, ["pwd", "totp"]);
    assert.ok(this.events.includes("Authentication.MfaVerified"));
  }

  @test
  async wrongCodeAndReplayRejected() {
    const { ctx, email, password } = await this.registerUser();
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("Auth.Totp.Confirm", { code: confirmCode }, ctx);

    // Logout and start login
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.ok(ctx.getSession().isPending());

    // Wrong code fails with 401 InvalidMfaCode
    await rejectsWith(
      () => this.op("Auth.Totp.Verify", { code: "000000" }, ctx),
      InvalidMfaCode
    );
    assert.ok(this.events.includes("Authentication.MfaFailed"));

    // Valid code succeeds
    const nextStep = totpStep() + 1;
    const validCode = hotp(enrolled.secret, nextStep);
    const res: any = await this.op("Auth.Totp.Verify", { code: validCode }, ctx);
    assert.strictEqual(res.status, "ok");

    // Login again to test replay
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.ok(ctx.getSession().isPending());

    // Replay of same code is rejected with identical 401 InvalidMfaCode
    await rejectsWith(
      () => this.op("Auth.Totp.Verify", { code: validCode }, ctx),
      InvalidMfaCode
    );
  }

  @test
  async lockoutAfterFailuresThenUnlock() {
    const { ctx, email, password } = await this.registerUser();
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("Auth.Totp.Confirm", { code: confirmCode }, ctx);

    // Logout and start login
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);

    // 3 failures cross the threshold (failedBeforeDelay = 3)
    for (let i = 0; i < 3; i++) {
      await rejectsWith(
        () => this.op("Auth.Totp.Verify", { code: "999999" }, ctx),
        InvalidMfaCode
      );
    }

    // 4th attempt is locked out (429 Throttled)
    await rejectsWith(
      () => this.op("Auth.Totp.Verify", { code: "999999" }, ctx),
      Throttled
    );

    // Even with the correct code, lockout refuses
    const validCode = hotp(enrolled.secret, totpStep() + 1);
    await rejectsWith(
      () => this.op("Auth.Totp.Verify", { code: validCode }, ctx),
      Throttled
    );

    // Wait for lockout (1000 ms in test config)
    await new Promise(resolve => setTimeout(resolve, 1100));

    // After lockout expires, valid code succeeds
    const freshCode = hotp(enrolled.secret, totpStep() + 1);
    const okRes: any = await this.op("Auth.Totp.Verify", { code: freshCode }, ctx);
    assert.strictEqual(okRes.status, "ok");
  }

  @test
  async recoverWithRecoveryCodeAndReuseFails() {
    const { ctx, email, password } = await this.registerUser();
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    const confirmed: any = await this.op("Auth.Totp.Confirm", { code: confirmCode }, ctx);
    const recoveryCode = confirmed.recoveryCodes[0];

    // Logout and start login
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.ok(ctx.getSession().isPending());

    // Recover using recovery code
    const res: any = await this.op("Auth.Totp.Recover", { code: recoveryCode }, ctx);
    assert.strictEqual(res.status, "ok");
    assert.ok(res.accessToken);
    assert.strictEqual(ctx.getSession().mfa, "verified");
    assert.deepStrictEqual(ctx.getSession().amr, ["pwd", "recovery"]);

    // Logout and login again
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.ok(ctx.getSession().isPending());

    // Reusing the same recovery code fails
    await rejectsWith(
      () => this.op("Auth.Totp.Recover", { code: recoveryCode }, ctx),
      InvalidMfaCode
    );

    // Another recovery code still works
    const secondRecoveryCode = confirmed.recoveryCodes[1];
    const secondRes: any = await this.op("Auth.Mfa.Recover", { code: secondRecoveryCode }, ctx);
    assert.strictEqual(secondRes.status, "ok");
  }

  @test
  async verifyWithoutPendingSessionRefused() {
    const ctx = await this.ctx();
    // Anonymous session (neither logged nor pending)
    await rejectsWith(
      () => this.op("Auth.Totp.Verify", { code: "123456" }, ctx),
      MfaNotPending
    );

    // Fully logged session (not pending)
    await this.registerUser("bob@example.com", "password123");
    await rejectsWith(
      () => this.op("Auth.Totp.Verify", { code: "123456" }, ctx),
      MfaNotPending
    );
  }

  @test
  async enrollWhileEnabledRefused() {
    const { ctx } = await this.registerUser();
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("Auth.Totp.Confirm", { code: confirmCode }, ctx);

    // Calling enroll while enabled throws 409 MfaAlreadyEnabled
    await rejectsWith(
      () => this.op("Auth.Totp.Enroll", {}, ctx),
      MfaAlreadyEnabled
    );
  }

  @test
  async disableRequiresValidCode() {
    const { ctx, email, password } = await this.registerUser();
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    const confirmed: any = await this.op("Auth.Totp.Confirm", { code: confirmCode }, ctx);

    // Disable with wrong code fails
    await rejectsWith(
      () => this.op("Auth.Totp.Disable", { code: "000000" }, ctx),
      InvalidMfaCode
    );

    // Disable with valid TOTP code succeeds
    const disableCode = hotp(enrolled.secret, totpStep() + 1);
    await this.op("Auth.Totp.Disable", { code: disableCode }, ctx);
    assert.ok(this.events.includes("Authentication.MfaDisabled"));

    // Login directly succeeds without MFA gate
    await this.op("Auth.Logout", {}, ctx);
    const directLogin: any = await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.strictEqual(directLogin.status, "ok");
    assert.ok(directLogin.accessToken);

    // Re-enroll, confirm, then disable using a recovery code
    const reEnrolled: any = await this.op("Auth.Totp.Enroll", {}, ctx);
    const reConfirmCode = hotp(reEnrolled.secret, totpStep());
    const reConfirmed: any = await this.op("Auth.Totp.Confirm", { code: reConfirmCode }, ctx);
    assert.strictEqual(ctx.getSession().mfa, "verified");

    // Disable using recovery code
    await this.op("Auth.Totp.Disable", { code: reConfirmed.recoveryCodes[0] }, ctx);

    // Login again works directly
    await this.op("Auth.Logout", {}, ctx);
    const againRes: any = await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.strictEqual(againRes.status, "ok");
  }

  @test
  async confirmRevokesOtherRefreshFamilies() {
    const { ctx: browserA, email, password } = await this.registerUser();
    const browserB = await this.ctx();

    // Login from browser B
    const loginB: any = await this.op("Auth.Email.Login", { email, password }, browserB);
    assert.strictEqual(loginB.status, "ok");
    const refreshB = loginB.refreshToken;

    // Browser A enrolls and confirms TOTP
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, browserA);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("Auth.Totp.Confirm", { code: confirmCode }, browserA);

    // Browser B's refresh token was revoked by confirm()
    await assert.rejects(
      () => this.op("Auth.Refresh", { refreshToken: refreshB }, browserB),
      { code: "TOKEN_INVALID" }
    );

    // Browser A's refresh token works
    const refreshA = browserA.getSession().refreshFamily;
    assert.ok(refreshA);
  }

  @test
  async oauthLoginAlsoGated() {
    const { ctx } = await this.registerUser("google-user@example.com", "password123");
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("Auth.Totp.Confirm", { code: confirmCode }, ctx);

    // Link google ident
    const ident = await Ident.ref(Ident.key("google-user@example.com", "email")).get();
    const user = await ident.getUser().get();
    const googleIdent = new Ident({
      ...Ident.key("google-123", "google"),
      email: "google-user@example.com",
      verifiedAt: new Date()
    } as any);
    googleIdent.setUser(user);
    await Ident.getRepository().create(googleIdent);

    // Logout
    await this.op("Auth.Logout", {}, ctx);

    // OAuth login through complete()
    const oauthCtx = await this.ctx();
    const oauthRes = await this.inContext(oauthCtx, () =>
      this.auth.complete({
        provider: "google",
        providerUid: "google-123",
        email: "google-user@example.com",
        emailVerified: true,
        amr: ["oauth"]
      })
    );

    assert.strictEqual(oauthRes.status, "mfa_required");
    assert.deepStrictEqual((oauthRes as any).methods, ["totp"]);
    assert.ok(oauthCtx.getSession().isPending());

    // Verify TOTP on the OAuth pending session
    const validCode = hotp(enrolled.secret, totpStep() + 1);
    const verifyRes: any = await this.op("Auth.Totp.Verify", { code: validCode }, oauthCtx);
    assert.strictEqual(verifyRes.status, "ok");
    assert.ok(verifyRes.accessToken);
    assert.strictEqual(oauthCtx.getSession().mfa, "verified");
    assert.deepStrictEqual(oauthCtx.getSession().amr, ["oauth", "totp"]);
  }

  @test
  async secondFactorServiceExtensionPoint() {
    const { ctx } = await this.registerUser("ext@example.com", "password123");
    const dummy: DummyFactorService = useService("dummyService" as any);
    assert.strictEqual(dummy.method, "dummy");

    // Enroll in dummy factor
    const enrollRes: any = await this.op("Auth.Dummy.Enroll", {}, ctx);
    assert.strictEqual(enrollRes.ready, true);

    // Confirm with fixed code
    const confirmRes: any = await this.op("Auth.Dummy.Confirm", { code: "FIXED_CODE_42" }, ctx);
    assert.ok(Array.isArray(confirmRes.recoveryCodes));

    // Logout and login
    await this.op("Auth.Logout", {}, ctx);
    const loginRes: any = await this.op("Auth.Email.Login", { email: "ext@example.com", password: "password123" }, ctx);
    assert.strictEqual(loginRes.status, "mfa_required");
    assert.deepStrictEqual(loginRes.methods, ["dummy"]);

    // Verify with fixed code
    const verifyRes: any = await this.op("Auth.Dummy.Verify", { code: "FIXED_CODE_42" }, ctx);
    assert.strictEqual(verifyRes.status, "ok");
    assert.deepStrictEqual(ctx.getSession().amr, ["pwd", "dummy"]);
  }

  @test
  async recoveryCodesRegenerate() {
    const { ctx } = await this.registerUser("rec@example.com", "password123");
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    const confirmed: any = await this.op("Auth.Totp.Confirm", { code: confirmCode }, ctx);
    const originalFirstCode = confirmed.recoveryCodes[0];

    // Regenerate recovery codes using valid TOTP code
    const regenCode = hotp(enrolled.secret, totpStep() + 1);
    const regenerated: any = await this.op("Auth.Totp.RecoveryCodes", { code: regenCode }, ctx);
    assert.ok(Array.isArray(regenerated.recoveryCodes));
    assert.strictEqual(regenerated.recoveryCodes.length, 10);
    assert.notDeepStrictEqual(regenerated.recoveryCodes, confirmed.recoveryCodes);

    // Logout and login
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email: "rec@example.com", password: "password123" }, ctx);

    // Old recovery code fails
    await rejectsWith(
      () => this.op("Auth.Totp.Recover", { code: originalFirstCode }, ctx),
      InvalidMfaCode
    );

    // New recovery code succeeds
    const newCode = regenerated.recoveryCodes[0];
    const recoverRes: any = await this.op("Auth.Totp.Recover", { code: newCode }, ctx);
    assert.strictEqual(recoverRes.status, "ok");
  }

  @test
  extractCodeUtility() {
    assert.strictEqual(extractCode(" 123456 "), "123456");
    assert.strictEqual(extractCode({ code: " 123456 " }), "123456");
    assert.strictEqual(extractCode({ code: 123 }), "");
    assert.strictEqual(extractCode(null), "");
    assert.strictEqual(extractCode(undefined), "");
    assert.strictEqual(extractCode(123), "");
  }

  @test
  async enrollmentUnauthorizedAndReauth() {
    const unauthCtx = await this.ctx();
    await assert.rejects(() => this.op("Auth.Totp.Enroll", {}, unauthCtx), WebdaError.Unauthorized);

    const { ctx } = await this.registerUser();
    ctx.getSession().authAt = Date.now() - 400000;
    await assert.rejects(() => this.op("Auth.Totp.Enroll", {}, ctx), WebdaError.Unauthorized);
  }

  @test
  async confirmEdgeCases() {
    const unauthCtx = await this.ctx();
    await assert.rejects(() => this.op("Auth.Totp.Confirm", { code: "123456" }, unauthCtx), WebdaError.Unauthorized);

    const { ctx } = await this.registerUser();
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, ctx);
    await rejectsWith(() => this.op("Auth.Totp.Confirm", { code: "000000" }, ctx), InvalidMfaCode);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("Auth.Totp.Confirm", { code: confirmCode }, ctx);
    await rejectsWith(() => this.op("Auth.Totp.Confirm", { code: confirmCode }, ctx), MfaAlreadyEnabled);

    // recoveryCodes = 0 in service parameters
    const prevRecovery = this.totp.parameters.recoveryCodes;
    this.totp.parameters.recoveryCodes = 0;
    try {
      const { ctx: zeroCtx } = await this.registerUser();
      const enZero: any = await this.op("Auth.Totp.Enroll", {}, zeroCtx);
      const confZero: any = await this.op("Auth.Totp.Confirm", { code: hotp(enZero.secret, totpStep()) }, zeroCtx);
      assert.deepStrictEqual(confZero.recoveryCodes, []);
    } finally {
      this.totp.parameters.recoveryCodes = prevRecovery;
    }
  }

  @test
  async verifyEdgeCases() {
    const { ctx: userCtx } = await this.registerUser();
    const pendingNoMfa = await this.ctx();
    pendingNoMfa.getSession().login(userCtx.getSession().userId, "ident", { provider: "email", amr: ["pwd"], mfa: "pending" });
    await rejectsWith(() => this.op("Auth.Totp.Verify", { code: "123456" }, pendingNoMfa), MfaNotEnabled);
  }

  @test
  async recoverEdgeCases() {
    const notPendingCtx = await this.ctx();
    await rejectsWith(() => this.op("Auth.Totp.Recover", { code: "xxxx" }, notPendingCtx), MfaNotPending);

    const { ctx: regCtx } = await this.registerUser();
    const pendingNoMfa = await this.ctx();
    pendingNoMfa.getSession().login(regCtx.getSession().userId, "ident", { provider: "email", amr: ["pwd"], mfa: "pending" });
    await rejectsWith(() => this.op("Auth.Totp.Recover", { code: "xxxx" }, pendingNoMfa), MfaNotEnabled);

    // Lockout during recovery
    const { ctx: recCtx, email: recEmail, password: recPassword } = await this.registerUser();
    const recEnrolled: any = await this.op("Auth.Totp.Enroll", {}, recCtx);
    await this.op("Auth.Totp.Confirm", { code: hotp(recEnrolled.secret, totpStep()) }, recCtx);
    await this.op("Auth.Logout", {}, recCtx);
    await this.op("Auth.Email.Login", { email: recEmail, password: recPassword }, recCtx);

    for (let i = 0; i < 3; i++) {
      await rejectsWith(() => this.op("Auth.Totp.Recover", { code: "bad-code" }, recCtx), InvalidMfaCode);
    }
    await rejectsWith(() => this.op("Auth.Totp.Recover", { code: "bad-code" }, recCtx), Throttled);
  }

  @test
  async disableEdgeCases() {
    const unauthCtx = await this.ctx();
    await assert.rejects(() => this.op("Auth.Totp.Disable", { code: "123456" }, unauthCtx), WebdaError.Unauthorized);

    const { ctx: notVerCtx } = await this.registerUser();
    notVerCtx.getSession().mfa = undefined;
    await assert.rejects(() => this.op("Auth.Totp.Disable", { code: "123456" }, notVerCtx), WebdaError.Unauthorized);

    const { ctx: noMfaCtx } = await this.registerUser();
    noMfaCtx.getSession().mfa = "verified";
    await rejectsWith(() => this.op("Auth.Totp.Disable", { code: "123456" }, noMfaCtx), MfaNotEnabled);
  }

  @test
  async recoveryCodesEdgeCases() {
    const unauthCtx = await this.ctx();
    await assert.rejects(() => this.op("Auth.Totp.RecoveryCodes", { code: "123456" }, unauthCtx), WebdaError.Unauthorized);

    const { ctx: noMfaCtx } = await this.registerUser();
    noMfaCtx.getSession().mfa = "verified";
    await rejectsWith(() => this.op("Auth.Totp.RecoveryCodes", { code: "123456" }, noMfaCtx), MfaNotEnabled);

    const { ctx: userCtx } = await this.registerUser();
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, userCtx);
    const confirmed: any = await this.op("Auth.Totp.Confirm", { code: hotp(enrolled.secret, totpStep()) }, userCtx);
    await rejectsWith(() => this.op("Auth.Totp.RecoveryCodes", { code: "000000" }, userCtx), InvalidMfaCode);

    // Use recovery code to regenerate
    const regenerated: any = await this.op("Auth.Totp.RecoveryCodes", { code: confirmed.recoveryCodes[1] }, userCtx);
    assert.ok(Array.isArray(regenerated.recoveryCodes));
  }

  @test
  async challengeAndTotpServiceFallback() {
    const { ctx: userCtx } = await this.registerUser();
    const user = await runAsSystem(() => this.auth.getUserModel().ref(userCtx.getSession().userId).get());
    await (this.totp as any).challenge(user);

    // check without user.mfa
    const userWithoutMfa = { mfa: undefined } as any;
    assert.strictEqual(await (this.totp as any).check(userWithoutMfa, "123456"), false);

    // startEnrollment with fallback to displayName and UUID
    const nameOnlyUser = {
      getEmail: () => undefined,
      getDisplayName: () => "Display Only",
      getUUID: () => "uuid-123",
      mfa: undefined,
      save: async () => {}
    } as any;
    const res1 = await (this.totp as any).startEnrollment(nameOnlyUser);
    assert.ok(res1.uri.includes("Display%20Only"));

    const uuidOnlyUser = {
      getEmail: () => undefined,
      getDisplayName: () => undefined,
      getUUID: () => "uuid-456",
      mfa: undefined,
      save: async () => {}
    } as any;
    const res2 = await (this.totp as any).startEnrollment(uuidOnlyUser);
    assert.ok(res2.uri.includes("uuid-456"));
  }

  @test
  async completeSecondFactorDirectEdgeCases() {
    const ctx = await this.ctx();
    await rejectsWith(() => this.inContext(ctx, () => this.auth.completeSecondFactor(["totp"])), MfaNotPending);

    const { ctx: userCtx } = await this.registerUser();
    const pendingCtx = await this.ctx();
    pendingCtx.getSession().login(userCtx.getSession().userId, "ident", { provider: "email", amr: ["pwd"], mfa: "pending" });
    await rejectsWith(() => this.inContext(pendingCtx, () => this.auth.completeSecondFactor(["recovery"])), MfaNotEnabled);

    const { ctx: mfaUserCtx } = await this.registerUser();
    const enrolled: any = await this.op("Auth.Totp.Enroll", {}, mfaUserCtx);
    await this.op("Auth.Totp.Confirm", { code: hotp(enrolled.secret, totpStep()) }, mfaUserCtx);
    const pendingCtx2 = await this.ctx();
    pendingCtx2.getSession().login(mfaUserCtx.getSession().userId, "ident", { provider: "email", amr: ["pwd"], mfa: "pending" });
    await rejectsWith(() => this.inContext(pendingCtx2, () => this.auth.completeSecondFactor(["sms"])), MfaNotEnabled);
  }
}
