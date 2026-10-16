import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  hotp,
  Ident,
  listOperations,
  MFA,
  runAsSystem,
  totpStep,
  useApplication,
  useSecondFactor,
  useService,
  WebdaError
} from "@webda/core";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { AuthTest } from "../test/authtest.js";
import { addStubProviders, stubProvidersConfig } from "../test/stubprovider.js";
import { Authentication } from "../authentication.service.js";
import { EmailPasswordProvider } from "../email/emailpassword.service.js";
import { InvalidMfaCode, MfaAlreadyEnabled, MfaNotEnabled, MfaNotPending, Throttled } from "../errors.js";
import { TotpService } from "./totp.service.js";
import { SecondFactorService } from "./secondfactor.service.js";

const code = (cls: { name: string }) => cls.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();

const rejectsWith = (fn: () => Promise<unknown>, cls: { name: string }) =>
  assert.rejects(fn, (err: any) => err.code === code(cls));

class DummyFactorService extends SecondFactorService {
  readonly method = "dummy";
  async startEnrollment(mfa: MFA) {
    mfa.getFactor("dummy");
    return { ready: true };
  }
  async check(_mfa: MFA, submittedCode: string) {
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
        DomainService: { type: "Webda/DomainService", models: ["Webda/User"] },
        AuthStore: {
          type: "Webda/MemoryStore",
          models: ["Webda/User", "Webda/Ident", "Webda/RefreshToken", "Webda/RevokedAccess"]
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
    app.getNamespace = () => "Webda";
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
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    assert.ok(enrolled.secret);
    assert.ok(enrolled.uri.startsWith("otpauth://totp/"));
    assert.ok(enrolled.uri.includes(encodeURIComponent(email)));

    // 2. Confirm with valid code
    const step = totpStep();
    const confirmCode = hotp(enrolled.secret, step);
    const confirmed: any = await this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, ctx);
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
    assert.strictEqual(ctx.getSession().mfaVerifications, undefined);

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
    const verifyRes: any = await this.op("User.Mfa.Verify", { method: "totp", code: verifyCode }, ctx);
    assert.strictEqual(verifyRes.status, "ok");
    assert.ok(verifyRes.accessToken);
    assert.ok(verifyRes.refreshToken);
    assert.strictEqual(ctx.getSession().mfa, "verified");
    assert.deepStrictEqual(ctx.getSession().amr, ["pwd", "totp"]);
    assert.ok(this.events.includes("Authentication.MfaVerified"));
    const verified = ctx.getSession().mfaVerifications["User.Mfa.Verify"];
    assert.strictEqual(verified.method, "totp");
    const claims = await useService("TokenService").verifyAccess(verifyRes.accessToken);
    assert.deepStrictEqual(claims.mfaVerifications["User.Mfa.Verify"], verified);
  }

  @test
  async wrongCodeAndReplayRejected() {
    const { ctx, email, password } = await this.registerUser();
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, ctx);

    // Logout and start login
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.ok(ctx.getSession().isPending());

    // Wrong code fails with 401 InvalidMfaCode
    await rejectsWith(() => this.op("User.Mfa.Verify", { method: "totp", code: "000000" }, ctx), InvalidMfaCode);
    assert.ok(this.events.includes("Authentication.MfaFailed"));

    // Valid code succeeds
    const nextStep = totpStep() + 1;
    const validCode = hotp(enrolled.secret, nextStep);
    const res: any = await this.op("User.Mfa.Verify", { method: "totp", code: validCode }, ctx);
    assert.strictEqual(res.status, "ok");

    // Login again to test replay
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.ok(ctx.getSession().isPending());

