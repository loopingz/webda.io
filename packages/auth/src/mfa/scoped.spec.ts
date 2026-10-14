import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { hotp, totpStep, listOperations, runAsSystem, useModelMetadata, verifyMfaProof, WebdaError } from "@webda/core";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { AuthTest } from "../test/authtest.js";
import { User } from "@webda/core/lib/models/user.model.js";

import { MfaUser } from "../test/mfauser.fixture.model.js";
import { Authentication } from "../authentication.service.js";
import { EmailPasswordProvider } from "../email/emailpassword.service.js";
import { TotpService } from "./totp.service.js";

@suite
class ScopedMfaTest extends AuthTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        DomainService: { type: "Webda/DomainService", models: ["Webda/MfaUser"] },
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/MfaUser", "Webda/Ident", "Webda/RefreshToken"] },
        DefinedMailer: { type: "WebdaTest/Mailer" },
        Authentication: { type: "Webda/Authentication", userModel: "Webda/MfaUser", mfaAttribute: "loginMfa" },
        TokenService: { type: "Webda/TokenService" },
        totp: { type: "Webda/TotpService" },
        email: { type: "Webda/EmailPasswordProvider", mailer: "DefinedMailer", verification: "none" }
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.getNamespace = () => "Webda";
    app.addModel("Webda/MfaUser", MfaUser, {
      ...useModelMetadata(User),
      Identifier: "Webda/MfaUser",
      Plural: "MfaUsers",
      Subclasses: [],
      Relations: {
        behaviors: [
          { attribute: "password", behavior: "Webda/Password" },
          { attribute: "mfa", behavior: "Webda/MFA" },
          { attribute: "loginMfa", behavior: "Webda/MFA" },
          { attribute: "paymentMfa", behavior: "Webda/MFA" }
        ]
      }
    } as any);
    MfaUser.registerSerializer(true, "Webda/MfaUser");
    app.addModda("Webda/Authentication", Authentication as any);
    app.addModda("Webda/EmailPasswordProvider", EmailPasswordProvider as any);
    app.addModda("Webda/TotpService", TotpService as any);
  }

  @test
  async independentAttributesAndScopedProofs() {
    const ctx = await this.ctx();
    const email = "two-mfa@example.com";
    const password = "password123";
    await this.op("Auth.Email.Register", { email, password }, ctx);
    const uuid = ctx.getSession().userId;
    const ops = listOperations();
    assert.ok(ops["MfaUser.LoginMfa.Verify"]);
    assert.ok(ops["MfaUser.PaymentMfa.Verify"]);
    assert.strictEqual(ops["Auth.Totp.Verify"], undefined);
    const login = await this.op("MfaUser.LoginMfa.Enroll", { uuid, method: "totp" }, ctx);
    const payment = await this.op("MfaUser.PaymentMfa.Enroll", { uuid, method: "totp" }, ctx);
    assert.notStrictEqual(login.secret, payment.secret);
    const paymentConfirmed = await this.op(
      "MfaUser.PaymentMfa.Confirm",
      {
        uuid,
        method: "totp",
        code: hotp(payment.secret, totpStep())
      },
      ctx
    );
    assert.strictEqual(paymentConfirmed.accessToken, undefined);
    assert.strictEqual(ctx.getSession().mfa, "none");
    const loginConfirmed = await this.op(
      "MfaUser.LoginMfa.Confirm",
      {
        uuid,
        method: "totp",
        code: hotp(login.secret, totpStep())
      },
      ctx
    );
    assert.ok(loginConfirmed.accessToken);
    assert.notDeepStrictEqual(loginConfirmed.recoveryCodes, paymentConfirmed.recoveryCodes);
    await this.op("Auth.Logout", {}, ctx);
    const pending = await this.op("Auth.Email.Login", { email, password }, ctx);
    assert.strictEqual(pending.status, "mfa_required");
    // A pending login cannot verify another attribute or another user's login factor.
    await assert.rejects(
      () =>
        this.op(
          "MfaUser.PaymentMfa.Verify",
          {
            uuid,
            code: hotp(payment.secret, totpStep() + 1)
          },
          ctx
        ),
      WebdaError.NotFound
    );
    await assert.rejects(
      () =>
        this.op(
          "MfaUser.LoginMfa.Verify",
          {
            uuid: "another-user",
            code: hotp(login.secret, totpStep() + 1)
          },
          ctx
        ),
      WebdaError.Unauthorized
    );
    await assert.rejects(
      () => this.op("MfaUser.LoginMfa.Enroll", { uuid, method: "totp" }, ctx),
      WebdaError.Unauthorized
    );
    assert.deepStrictEqual(ctx.getSession().mfaVerifications, {});
    await this.op("MfaUser.LoginMfa.Verify", { uuid, code: hotp(login.secret, totpStep() + 1) }, ctx);
    const loginStatus = ctx.getSession().mfaVerifications["MfaUser.LoginMfa.Verify"];
    assert.ok(loginStatus);
    assert.strictEqual(ctx.getSession().mfaVerifications["MfaUser.PaymentMfa.Verify"], undefined);
    const proof = await this.op(
      "MfaUser.PaymentMfa.Verify",
      {
        uuid,
        code: hotp(payment.secret, totpStep() + 1),
        operation: "MfaUser.LoginMfa.Verify"
      },
      ctx
    );
    const user = await runAsSystem(() => MfaUser.ref(uuid).get());
    await this.inContext(ctx, async () => {
      assert.strictEqual(await verifyMfaProof(proof.proof, user, "paymentMfa"), "totp");
      assert.strictEqual(await verifyMfaProof(proof.proof, user, "loginMfa"), undefined);
    });
    assert.deepStrictEqual(ctx.getSession().mfaVerifications["MfaUser.LoginMfa.Verify"], loginStatus);
    assert.strictEqual(ctx.getSession().mfaVerifications["MfaUser.PaymentMfa.Verify"].method, "totp");
    // Disabling this field clears only its own verification entries and leaves the login factor intact.
    await this.op(
      "MfaUser.PaymentMfa.Disable",
      {
        uuid,
        method: "totp",
        code: paymentConfirmed.recoveryCodes[0]
      },
      ctx
    );
    assert.strictEqual(ctx.getSession().mfaVerifications["MfaUser.PaymentMfa.Verify"], undefined);
    assert.deepStrictEqual(ctx.getSession().mfaVerifications["MfaUser.LoginMfa.Verify"], loginStatus);
    assert.strictEqual((await runAsSystem(() => MfaUser.ref(uuid).get())).loginMfa.isEnabled(), true);
  }
}
