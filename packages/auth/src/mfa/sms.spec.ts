import { suite, test } from "@webda/test";
import * as assert from "assert";
import { DebugSmsSender, MFA, runAsSystem, useService, WebdaError } from "@webda/core";
import { WEBDA_STORAGE } from "@webda/models";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { AuthTest } from "../test/authtest.js";
import { Authentication } from "../authentication.service.js";
import { EmailPasswordProvider } from "../email/emailpassword.service.js";
import { InvalidMfaCode, InvalidPhone, MfaAlreadyEnabled, MfaNotEnabled, Throttled } from "../errors.js";
import { TotpService } from "./totp.service.js";
import { maskPhone, normalizePhone, SmsMfaParameters, SmsMfaService } from "./sms.service.js";

const code = (cls: { name: string }) => cls.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();

const rejectsWith = (fn: () => Promise<unknown>, cls: { name: string }) =>
  assert.rejects(fn, (err: any) => err.code === code(cls));

const PHONE = "+15550100089";

@suite
class SmsMfaTest extends AuthTest {
  auth: Authentication;
  sms: SmsMfaService;
  sender: DebugSmsSender;

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
        SmsSender: { type: "WebdaTest/SmsSender" },
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
        totpService: { type: "Webda/TotpService" },
        smsService: {
          type: "Webda/SmsMfaService",
          app: "Webda Test",
          resendDelay: 0,
          throttle: { failedBeforeDelay: 3, lockout: 1000 }
        }
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.getNamespace = () => "Webda";
    app.addModda("Webda/Authentication", Authentication as any);
    app.addModda("Webda/EmailPasswordProvider", EmailPasswordProvider as any);
    app.addModda("Webda/TotpService", TotpService as any);
    app.addModda("Webda/SmsMfaService", SmsMfaService as any);
    app.addModda("WebdaTest/SmsSender", DebugSmsSender as any);
  }

  async beforeEach() {
    await super.beforeEach();
    this.auth = useService("Authentication" as any);
    this.sms = useService("smsService" as any);
    this.sender = useService("SmsSender" as any);
    this.sender.sent = [];
  }

  private userSeq = 0;

  /**
   * Register a user and return its logged-in context
   * @returns context and credentials
   */
  async registerUser() {
    this.userSeq++;
    const email = `sms-${this.userSeq}-${Date.now()}@example.com`;
    const password = "password123";
    const ctx = await this.ctx();
    const res: any = await this.op("Auth.Email.Register", { email, password, profile: { displayName: "Sms" } }, ctx);
    assert.strictEqual(res.status, "ok");
    return { ctx, email, password };
  }

  /**
   * @returns the code of the last SMS sent
   */
  lastCode(): string {
    const last = this.sender.sent[this.sender.sent.length - 1];
    return /(\d{6})/.exec(last.message)![1];
  }

  /**
   * Register a user with a confirmed SMS factor
   * @returns context, credentials and recovery codes
   */
  async enrolledUser() {
    const user = await this.registerUser();
    await this.op("User.Mfa.Enroll", { method: "sms", input: { phone: PHONE } }, user.ctx);
    const confirmed: any = await this.op("User.Mfa.Confirm", { method: "sms", code: this.lastCode() }, user.ctx);
    return { ...user, recoveryCodes: confirmed.recoveryCodes as string[] };
  }

  @test
  async enrollConfirmLoginChallengeVerify() {
    const { ctx, email, password } = await this.registerUser();

    // Enrollment normalises the phone, sends a code and never outputs the full phone
    const enrolled: any = await this.op(
      "User.Mfa.Enroll",
      { method: "sms", input: { phone: "+1 (555) 010-0089" } },
      ctx
    );
    assert.deepStrictEqual(enrolled, { phone: "+1********89", expiresIn: 300 });
    assert.strictEqual(this.sender.sent.length, 1);
    assert.strictEqual(this.sender.sent[0].to, PHONE);
    assert.match(this.sender.sent[0].message, /^\d{6} is your Webda Test verification code$/);

    // Confirming verifies the phone and enables the factor
    const confirmed: any = await this.op("User.Mfa.Confirm", { method: "sms", code: this.lastCode() }, ctx);
    assert.strictEqual(confirmed.recoveryCodes.length, 10);
    assert.strictEqual(ctx.getSession().mfa, "verified");
    assert.ok(ctx.getSession().amr!.includes("sms"));

    // The stored user holds the phone encrypted only
    const user = await runAsSystem(() => this.auth.getUserModel().ref(ctx.getSession().userId!).get());
    assert.ok(user.mfa!.isEnabled("sms"));
    assert.ok(!JSON.stringify(user).includes("5550100089"));
    assert.strictEqual((user as any).phoneVerifiedAt, undefined);

    // Login requires the second factor
    await this.op("Auth.Logout", {}, ctx);
    const login: any = await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.strictEqual(login.status, "mfa_required");
    assert.deepStrictEqual(login.methods, ["sms"]);

    // The pending session asks for a code, then verifies it
    const challenge: any = await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
    assert.deepStrictEqual(challenge, { phone: "+1********89", expiresIn: 300 });
    assert.strictEqual(this.sender.sent.length, 2);
    const verified: any = await this.op("User.Mfa.Verify", { method: "sms", code: this.lastCode() }, ctx);
    assert.strictEqual(verified.status, "ok");
    assert.ok(verified.accessToken);
    assert.deepStrictEqual(ctx.getSession().amr, ["pwd", "sms"]);
    assert.strictEqual(ctx.getSession().mfaVerifications!["User.Mfa.Verify"].method, "sms");

    // A logged session can ask for a code too (step-up)
    await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
    const proof: any = await this.op("User.Mfa.Verify", { method: "sms", code: this.lastCode() }, ctx);
    assert.strictEqual(proof.method, "sms");
    assert.ok(proof.proof);
  }

  @test
  async wrongExpiredAndReusedCodes() {
    const { ctx, email, password } = await this.enrolledUser();
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);

    // No code was sent since the confirmation: the confirmation code was consumed
    await rejectsWith(() => this.op("User.Mfa.Verify", { method: "sms", code: "000000" }, ctx), InvalidMfaCode);

    // A wrong code is refused, the right one accepted once
    await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
    const sent = this.lastCode();
    const wrong = sent === "123456" ? "654321" : "123456";
    await rejectsWith(() => this.op("User.Mfa.Verify", { method: "sms", code: wrong }, ctx), InvalidMfaCode);
    assert.strictEqual((await this.op<any>("User.Mfa.Verify", { method: "sms", code: sent }, ctx)).status, "ok");
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    await rejectsWith(() => this.op("User.Mfa.Verify", { method: "sms", code: sent }, ctx), InvalidMfaCode);

    // A new challenge replaces the previous code
    await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
    const first = this.lastCode();
    await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
    if (first !== this.lastCode()) {
      await rejectsWith(() => this.op("User.Mfa.Verify", { method: "sms", code: first }, ctx), InvalidMfaCode);
    }

    // An expired code is refused
    const ttl = this.sms.parameters.ttl;
    this.sms.parameters.ttl = 1;
    try {
      const challenge: any = await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
      assert.strictEqual(challenge.expiresIn, 1);
      const expiring = this.lastCode();
      await new Promise(resolve => setTimeout(resolve, 1100));
      await rejectsWith(() => this.op("User.Mfa.Verify", { method: "sms", code: expiring }, ctx), InvalidMfaCode);
    } finally {
      this.sms.parameters.ttl = ttl;
    }
  }

  @test
  async resendIsThrottled() {
    const { ctx } = await this.registerUser();
    const resendDelay = this.sms.parameters.resendDelay;
    this.sms.parameters.resendDelay = "60s";
    try {
      await this.op("User.Mfa.Enroll", { method: "sms", input: { phone: PHONE } }, ctx);
      // Neither a new challenge nor a re-enrollment sends another SMS before the delay
      await rejectsWith(() => this.op("User.Mfa.Challenge", { method: "sms" }, ctx), Throttled);
      await rejectsWith(
        () => this.op("User.Mfa.Enroll", { method: "sms", input: { phone: "+33612345678" } }, ctx),
        Throttled
      );
      assert.strictEqual(this.sender.sent.length, 1);
      // The code sent is still valid
      await this.op("User.Mfa.Confirm", { method: "sms", code: this.lastCode() }, ctx);
      await rejectsWith(() => this.op("User.Mfa.Challenge", { method: "sms" }, ctx), Throttled);
      this.sms.parameters.resendDelay = 0;
      await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
      assert.strictEqual(this.sender.sent.length, 2);
    } finally {
      this.sms.parameters.resendDelay = resendDelay;
    }
  }

  @test
  async lockoutAfterFailedAttempts() {
    const { ctx, email, password } = await this.enrolledUser();
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
    const sent = this.lastCode();
    const wrong = sent === "123456" ? "654321" : "123456";
    for (let i = 0; i < 3; i++) {
      await rejectsWith(() => this.op("User.Mfa.Verify", { method: "sms", code: wrong }, ctx), InvalidMfaCode);
    }
    // Locked: even the right code is refused
    await rejectsWith(() => this.op("User.Mfa.Verify", { method: "sms", code: sent }, ctx), Throttled);
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.strictEqual((await this.op<any>("User.Mfa.Verify", { method: "sms", code: sent }, ctx)).status, "ok");
  }

  @test
  async recoveryCodeAndDisable() {
    const { ctx, email, password, recoveryCodes } = await this.enrolledUser();
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    const recovered: any = await this.op("User.Mfa.Recover", { code: recoveryCodes[0] }, ctx);
    assert.strictEqual(recovered.status, "ok");
    assert.deepStrictEqual(ctx.getSession().amr, ["pwd", "recovery"]);

    // Disable with a fresh SMS code
    await rejectsWith(() => this.op("User.Mfa.Disable", { method: "sms", code: "000000" }, ctx), InvalidMfaCode);
    await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
    await this.op("User.Mfa.Disable", { method: "sms", code: this.lastCode() }, ctx);
    await rejectsWith(() => this.op("User.Mfa.Challenge", { method: "sms" }, ctx), MfaNotEnabled);
    await this.op("Auth.Logout", {}, ctx);
    assert.strictEqual((await this.op<any>("Auth.Email.Login", { email, password }, ctx)).status, "ok");
  }

  @test
  async enrollmentAndChallengeEdgeCases() {
    // Anonymous
    const anonymous = await this.ctx();
    await assert.rejects(() => this.op("User.Mfa.Challenge", { method: "sms" }, anonymous), WebdaError.Unauthorized);

    const { ctx, email, password } = await this.registerUser();
    // Invalid or missing phone
    for (const input of [{ phone: "0555010089" }, { phone: "+0123456789" }, { phone: "+1 555" }, {}, undefined]) {
      await rejectsWith(() => this.op("User.Mfa.Enroll", { method: "sms", input }, ctx), InvalidPhone);
    }
    assert.strictEqual(this.sender.sent.length, 0);
    // Nothing enrolled, then a method without challenge
    await rejectsWith(() => this.op("User.Mfa.Challenge", { method: "sms" }, ctx), MfaNotEnabled);
    await this.op("User.Mfa.Enroll", { method: "totp" }, ctx);
    await rejectsWith(() => this.op("User.Mfa.Challenge", { method: "totp" }, ctx), MfaNotEnabled);

    // A pending enrollment can be re-sent while logged, but not challenged by a pending login session
    await this.op("User.Mfa.Enroll", { method: "sms", input: { phone: PHONE } }, ctx);
    await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
    assert.strictEqual(this.sender.sent.length, 2);
    const pending = await this.ctx();
    pending.getSession().login(ctx.getSession().userId!, "ident", { provider: "email", amr: ["pwd"], mfa: "pending" });
    await rejectsWith(() => this.op("User.Mfa.Challenge", { method: "sms" }, pending), MfaNotEnabled);

    // Re-enrolling a pending factor replaces the phone
    await this.op("User.Mfa.Enroll", { method: "sms", input: { phone: "+33 6 12 34 56 78" } }, ctx);
    assert.strictEqual(this.sender.sent[this.sender.sent.length - 1].to, "+33612345678");
    await this.op("User.Mfa.Confirm", { method: "sms", code: this.lastCode() }, ctx);
    await rejectsWith(
      () => this.op("User.Mfa.Enroll", { method: "sms", input: { phone: PHONE } }, ctx),
      MfaAlreadyEnabled
    );

    // Once confirmed, a pending login session receives its codes on the new phone
    await this.op("Auth.Logout", {}, ctx);
    await this.op("Auth.Email.Login", { email, password }, ctx);
    await this.op("User.Mfa.Challenge", { method: "sms" }, ctx);
    assert.strictEqual(this.sender.sent[this.sender.sent.length - 1].to, "+33612345678");
  }

  @test
  async phoneHelpersAndMessageTemplate() {
    assert.strictEqual(normalizePhone(" +44 (20) 7946-0958 "), "+442079460958");
    assert.strictEqual(normalizePhone("+1.555.010.0089"), PHONE);
    for (const invalid of ["", "15550100089", "+1555", "+0555010089", "+1555010008912345", "+1 555 abc 0089", 42]) {
      assert.strictEqual(normalizePhone(invalid as any), undefined, String(invalid));
    }
    assert.strictEqual(maskPhone(PHONE), "+1********89");
    assert.strictEqual(maskPhone("+3361234"), "+3****34");

    // Custom template and digits, the application name by default
    const params = this.sms.parameters;
    const saved = { message: params.message, digits: params.digits, app: params.app };
    params.message = "{app}: {code} ({code})";
    params.digits = 8;
    params.app = undefined;
    try {
      const mfa = new MFA();
      await this.sms.startEnrollment(mfa, {}, { phone: PHONE });
      const message = this.sender.sent[this.sender.sent.length - 1].message;
      const match = /^(.+): (\d{8}) \((\d{8})\)$/.exec(message);
      assert.ok(match, message);
      assert.strictEqual(match![2], match![3]);
      assert.ok(match![1].length > 0);
      assert.strictEqual(await this.sms.check(mfa, match![2]), true);
      assert.strictEqual(await this.sms.check(mfa, match![2]), false);
      // Malformed submissions are refused without throwing
      await this.sms.challenge(mfa, {});
      for (const bad of [undefined, null, 12345678, "", "1234567"]) {
        assert.strictEqual(await this.sms.check(mfa, bad as any), false);
      }
      // A detached factor without phone cannot be challenged
      await rejectsWith(() => this.sms.challenge(new MFA(), {}), MfaNotEnabled);
    } finally {
      Object.assign(params, saved);
    }
  }

  @test
  async confirmationRecordsPhoneVerification() {
    // Owners declaring phoneVerifiedAt get it set when the SMS factor is confirmed, not on later checks
    const owner = { phoneVerifiedAt: undefined as number | undefined };
    const mfa = new MFA();
    (mfa as any)[WEBDA_STORAGE].__parent__ = { instance: owner, attribute: "mfa" };
    await this.sms.startEnrollment(mfa, owner, { phone: PHONE });
    assert.strictEqual(await this.sms.check(mfa, this.lastCode()), true);
    assert.ok(owner.phoneVerifiedAt! <= Date.now());
    const first = owner.phoneVerifiedAt;
    mfa.getFactor("sms").enabledAt = Date.now();
    await new Promise(resolve => setTimeout(resolve, 5));
    await this.sms.challenge(mfa, owner);
    assert.strictEqual(await this.sms.check(mfa, this.lastCode()), true);
    assert.strictEqual(owner.phoneVerifiedAt, first);

    // Owners without the field are left untouched
    const plain: any = {};
    const other = new MFA();
    (other as any)[WEBDA_STORAGE].__parent__ = { instance: plain, attribute: "mfa" };
    await this.sms.startEnrollment(other, plain, { phone: PHONE });
    assert.strictEqual(await this.sms.check(other, this.lastCode()), true);
    assert.ok(!("phoneVerifiedAt" in plain));
  }

  @test
  async requiresAnSmsSender() {
    const service = new SmsMfaService("noSender", new SmsMfaParameters().load({ sender: "MissingSender" }));
    assert.throws(() => service.resolve(), /MissingSender/);
  }
}
