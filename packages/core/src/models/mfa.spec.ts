import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { JSONUtils } from "@webda/utils";
import { EncryptedField } from "./encrypted.model.js";
import { User } from "./user.model.js";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  LOGIN_MFA,
  MFA,
  MFA_PROOF_AUDIENCE,
  normalizeRecoveryCode,
  registerSecondFactor,
  type SecondFactorProvider,
  type TotpSecret,
  verifyMfaProof
} from "./mfa.model.js";
import { Ident } from "./ident.model.js";
import { WEBDA_STORAGE } from "@webda/models";
import { runWithContext } from "../contexts/execution.js";
import { useCrypto } from "../services/cryptoservice.service.js";
import * as WebdaError from "../errors/errors.js";
import { InvalidMfaCode, MfaAlreadyEnabled, MfaNotEnabled, Throttled } from "../errors/mfa.js";
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
      services: { UserStore: { type: "Webda/MemoryStore", models: ["Webda/User", "Webda/Ident"] } }
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

  @test
  async mfaModelEdgeCases() {
    // normalizeRecoveryCode
    assert.strictEqual(normalizeRecoveryCode(undefined as any), "");
    assert.strictEqual(normalizeRecoveryCode(null as any), "");
    assert.strictEqual(normalizeRecoveryCode("  ab-CD_12  "), "abcd12");

    // generateRecoveryCodes
    const defaultCodes = generateRecoveryCodes();
    assert.strictEqual(defaultCodes.length, 10);
    const customCodes = generateRecoveryCodes(3);
    assert.strictEqual(customCodes.length, 3);

    // Constructor with raw object data and null entry
    const mfaWithData = new MFA({
      factors: {
        raw: { data: { foo: "bar" } },
        empty: null,
        noData: { enabledAt: 1 },
        alreadyEnc: { data: new EncryptedField() }
      }
    });
    assert.ok(mfaWithData.factors.raw.data instanceof EncryptedField);
    assert.strictEqual((mfaWithData.factors.raw.data as any).foo, "bar");
    assert.strictEqual(mfaWithData.factors.empty, null);
    assert.ok(mfaWithData.factors.noData.data instanceof EncryptedField);
    assert.deepStrictEqual(mfaWithData.methods(), ["noData"]);

    // Stored `factors: null` and an entry set raw after construction
    const nullFactors = new MFA({ factors: null });
    assert.deepStrictEqual(nullFactors.methods(), []);
    nullFactors.factors.sms = { enabledAt: 2 } as any;
    assert.ok(nullFactors.getFactor("sms").data instanceof EncryptedField);
    assert.strictEqual(nullFactors.getFactor("sms").enabledAt, 2);

    // Detached getOwner()
    const detached = new MFA();
    assert.strictEqual((detached as any).getOwner(), undefined);

    // verifyTotp without secret
    const emptyMfa = new MFA();
    assert.strictEqual(await emptyMfa.verifyTotp("123456"), false);

    // consumeRecoveryCode with non-string or blank
    assert.strictEqual(emptyMfa.consumeRecoveryCode(null as any), false);
    assert.strictEqual(emptyMfa.consumeRecoveryCode(""), false);
    assert.strictEqual(emptyMfa.consumeRecoveryCode("   "), false);

    // clearFactor for non-existent factor
    emptyMfa.clearFactor("nonexistent");
    assert.strictEqual(emptyMfa.isEnabled("nonexistent"), false);

    // Setters with undefined
    emptyMfa.totpEnabledAt = undefined;
    assert.strictEqual(emptyMfa.totpEnabledAt, undefined);
    emptyMfa.totpLastStep = undefined;
    assert.strictEqual(emptyMfa.totpLastStep, undefined);

    // verifyTotp with set secret but wrong code (step === undefined)
    await emptyMfa.totp.set(TOTP_SECRET);
    assert.strictEqual(await emptyMfa.verifyTotp("000000", 1, 1700000000000), false);

    // consumeRecoveryCode when codes exist but none matches
    emptyMfa.__recoveryCodes = ["code-1"].map(hashRecoveryCode);
    assert.strictEqual(emptyMfa.consumeRecoveryCode("code-different"), false);
    assert.strictEqual(emptyMfa.__recoveryCodes.length, 1);
  }

  /**
   * Register the "good" (throttled, 3 recovery codes) and "other" (defaults) test factors
   * @returns the providers
   */
  registerFactors(): SecondFactorProvider[] {
    const good: SecondFactorProvider = {
      method: "good",
      throttle: { failedBeforeDelay: 2, lockout: 60000 },
      recoveryCodeCount: 3,
      startEnrollment: async (mfa, owner) => {
        mfa.getFactor("good");
        return { owner: owner.getUUID() };
      },
      check: async (_mfa, code) => code === "good-code"
    };
    const other: SecondFactorProvider = {
      method: "other",
      startEnrollment: async mfa => {
        mfa.getFactor("other");
      },
      check: async (_mfa, code) => code === "other-code"
    };
    registerSecondFactor(good);
    registerSecondFactor(other);
    return [good, other];
  }

  /**
   * A stored object holding an MFA behavior: a User whose MFA is not its login factor stands for any model declaring
   * `mfa: MFA` and the attempts counters
   * @param uuid - object uuid
   * @returns the object and its MFA
   */
  async vault(uuid: string): Promise<{ vault: User; mfa: MFA }> {
    Object.defineProperty(User, LOGIN_MFA, { value: false, configurable: true });
    await User.create({ uuid, displayName: uuid } as any);
    const vault = await User.ref(uuid).get();
    return { vault, mfa: vault.mfa! };
  }

  afterEach() {
    Object.defineProperty(User, LOGIN_MFA, { value: true, configurable: true });
  }

  /**
   * @param userId - logged user
   * @returns a context of this user
   */
  async userContext(userId: string) {
    const ctx = await this.newContext();
    await ctx.init();
    ctx.getSession().login(userId, `${userId}:email`);
    return ctx;
  }

  @test
  async objectStepUp() {
    this.registerFactors();
    const { vault, mfa } = await this.vault("vault-1");
    const alice = await this.userContext("alice");
    const bob = await this.userContext("bob");
    await runWithContext(alice, async () => {
      // Enroll then confirm: the first factor issues its provider count of recovery codes
      assert.deepStrictEqual(await mfa.enroll("good"), { owner: vault.getUUID() });
      await assert.rejects(() => mfa.confirm("good", "bad"), InvalidMfaCode);
      const { recoveryCodes } = await mfa.confirm("good", "good-code");
      assert.strictEqual(recoveryCodes.length, 3);
      await assert.rejects(() => mfa.enroll("good"), MfaAlreadyEnabled);
      await assert.rejects(() => mfa.confirm("good", "good-code"), MfaAlreadyEnabled);
      // The owner is saved with its factor and the attempts counter cleared
      const stored = await User.ref("vault-1").get();
      assert.ok(stored.mfa!.isEnabled("good"));
      assert.strictEqual(stored._mfaAttempts, 0);

      // A second factor keeps the recovery codes of the first one
      await mfa.enroll("other");
      assert.deepStrictEqual((await mfa.confirm("other", "other-code")).recoveryCodes, []);
      assert.strictEqual(mfa.__recoveryCodes!.length, 3);

      // Verify with any factor, one factor, or a recovery code: the proof is bound to the object and the caller
      const proof = await mfa.verify("other-code");
      assert.strictEqual(proof.method, "other");
      assert.strictEqual(proof.expiresIn, 300);
      assert.strictEqual(await verifyMfaProof(proof.proof, vault), "other");
      assert.strictEqual(await verifyMfaProof(proof.proof, vault, 3600), "other");
      assert.strictEqual(await verifyMfaProof(proof.proof, vault, -1), undefined);
      assert.strictEqual((await mfa.verify("good-code", "good")).method, "good");
      await assert.rejects(() => mfa.verify("other-code", "good"), InvalidMfaCode);
      assert.strictEqual((await mfa.verify(recoveryCodes[0], "recovery")).method, "recovery");
      assert.strictEqual((await mfa.verify(recoveryCodes[1])).method, "recovery");
      await assert.rejects(() => mfa.verify("good-code", "sms"), MfaNotEnabled);

      const { vault: otherVault } = await this.vault("vault-2");
      assert.strictEqual(await verifyMfaProof(proof.proof, otherVault), undefined);
      assert.strictEqual(await verifyMfaProof("garbage", vault), undefined);
      // A model without metadata is keyed by its class name
      class Plain {
        getUUID() {
          return vault.getUUID();
        }
      }
      assert.strictEqual(await verifyMfaProof(proof.proof, new Plain()), undefined);
      // Another caller cannot reuse the proof
      await runWithContext(bob, async () => assert.strictEqual(await verifyMfaProof(proof.proof, vault), undefined));
      // A signed token of another audience is not a proof
      const token = await useCrypto().jwtSign({ obj: "x", amr: ["good"] }, { audience: "other" });
      assert.notStrictEqual(MFA_PROOF_AUDIENCE, "other");
      assert.strictEqual(await verifyMfaProof(token, vault), undefined);

      // Regenerate with any factor code, sized by the largest provider count (other defaults to 10)
      assert.strictEqual((await mfa.recoveryCodes("good-code")).recoveryCodes.length, 10);
      // Disable with a recovery code, then the last factor: its recovery codes go with it
      const regenerated = await mfa.recoveryCodes("other-code");
      await mfa.disable("other", regenerated.recoveryCodes[0]);
      assert.deepStrictEqual(mfa.methods(), ["good"]);
      assert.strictEqual(mfa.__recoveryCodes!.length, 9);
      await mfa.disable("good", "good-code");
      assert.strictEqual(mfa.isEnabled(), false);
      assert.strictEqual(mfa.__recoveryCodes, undefined);
      await assert.rejects(() => mfa.disable("good", "good-code"), MfaNotEnabled);
      await assert.rejects(() => mfa.recoveryCodes("good-code"), MfaNotEnabled);
      await assert.rejects(() => mfa.verify("good-code"), MfaNotEnabled);
    });
  }

  @test
  async objectAttemptsThrottled() {
    this.registerFactors();
    const { mfa } = await this.vault("vault-throttle");
    await runWithContext(await this.userContext("alice"), async () => {
      await mfa.enroll("good");
      await mfa.enroll("other");
      await mfa.confirm("other", "other-code");
      // "good" is the strictest of the two: two failures allowed, then every check of the object is refused
      await mfa.confirm("good", "good-code");
      for (let i = 0; i < 2; i++) {
        await assert.rejects(() => mfa.verify("bad"), InvalidMfaCode);
      }
      await assert.rejects(() => mfa.verify("good-code"), Throttled);
      await assert.rejects(() => mfa.disable("other", "other-code"), Throttled);
    });
  }

  @test
  async loginFactorActionsRefused() {
    this.registerFactors();
    const user = await User.create({ uuid: "mfa-login-user", displayName: "Login" } as any);
    const loaded = await User.ref("mfa-login-user").get();
    // The core operations drive the login second factor
    await loaded.mfa!.startEnrollment("good");
    assert.deepStrictEqual((await loaded.mfa!.confirmFactor("good", "good-code")).recoveryCodes.length, 3);
    assert.strictEqual(await loaded.mfa!.verifyCode("good-code", "good"), "good");
    // Its actions are refused: Auth.<Method>.* add reauthentication, session upgrade and token revocation
    for (const action of [
      () => loaded.mfa!.enroll("other"),
      () => loaded.mfa!.confirm("other", "other-code"),
      () => loaded.mfa!.verify("good-code"),
      () => loaded.mfa!.disable("good", "good-code"),
      () => loaded.mfa!.recoveryCodes("good-code")
    ]) {
      await assert.rejects(action, WebdaError.Forbidden);
    }
    void user;
  }

  @test
  async detachedUnknownMethodOrUndeclaredCounters() {
    this.registerFactors();
    await assert.rejects(() => new MFA().startEnrollment("good"), WebdaError.BadRequest);
    const { mfa } = await this.vault("vault-unknown");
    await assert.rejects(() => mfa.startEnrollment("sms"), MfaNotEnabled);

    // An owner without the attempts counters is refused before any code is checked
    await Ident.getRepository().create(new Ident({ ...Ident.key("no-counters", "vault") } as any));
    const ident = await Ident.ref(Ident.key("no-counters", "vault")).get();
    const identMfa = new MFA();
    (identMfa as any)[WEBDA_STORAGE].__parent__ = { instance: ident, attribute: "mfa" };
    await identMfa.startEnrollment("good");
    await assert.rejects(() => identMfa.confirm("good", "good-code"), /without declaring _mfaAttempts/);
  }
}