    // Replay of same code is rejected with identical 401 InvalidMfaCode
    await rejectsWith(() => this.op("User.Mfa.Verify", { method: "totp", code: validCode }, ctx), InvalidMfaCode);
  }

  @test
  async lockoutAfterFailuresThenUnlock() {
    const { ctx, email, password } = await this.registerUser();
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, ctx);

    // Logout and start login
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);

    // 3 failures cross the threshold (failedBeforeDelay = 3)
    for (let i = 0; i < 3; i++) {
      await rejectsWith(() => this.op("User.Mfa.Verify", { method: "totp", code: "999999" }, ctx), InvalidMfaCode);
    }

    // 4th attempt is locked out (429 Throttled)
    await rejectsWith(() => this.op("User.Mfa.Verify", { method: "totp", code: "999999" }, ctx), Throttled);

    // Even with the correct code, lockout refuses
    const validCode = hotp(enrolled.secret, totpStep() + 1);
    await rejectsWith(() => this.op("User.Mfa.Verify", { method: "totp", code: validCode }, ctx), Throttled);

    // Wait for lockout (1000 ms in test config)
    await new Promise(resolve => setTimeout(resolve, 1100));

    // After lockout expires, valid code succeeds
    const freshCode = hotp(enrolled.secret, totpStep() + 1);
    const okRes: any = await this.op("User.Mfa.Verify", { method: "totp", code: freshCode }, ctx);
    assert.strictEqual(okRes.status, "ok");
  }

  @test
  async recoverWithRecoveryCodeAndReuseFails() {
    const { ctx, email, password } = await this.registerUser();
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    const confirmed: any = await this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, ctx);
    const recoveryCode = confirmed.recoveryCodes[0];

    // Logout and start login
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.ok(ctx.getSession().isPending());

    // Recover using recovery code
    const res: any = await this.op("User.Mfa.Recover", { code: recoveryCode }, ctx);
    assert.strictEqual(res.status, "ok");
    assert.ok(res.accessToken);
    assert.strictEqual(ctx.getSession().mfa, "verified");
    assert.deepStrictEqual(ctx.getSession().amr, ["pwd", "recovery"]);
    assert.strictEqual(ctx.getSession().mfaVerifications["User.Mfa.Recover"].method, "recovery");

    // Logout and login again
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.ok(ctx.getSession().isPending());

    // Reusing the same recovery code fails
    await rejectsWith(() => this.op("User.Mfa.Recover", { code: recoveryCode }, ctx), InvalidMfaCode);

    // Another recovery code still works
    const secondRecoveryCode = confirmed.recoveryCodes[1];
    const secondRes: any = await this.op("User.Mfa.Recover", { code: secondRecoveryCode }, ctx);
    assert.strictEqual(secondRes.status, "ok");
  }

  @test
  async verifyRequiresIdentityAndSupportsStepUp() {
    const anonymous = await this.ctx();
    await rejectsWith(
      () => this.op("User.Mfa.Verify", { method: "totp", code: "123456" }, anonymous),
      WebdaError.Unauthorized
    );
    const { ctx } = await this.registerUser();
    await this.op("User.Mfa.Enroll", { method: "dummy" }, ctx);
    await this.op("User.Mfa.Confirm", { method: "dummy", code: "FIXED_CODE_42" }, ctx);
    const result = await this.op("User.Mfa.Verify", { method: "dummy", code: "FIXED_CODE_42" }, ctx);
    assert.ok(result.proof);
    assert.strictEqual(result.accessToken, undefined);
    const status = ctx.getSession().mfaVerifications["User.Mfa.Verify"];
    assert.strictEqual(status.method, "dummy");
    assert.strictEqual(status.owner, `Webda/User/${ctx.getSession().userId}`);
    assert.ok(Date.now() - status.verifiedAt < 1000);
    await rejectsWith(() => this.op("User.Mfa.Verify", { method: "dummy", code: "bad" }, ctx), InvalidMfaCode);
    assert.deepStrictEqual(ctx.getSession().mfaVerifications["User.Mfa.Verify"], status);
  }

  @test
  async enrollWhileEnabledRefused() {
    const { ctx } = await this.registerUser();
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, ctx);

    // Calling enroll while enabled throws 409 MfaAlreadyEnabled
    await rejectsWith(() => this.op("User.Mfa.Enroll", { method: "totp" }, ctx), MfaAlreadyEnabled);
  }

  @test
  async disableRequiresValidCode() {
    const { ctx, email, password } = await this.registerUser();
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    const confirmed: any = await this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, ctx);

    // Disable with wrong code fails
    await rejectsWith(() => this.op("User.Mfa.Disable", { method: "totp", code: "000000" }, ctx), InvalidMfaCode);

    // Disable with valid TOTP code succeeds
    const disableCode = hotp(enrolled.secret, totpStep() + 1);
    await this.op("User.Mfa.Disable", { method: "totp", code: disableCode }, ctx);
    assert.ok(this.events.includes("Authentication.MfaDisabled"));

    // Login directly succeeds without MFA gate
    await this.op("Auth.Logout", {}, ctx);
    const directLogin: any = await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.strictEqual(directLogin.status, "ok");
    assert.ok(directLogin.accessToken);

    // Re-enroll, confirm, then disable using a recovery code
    const reEnrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    const reConfirmCode = hotp(reEnrolled.secret, totpStep());
    const reConfirmed: any = await this.op("User.Mfa.Confirm", { method: "totp", code: reConfirmCode }, ctx);
    assert.strictEqual(ctx.getSession().mfa, "verified");

    // Disable using recovery code
    await this.op("User.Mfa.Disable", { method: "totp", code: reConfirmed.recoveryCodes[0] }, ctx);

    // Login again works directly
    await this.op("Auth.Logout", {}, ctx);
    const againRes: any = await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.strictEqual(againRes.status, "ok");
  }

  @test
  async confirmRevokesOtherRefreshFamilies() {
    const { ctx: browserA, email, password, res: registered } = await this.registerUser();
    const browserB = await this.ctx();

    // Login from browser B
    const loginB: any = await this.op("Auth.Email.Login", { email, password }, browserB);
    assert.strictEqual(loginB.status, "ok");
    const refreshB = loginB.refreshToken;

    // Browser A enrolls and confirms TOTP
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, browserA);
    const confirmCode = hotp(enrolled.secret, totpStep());
    const confirmed: any = await this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, browserA);

    // Browser B's refresh token was revoked by confirm()
    await assert.rejects(() => this.op("Auth.Refresh", { refreshToken: refreshB }, browserB), {
      code: "TOKEN_INVALID"
    });

    // Browser A's own pre-MFA refresh token is revoked too: confirm() returns its replacement
    await assert.rejects(() => this.op("Auth.Refresh", { refreshToken: registered.refreshToken }, browserA), {
      code: "TOKEN_INVALID"
    });
    assert.ok(confirmed.accessToken);
    const refreshed: any = await this.op("Auth.Refresh", { refreshToken: confirmed.refreshToken }, browserA);
    assert.ok(refreshed.accessToken);
    assert.strictEqual(browserA.getSession().mfa, "verified");
  }

  @test
  async oauthLoginAlsoGated() {
    const { ctx } = await this.registerUser("google-user@example.com", "password123");
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, ctx);

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
    const verifyRes: any = await this.op("User.Mfa.Verify", { method: "totp", code: validCode }, oauthCtx);
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
    const enrollRes: any = await this.op("User.Mfa.Enroll", { method: "dummy" }, ctx);
    assert.strictEqual(enrollRes.ready, true);

    // Confirm with fixed code
    const confirmRes: any = await this.op("User.Mfa.Confirm", { method: "dummy", code: "FIXED_CODE_42" }, ctx);
    assert.ok(Array.isArray(confirmRes.recoveryCodes));

    // Logout and login
    await this.op("Auth.Logout", {}, ctx);
    const loginRes: any = await this.op("Auth.Email.Login", { email: "ext@example.com", password: "password123" }, ctx);
    assert.strictEqual(loginRes.status, "mfa_required");
    assert.deepStrictEqual(loginRes.methods, ["dummy"]);

    // Verify with fixed code
    const verifyRes: any = await this.op("User.Mfa.Verify", { method: "dummy", code: "FIXED_CODE_42" }, ctx);
    assert.strictEqual(verifyRes.status, "ok");
    assert.deepStrictEqual(ctx.getSession().amr, ["pwd", "dummy"]);
  }

  @test
  async recoveryCodesRegenerate() {
    const { ctx } = await this.registerUser("rec@example.com", "password123");
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    const confirmCode = hotp(enrolled.secret, totpStep());
    const confirmed: any = await this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, ctx);
    const originalFirstCode = confirmed.recoveryCodes[0];

    // Regenerate recovery codes using valid TOTP code
    const regenCode = hotp(enrolled.secret, totpStep() + 1);
    const regenerated: any = await this.op("User.Mfa.RecoveryCodes", { code: regenCode }, ctx);
    assert.ok(Array.isArray(regenerated.recoveryCodes));
    assert.strictEqual(regenerated.recoveryCodes.length, 10);
    assert.notDeepStrictEqual(regenerated.recoveryCodes, confirmed.recoveryCodes);

    // Logout and login
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email: "rec@example.com", password: "password123" }, ctx);

    // Old recovery code fails
    await rejectsWith(() => this.op("User.Mfa.Recover", { code: originalFirstCode }, ctx), InvalidMfaCode);

    // New recovery code succeeds
    const newCode = regenerated.recoveryCodes[0];
    const recoverRes: any = await this.op("User.Mfa.Recover", { code: newCode }, ctx);
    assert.strictEqual(recoverRes.status, "ok");
  }

  @test
  async enrollmentUnauthorizedAndReauth() {
    const unauthCtx = await this.ctx();
    await assert.rejects(() => this.op("User.Mfa.Enroll", { method: "totp" }, unauthCtx), WebdaError.Unauthorized);

    const { ctx } = await this.registerUser();
    ctx.getSession().authAt = Date.now() - 400000;
    await assert.rejects(() => this.op("User.Mfa.Enroll", { method: "totp" }, ctx), WebdaError.Unauthorized);
  }

  @test
  async confirmEdgeCases() {
    const unauthCtx = await this.ctx();
    await assert.rejects(
      () => this.op("User.Mfa.Confirm", { method: "totp", code: "123456" }, unauthCtx),
      WebdaError.Unauthorized
    );

    const { ctx } = await this.registerUser();
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    await rejectsWith(() => this.op("User.Mfa.Confirm", { method: "totp", code: "000000" }, ctx), InvalidMfaCode);
    const confirmCode = hotp(enrolled.secret, totpStep());
    await this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, ctx);
    await rejectsWith(() => this.op("User.Mfa.Confirm", { method: "totp", code: confirmCode }, ctx), MfaAlreadyEnabled);

    // recoveryCodes = 0 in service parameters
    const prevRecovery = this.totp.parameters.recoveryCodes;
    this.totp.parameters.recoveryCodes = 0;
    try {
      const { ctx: zeroCtx } = await this.registerUser();
      const enZero: any = await this.op("User.Mfa.Enroll", { method: "totp" }, zeroCtx);
      // A session without amr (restored from an older token) still ends up with the factor
      zeroCtx.getSession().amr = undefined;
      const confZero: any = await this.op(
        "User.Mfa.Confirm",
        { method: "totp", code: hotp(enZero.secret, totpStep()) },
        zeroCtx
      );
      assert.deepStrictEqual(confZero.recoveryCodes, []);
      assert.deepStrictEqual(zeroCtx.getSession().amr, ["totp"]);
    } finally {
      this.totp.parameters.recoveryCodes = prevRecovery;
    }
  }

  @test
  async verifyEdgeCases() {
    const { ctx: userCtx } = await this.registerUser();
    const pendingNoMfa = await this.ctx();
    pendingNoMfa
      .getSession()
      .login(userCtx.getSession().userId, "ident", { provider: "email", amr: ["pwd"], mfa: "pending" });
    await rejectsWith(
      () => this.op("User.Mfa.Verify", { method: "totp", code: "123456" }, pendingNoMfa),
      MfaNotEnabled
    );
  }

  @test
  async recoverEdgeCases() {
    const notPendingCtx = await this.ctx();
    await rejectsWith(() => this.op("User.Mfa.Recover", { code: "xxxx" }, notPendingCtx), WebdaError.Unauthorized);

    const { ctx: regCtx } = await this.registerUser();
    const pendingNoMfa = await this.ctx();
    pendingNoMfa
      .getSession()
      .login(regCtx.getSession().userId, "ident", { provider: "email", amr: ["pwd"], mfa: "pending" });
    await rejectsWith(() => this.op("User.Mfa.Recover", { code: "xxxx" }, pendingNoMfa), MfaNotEnabled);

    // Lockout during recovery
    const { ctx: recCtx, email: recEmail, password: recPassword } = await this.registerUser();
    const recEnrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, recCtx);
    await this.op("User.Mfa.Confirm", { method: "totp", code: hotp(recEnrolled.secret, totpStep()) }, recCtx);
    await this.op("Auth.Logout", {}, recCtx);
    await this.op("Auth.Email.Login", { email: recEmail, password: recPassword }, recCtx);

    for (let i = 0; i < 3; i++) {
      await rejectsWith(() => this.op("User.Mfa.Recover", { code: "bad-code" }, recCtx), InvalidMfaCode);
    }
    await rejectsWith(() => this.op("User.Mfa.Recover", { code: "bad-code" }, recCtx), Throttled);
  }

  @test
  async disableEdgeCases() {
    const unauthCtx = await this.ctx();
    await assert.rejects(
      () => this.op("User.Mfa.Disable", { method: "totp", code: "123456" }, unauthCtx),
      WebdaError.Unauthorized
    );

    const { ctx: notVerCtx } = await this.registerUser();
    notVerCtx.getSession().mfa = undefined;
    await assert.rejects(
      () => this.op("User.Mfa.Disable", { method: "totp", code: "123456" }, notVerCtx),
      WebdaError.Unauthorized
    );

    const { ctx: noMfaCtx } = await this.registerUser();
    noMfaCtx.getSession().mfa = "verified";
    await rejectsWith(() => this.op("User.Mfa.Disable", { method: "totp", code: "123456" }, noMfaCtx), MfaNotEnabled);

    // Disabling one of two factors keeps the other one and the recovery codes
    const { ctx: bothCtx } = await this.registerUser();
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, bothCtx);
    await this.op("User.Mfa.Confirm", { method: "totp", code: hotp(enrolled.secret, totpStep()) }, bothCtx);
    await this.op("User.Mfa.Enroll", { method: "dummy" }, bothCtx);
    await this.op("User.Mfa.Confirm", { method: "dummy", code: "FIXED_CODE_42" }, bothCtx);
    const loadUser = () => runAsSystem(() => this.auth.getUserModel().ref(bothCtx.getSession().userId).get());
    const before = (await loadUser()).mfa!.__recoveryCodes;
    assert.ok(before?.length);
    await this.op("User.Mfa.Disable", { method: "totp", code: hotp(enrolled.secret, totpStep() + 1) }, bothCtx);
    const after = (await loadUser()).mfa!;
    assert.deepStrictEqual(after.methods(), ["dummy"]);
    assert.deepStrictEqual(after.__recoveryCodes, before);
  }

  @test
  async recoveryCodesEdgeCases() {
    const unauthCtx = await this.ctx();
    await assert.rejects(
      () => this.op("User.Mfa.RecoveryCodes", { code: "123456" }, unauthCtx),
      WebdaError.Unauthorized
    );

    const { ctx: noMfaCtx } = await this.registerUser();
    noMfaCtx.getSession().mfa = "verified";
    await rejectsWith(() => this.op("User.Mfa.RecoveryCodes", { code: "123456" }, noMfaCtx), MfaNotEnabled);

    const { ctx: userCtx } = await this.registerUser();
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, userCtx);
    const confirmed: any = await this.op(
      "User.Mfa.Confirm",
      { method: "totp", code: hotp(enrolled.secret, totpStep()) },
      userCtx
    );
    await rejectsWith(() => this.op("User.Mfa.RecoveryCodes", { code: "000000" }, userCtx), InvalidMfaCode);

    // Use recovery code to regenerate
    const regenerated: any = await this.op("User.Mfa.RecoveryCodes", { code: confirmed.recoveryCodes[1] }, userCtx);
    assert.ok(Array.isArray(regenerated.recoveryCodes));
  }

  @test
  async totpEnrollmentLabels() {
    // Each second factor service is the provider of its method for the MFA behavior of every model
    assert.strictEqual(useSecondFactor("totp"), this.totp);
    assert.strictEqual(useSecondFactor("dummy"), useService("dummyService" as any));

    // The account label falls back to the display name, then to the primary key of any owner
    const mfa = new MFA();
    const nameOnly = { getEmail: () => undefined, getDisplayName: () => "Display Only", getUUID: () => "uuid-123" };
    const res1 = await this.totp.startEnrollment(mfa, nameOnly);
    assert.ok(res1.uri.includes("Display%20Only"));

    const uuidOnlyUser = { getUUID: () => "uuid-456" };
    const res2 = await this.totp.startEnrollment(mfa, uuidOnlyUser);
    assert.ok(res2.uri.includes("uuid-456"));
    assert.strictEqual((await mfa.totp.get())!.secret, res2.secret);

    // Issuer falls back to "Webda" when the application package has no name
    const app = useApplication();
    const getPackageDescription = app.getPackageDescription;
    app.getPackageDescription = () => ({}) as any;
    try {
      const res3 = await this.totp.startEnrollment(mfa, uuidOnlyUser);
      assert.ok(res3.uri.startsWith("otpauth://totp/Webda:uuid-456?"), res3.uri);
    } finally {
      app.getPackageDescription = getPackageDescription;
    }
  }

  @test
  async completeSecondFactorDirectEdgeCases() {
    const ctx = await this.ctx();
    await rejectsWith(() => this.inContext(ctx, () => this.auth.completeSecondFactor(["totp"])), MfaNotPending);

    const { ctx: userCtx } = await this.registerUser();
    const pendingCtx = await this.ctx();
    pendingCtx
      .getSession()
      .login(userCtx.getSession().userId, "ident", { provider: "email", amr: ["pwd"], mfa: "pending" });
    await rejectsWith(
      () => this.inContext(pendingCtx, () => this.auth.completeSecondFactor(["recovery"])),
      MfaNotEnabled
    );

    const { ctx: mfaUserCtx } = await this.registerUser();
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, mfaUserCtx);
    await this.op("User.Mfa.Confirm", { method: "totp", code: hotp(enrolled.secret, totpStep()) }, mfaUserCtx);
    const pendingCtx2 = await this.ctx();
    pendingCtx2
      .getSession()
      .login(mfaUserCtx.getSession().userId, "ident", { provider: "email", amr: ["pwd"], mfa: "pending" });
    await rejectsWith(() => this.inContext(pendingCtx2, () => this.auth.completeSecondFactor(["sms"])), MfaNotEnabled);

    // A pending session without amr completes with the second factor alone
    const pendingCtx3 = await this.ctx();
    pendingCtx3.getSession().login(mfaUserCtx.getSession().userId, mfaUserCtx.getSession().identUsed, {
      provider: "email",
      mfa: "pending"
    });
    pendingCtx3.getSession().amr = undefined;
    const res: any = await this.inContext(pendingCtx3, () => this.auth.completeSecondFactor(["totp"]));
    assert.strictEqual(res.status, "ok");
    assert.deepStrictEqual(pendingCtx3.getSession().amr, ["totp"]);
  }

  @test
  async confirmDisableAndRecoveryCodesThrottled() {
    // Confirm: wrong codes are counted, a valid code is refused once locked
    const { ctx } = await this.registerUser();
    const enrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    for (let i = 0; i < 3; i++) {
      await rejectsWith(() => this.op("User.Mfa.Confirm", { method: "totp", code: "000000" }, ctx), InvalidMfaCode);
    }
    assert.ok(this.events.includes("Authentication.MfaFailed"));
    await rejectsWith(
      () => this.op("User.Mfa.Confirm", { method: "totp", code: hotp(enrolled.secret, totpStep()) }, ctx),
      Throttled
    );

    // A success clears the counter: a fresh user confirms after two failures, then disable and recovery codes count
    const { ctx: other } = await this.registerUser();
    const otherEnrolled: any = await this.op("User.Mfa.Enroll", { method: "totp" }, other);
    for (let i = 0; i < 2; i++) {
      await rejectsWith(() => this.op("User.Mfa.Confirm", { method: "totp", code: "000000" }, other), InvalidMfaCode);
    }
    await this.op("User.Mfa.Confirm", { method: "totp", code: hotp(otherEnrolled.secret, totpStep()) }, other);
    const user = await runAsSystem(() => this.auth.getUserModel().ref(other.getSession().userId).get());
    assert.strictEqual(user._mfaAttempts, 0);

    await rejectsWith(() => this.op("User.Mfa.Disable", { method: "totp", code: "000000" }, other), InvalidMfaCode);
    await rejectsWith(() => this.op("User.Mfa.RecoveryCodes", { code: "000000" }, other), InvalidMfaCode);
    await rejectsWith(() => this.op("User.Mfa.Disable", { method: "totp", code: "000000" }, other), InvalidMfaCode);
    await rejectsWith(
      () => this.op("User.Mfa.Disable", { method: "totp", code: hotp(otherEnrolled.secret, totpStep() + 1) }, other),
      Throttled
    );
  }

  @test
  async sharedOperationsServeEveryFactor() {
    // One recover / recovery-codes operation for all factors: no per-method duplicate on the same route
    const ops = listOperations();
    for (const id of [
      "Auth.Totp.Recover",
      "Auth.Totp.RecoveryCodes",
      "Auth.Dummy.Recover",
      "Auth.Dummy.RecoveryCodes"
    ]) {
      assert.strictEqual(ops[id], undefined, id);
    }
    assert.ok(ops["User.Mfa.Recover"]);
    assert.ok(ops["User.Mfa.RecoveryCodes"]);

    // A user with only the dummy factor regenerates its recovery codes with a dummy code
    const { ctx } = await this.registerUser();
    await this.op("User.Mfa.Enroll", { method: "dummy" }, ctx);
    await this.op("User.Mfa.Confirm", { method: "dummy", code: "FIXED_CODE_42" }, ctx);
    const regenerated: any = await this.op("User.Mfa.RecoveryCodes", { code: "FIXED_CODE_42" }, ctx);
    assert.strictEqual(regenerated.recoveryCodes.length, 10);
  }
}
