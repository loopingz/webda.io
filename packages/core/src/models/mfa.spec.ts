import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { JSONUtils } from "@webda/utils";
import { EncryptedField } from "./encrypted.model.js";
import { User } from "./user.model.js";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  MFA,
  normalizeRecoveryCode,
  type TotpSecret
} from "./mfa.model.js";
import { hotp, totpStep } from "../utils/totp.js";

const TOTP_SECRET: TotpSecret = {
  secret: "JBSWY3DPEHPK3PXP",
  algorithm: "sha1",
  digits: 6,
  period: 30
};

@suite
class MfaBehaviorTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: { UserStore: { type: "Webda/MemoryStore", models: ["Webda/User"] } }
    };
  }

  @test
  async secretNeverInPublicOutputOrToJSON() {
    const user = new User({ uuid: "u-mfa-1", displayName: "Alice" } as any);
    assert.ok(user.mfa instanceof MFA);
    await user.mfa.totp.set(TOTP_SECRET);

    const codes = generateRecoveryCodes(5);
    user.mfa.__recoveryCodes = codes.map(hashRecoveryCode);

    // 1. Plaintext secret is NEVER in toJSON()
    const json = JSON.stringify(user.mfa);
    assert.ok(!json.includes(TOTP_SECRET.secret), "Secret must not appear in JSON.stringify(mfa)");
    for (const code of codes) {
      assert.ok(!json.includes(code), `Recovery code ${code} must not appear in JSON.stringify(mfa)`);
    }

    // 2. Public serialization strips __ciphertext and __recoveryCodes
    const publicOut = JSONUtils.stringify(user, undefined, 0, true);
    assert.ok(!publicOut.includes(TOTP_SECRET.secret));
    assert.ok(!publicOut.includes("__ciphertext"));
    assert.ok(!publicOut.includes("__recoveryCodes"));

    // 3. Decryption still works
    const retrieved = await user.mfa.totp.get();
    assert.deepStrictEqual(retrieved, TOTP_SECRET);
  }

  @test
  methodsAndIsEnabled() {
    const mfa = new MFA();
    assert.strictEqual(mfa.isEnabled(), false);
    assert.strictEqual(mfa.isEnabled("totp"), false);
    assert.deepStrictEqual(mfa.methods(), []);

    // Setting secret does NOT enable it yet (pending confirmation)
    mfa.getFactor("totp");
    assert.strictEqual(mfa.isEnabled(), false);
    assert.deepStrictEqual(mfa.methods(), []);

    // Stamping enabledAt enables it
    mfa.totpEnabledAt = Date.now();
    assert.strictEqual(mfa.isEnabled(), true);
    assert.strictEqual(mfa.isEnabled("totp"), true);
    assert.deepStrictEqual(mfa.methods(), ["totp"]);

    // Disabling / clearing factor
    mfa.clearFactor("totp");
    assert.strictEqual(mfa.isEnabled(), false);
    assert.deepStrictEqual(mfa.methods(), []);
  }

  @test
  async singleUseStepReplayProtection() {
    const mfa = new MFA();
    await mfa.totp.set(TOTP_SECRET);

    const now = 1700000000000;
    const currentStep = totpStep(now, 30);
    const code = hotp(TOTP_SECRET.secret, currentStep);

    // First verification succeeds
    const ok = await mfa.verifyTotp(code, 1, now);
    assert.strictEqual(ok, true);
    assert.strictEqual(mfa.totpLastStep, currentStep);

    // Immediate replay of same code fails
    const replay = await mfa.verifyTotp(code, 1, now);
    assert.strictEqual(replay, false, "Replayed code must be rejected");

    // Older step fails
    const olderCode = hotp(TOTP_SECRET.secret, currentStep - 1);
    const olderOk = await mfa.verifyTotp(olderCode, 1, now);
    assert.strictEqual(olderOk, false, "Older step must be rejected");

    // Next step succeeds
    const nextStep = currentStep + 1;
    const nextCode = hotp(TOTP_SECRET.secret, nextStep);
    const nextOk = await mfa.verifyTotp(nextCode, 1, now + 30000);
    assert.strictEqual(nextOk, true, "Next step code must be accepted");
    assert.strictEqual(mfa.totpLastStep, nextStep);
  }

  @test
  recoveryCodeConsumedOnce() {
    const mfa = new MFA();
    assert.strictEqual(mfa.hasRecoveryCodes(), false);

    const plainCodes = ["abcd-1234", "efgh-5678", "ijkl-9012"];
    mfa.__recoveryCodes = plainCodes.map(hashRecoveryCode);
    assert.strictEqual(mfa.hasRecoveryCodes(), true);

    // Consume first code (case-insensitive, ignores hyphens and whitespace)
    assert.strictEqual(mfa.consumeRecoveryCode("ABCD1234"), true);
    assert.strictEqual(mfa.__recoveryCodes.length, 2);

    // Reusing the same code fails
    assert.strictEqual(mfa.consumeRecoveryCode("abcd-1234"), false);
    assert.strictEqual(mfa.consumeRecoveryCode("ABCD1234"), false);

    // Invalid code fails
    assert.strictEqual(mfa.consumeRecoveryCode("wrong-code"), false);
    assert.strictEqual(mfa.__recoveryCodes.length, 2);

    // Consume remaining
    assert.strictEqual(mfa.consumeRecoveryCode("  efgh-5678  "), true);
    assert.strictEqual(mfa.consumeRecoveryCode("ijkl-9012"), true);
    assert.strictEqual(mfa.hasRecoveryCodes(), false);
    assert.strictEqual(mfa.consumeRecoveryCode("ijkl-9012"), false);
  }

  @test
  async userMfaRoundTripInMemoryStore() {
    const user = new User({ uuid: "u-roundtrip", displayName: "Bob" } as any);
    await user.mfa!.totp.set(TOTP_SECRET);
    user.mfa!.totpEnabledAt = Date.now();
    user.mfa!.__recoveryCodes = ["code-1"].map(hashRecoveryCode);

    await User.getRepository().create(user);

    // Reload from store
    const reloaded = await User.ref("u-roundtrip").get();
    assert.ok(reloaded.mfa instanceof MFA);
    assert.ok(reloaded.mfa.totp instanceof EncryptedField);
    assert.strictEqual(reloaded.mfa.isEnabled("totp"), true);
    assert.deepStrictEqual(reloaded.mfa.methods(), ["totp"]);
    assert.strictEqual(reloaded.mfa.hasRecoveryCodes(), true);

    const secret = await reloaded.mfa.totp.get();
    assert.deepStrictEqual(secret, TOTP_SECRET);
    assert.strictEqual(reloaded.mfa.consumeRecoveryCode("code-1"), true);
    assert.strictEqual(reloaded.mfa.hasRecoveryCodes(), false);
  }
}
