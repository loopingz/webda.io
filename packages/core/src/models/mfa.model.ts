import crypto from "node:crypto";
import { EncryptedField } from "./encrypted.model.js";
import { Action } from "./decorator.js";
import { verifyTotp } from "../utils/totp.js";
import { countAttempt, type ThrottleParameters } from "../utils/throttle.js";
import * as WebdaError from "../errors/errors.js";
import { InvalidMfaCode, MfaAlreadyEnabled, MfaNotEnabled, Throttled } from "../errors/mfa.js";
import { runAsSystem, useContext } from "../contexts/execution.js";
import { useDynamicService } from "../core/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";

/** Secret and options for TOTP stored encrypted at rest */
export interface TotpSecret {
  /** Base32 secret */
  secret: string;
  /** HMAC algorithm */
  algorithm: "sha1" | "sha256" | "sha512";
  /** Digits (6 or 8) */
  digits: 6 | 8;
  /** Period in seconds (typically 30) */
  period: number;
}

/** Stored state for one second factor method */
export interface FactorEntry<T = any> {
  /** Secret or credential data encrypted at rest */
  data: EncryptedField<T>;
  /** Timestamp when factor was confirmed/enabled */
  enabledAt?: number;
  /** Timestamp when factor was last used */
  lastUsed?: number;
  /** Last accepted time step for step-based factors (replay protection) */
  lastStep?: number;
}

/**
 * Normalise a recovery code by stripping whitespace/hyphens and lowercasing
 * @param code - raw recovery code
 * @returns normalised string
 */
export function normalizeRecoveryCode(code: string): string {
  return (code ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Compute the SHA-256 hash of a normalised recovery code
 * @param code - raw recovery code
 * @returns hex hash
 */
export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/**
 * Generate a list of random human-friendly recovery codes
 * @param count - number of codes to generate (default 10)
 * @returns list of recovery code strings
 */
export function generateRecoveryCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString("hex");
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

/** Recovery codes issued with the first enabled factor when its provider does not set a count */
const DEFAULT_RECOVERY_CODES = 10;

/** Audience of the step-up proofs returned by the MFA `verify` action */
export const MFA_PROOF_AUDIENCE = "webda:mfa";

/** Lifetime (s) of a step-up proof */
export const MFA_PROOF_TTL = 300;

/**
 * Static flag of the owner classes whose MFA is the login second factor (User). Their MFA actions are refused: the
 * authentication operations (`Auth.<Method>.*`) add what a login factor needs, reauthentication, session upgrade and
 * token revocation
 */
export const LOGIN_MFA = Symbol.for("webda.mfa.login");

/** A second factor method implemented by a service (TOTP, SMS...), available once registered */
export interface SecondFactorProvider {
  /** Method name: key in `MFA.factors` and amr value, e.g. "totp" */
  readonly method: string;
  /** Throttle of the attempts checked with this method */
  readonly throttle?: ThrottleParameters;
  /** Recovery codes issued with the first enabled factor (default 10, 0 disables them) */
  readonly recoveryCodeCount?: number;
  /**
   * Store the pending factor data in `mfa.factors[method]`; the caller saves the owner
   * @param mfa - the MFA behavior
   * @param owner - the object holding it
   * @param input - factor-specific enrollment input
   * @returns the enrollment data for the client (e.g. TOTP secret and URI)
   */
  startEnrollment(mfa: MFA, owner: any, input?: any): Promise<any>;
  /**
   * Check a code against the factor data, recording its single use; the caller saves the owner
   * @param mfa - the MFA behavior
   * @param code - submitted code
   * @returns true when the code is valid
   */
  check(mfa: MFA, code: string): Promise<boolean>;
}

/** Result of a step-up verification on an object */
export interface MfaProof {
  /** Method that accepted the code ("recovery" for a recovery code) */
  method: string;
  /** Signed proof bound to the object and the caller, checked with {@link verifyMfaProof} */
  proof: string;
  /** Lifetime of the proof in seconds */
  expiresIn: number;
}

/**
 * @returns the second factor providers of the current instance
 */
function useSecondFactors(): Map<string, SecondFactorProvider> {
  const storage = useInstanceStorage();
  storage.secondFactors ??= new Map();
  return storage.secondFactors;
}

/**
 * Make a second factor method available to the MFA behavior
 * @param provider - the method implementation
 */
export function registerSecondFactor(provider: SecondFactorProvider): void {
  useSecondFactors().set(provider.method, provider);
}

/**
 * @param method - method name
 * @returns the registered provider of this method
 */
export function useSecondFactor(method: string): SecondFactorProvider | undefined {
  return useSecondFactors().get(method);
}

/**
 * Key binding a proof to an object: model identifier and primary key
 * @param owner - the object holding the MFA behavior
 * @returns the key
 */
function objectKey(owner: any): string {
  return `${owner.constructor.Metadata?.Identifier ?? owner.constructor.name}/${owner.getUUID()}`;
}

/**
 * Check a step-up proof returned by the `<Model>.Mfa.Verify` operation: signed, unexpired, issued for this object to
 * the current caller
 * @param proof - the proof
 * @param owner - the object holding the MFA behavior
 * @param maxAge - maximum age in seconds, when stricter than the proof lifetime
 * @returns the method that verified, undefined when the proof is not valid for this object and caller
 */
export async function verifyMfaProof(proof: string, owner: any, maxAge?: number): Promise<string | undefined> {
  let claims: any;
  try {
    claims = await useDynamicService<any>("CryptoService").jwtVerify(proof, { audience: MFA_PROOF_AUDIENCE });
  } catch {
    return undefined;
  }
  if (claims.obj !== objectKey(owner) || claims.sub !== useContext().getCurrentUserId()) {
    return undefined;
  }
  if (maxAge !== undefined && Date.now() / 1000 - claims.iat > maxAge) {
    return undefined;
  }
  return claims.amr[0];
}

/**
 * Multi-Factor Authentication behavior: second factors and recovery codes of the model holding it.
 *
 * On a user it is the login second factor, driven by the authentication operations. On any other model its actions
 * (`<Model>.Mfa.Enroll`, `Confirm`, `Verify`, `Disable`, `RecoveryCodes`) protect the object itself, allowed by the
 * model `canAct(context, "mfa.<action>")`: `Verify` answers a step-up proof for {@link verifyMfaProof}.
 *
 * Attempts are counted atomically on the owner: a model holding the behavior declares them, as User does,
 * `_mfaAttempts: number = 0` and `_lastMfaAttemptAt?: number`.
 * @WebdaBehavior Webda/MFA
 */
export class MFA {
  /** State of each configured second-factor method */
  factors: { [method: string]: FactorEntry } = {};

  /** SHA-256 hashes of unused recovery codes, never output in clear text */
  __recoveryCodes?: string[];

  /**
   * @param data - initial or stored data
   */
  constructor(data?: any) {
    if (data) {
      Object.assign(this, data);
    }
    this.factors ??= {};
    for (const entry of Object.values(this.factors)) {
      if (entry) {
        MFA.encryptedData(entry);
      }
    }
  }

  /**
   * Make a factor entry data an EncryptedField, keeping the stored ciphertext of a raw record
   * @param entry - factor entry
   * @returns the entry
   */
  private static encryptedData<T>(entry: FactorEntry<T>): FactorEntry<T> {
    if (!(entry.data instanceof EncryptedField)) {
      entry.data = Object.assign(new EncryptedField<T>(), entry.data);
    }
    return entry;
  }

  /**
   * Owning model (set by behavior hydration)
   * @returns the owner or undefined when detached
   */
  protected getOwner(): any {
    return (this as any).parent?.instance;
  }

  /**
   * @returns the owner, refusing a detached behavior
   */
  private requireOwner(): any {
    const owner = this.getOwner();
    if (!owner) {
      throw new WebdaError.BadRequest("MFA is not attached to a model");
    }
    return owner;
  }

  /**
   * @param method - method name
   * @returns the registered provider of this method
   */
  private static provider(method: string): SecondFactorProvider {
    const provider = useSecondFactor(method);
    if (!provider) {
      throw new MfaNotEnabled(`Unknown second factor method ${method}`);
    }
    return provider;
  }

  /**
   * Get or create a factor entry, ensuring its data is an EncryptedField
   * @param method - factor method name (e.g. "totp")
   * @returns factor entry
   */
  getFactor<T = any>(method: string): FactorEntry<T> {
    this.factors[method] ??= { data: new EncryptedField<T>() };
    return MFA.encryptedData(this.factors[method]);
  }

  /**
   * Remove a factor method
   * @param method - factor method name
   */
  clearFactor(method: string): void {
    delete this.factors[method];
  }

  /**
   * Encrypted TOTP secret field
   * @returns the encrypted TOTP field
   */
  get totp(): EncryptedField<TotpSecret> {
    return this.getFactor<TotpSecret>("totp").data;
  }

  /**
   * Timestamp when TOTP was enabled
   * @returns enabled timestamp or undefined
   */
  get totpEnabledAt(): number | undefined {
    return this.factors.totp?.enabledAt;
  }

  /**
   * Set timestamp when TOTP was enabled
   * @param val - enabled timestamp
   */
  set totpEnabledAt(val: number | undefined) {
    this.getFactor("totp").enabledAt = val;
  }

  /**
   * Last accepted time step for TOTP
   * @returns last step number or undefined
   */
  get totpLastStep(): number | undefined {
    return this.factors.totp?.lastStep;
  }

  /**
   * Set last accepted time step for TOTP
   * @param val - last accepted step number
   */
  set totpLastStep(val: number | undefined) {
    this.getFactor("totp").lastStep = val;
  }

  /**
   * Check if MFA is enabled (or a specific method is enabled)
   * @param method - method name to check (optional)
   * @returns true if enabled
   */
  isEnabled(method?: string): boolean {
    if (method) {
      return this.factors[method]?.enabledAt !== undefined;
    }
    return this.methods().length > 0;
  }

  /**
   * List enabled second factor methods
   * @returns method names
   */
  methods(): string[] {
    return Object.keys(this.factors).filter(m => this.factors[m]?.enabledAt !== undefined);
  }

  /**
   * @returns true if unused recovery codes are available
   */
  hasRecoveryCodes(): boolean {
    return Array.isArray(this.__recoveryCodes) && this.__recoveryCodes.length > 0;
  }

  /**
   * Verify a code against the confirmed or pending secret; enforces window + single use, does not save
   * @param code - submitted code
   * @param window - allowed time step drift (default 1)
   * @param now - optional timestamp in milliseconds (defaults to Date.now())
   * @returns true if verified and not replayed
   */
  async verifyTotp(code: string, window: number = 1, now?: number): Promise<boolean> {
    const totpData = await this.totp.get();
    if (!totpData?.secret) {
      return false;
    }
    const step = verifyTotp(totpData.secret, code, {
      algorithm: totpData.algorithm,
      digits: totpData.digits,
      period: totpData.period,
      window,
      now
    });
    if (step === undefined) {
      return false;
    }
    if (this.totpLastStep !== undefined && step <= this.totpLastStep) {
      return false;
    }
    this.totpLastStep = step;
    this.getFactor("totp").lastUsed = Date.now();
    return true;
  }

  /**
   * Consume a recovery code (constant-time hash compare), does not save
   * @param code - raw recovery code submitted by user
   * @returns true if valid and consumed
   */
  consumeRecoveryCode(code: string): boolean {
    if (!this.hasRecoveryCodes() || typeof code !== "string" || !code.trim()) {
      return false;
    }
    const hash = hashRecoveryCode(code);
    const hashBuf = Buffer.from(hash, "ascii");

    const codes = this.__recoveryCodes!;
    let foundIndex = -1;
    for (let i = 0; i < codes.length; i++) {
      const storedBuf = Buffer.from(codes[i], "ascii");
      if (storedBuf.length === hashBuf.length && crypto.timingSafeEqual(storedBuf, hashBuf)) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex >= 0) {
      codes.splice(foundIndex, 1);
      return true;
    }
    return false;
  }

  /**
   * Strictest throttle of the given methods, as they share the owner attempts counter
   * @param methods - method names
   * @returns the throttle parameters
   */
  private static throttle(methods: string[]): ThrottleParameters {
    const params = methods.map(method => MFA.provider(method).throttle ?? {});
    return {
      failedBeforeDelay: Math.min(...params.map(p => p.failedBeforeDelay ?? 5)),
      lockout: Math.max(...params.map(p => p.lockout ?? 900000))
    };
  }

  /**
   * Count an attempt on the owner then run its check: a throttled attempt is refused, a failed check throws
   * InvalidMfaCode. Every method shares the owner `_mfaAttempts` counter, with the strictest throttle of the enabled
   * methods whatever the method checked
   * @param check - the code check
   * @param pending - method being confirmed, not enabled yet
   */
  private async attempt(check: () => Promise<boolean>, pending?: string): Promise<void> {
    const methods = pending ? [...this.methods(), pending] : this.methods();
    const owner = this.requireOwner();
    // An undeclared counter is not loaded with the owner: its attempts would never lock
    if (typeof owner._mfaAttempts !== "number") {
      throw new Error(`${objectKey(owner)} holds an MFA behavior without declaring _mfaAttempts and _lastMfaAttemptAt`);
    }
    if (await countAttempt(owner.ref(), "_mfaAttempts", "_lastMfaAttemptAt", MFA.throttle(methods), owner)) {
      throw new Throttled();
    }
    if (!(await check())) {
      throw new InvalidMfaCode();
    }
  }

  /**
   * Save the owner after a successful attempt, then clear its attempts
   */
  private async saveOwner(): Promise<void> {
    const owner = this.requireOwner();
    await runAsSystem(() => owner.save());
    await runAsSystem(() => owner.ref().setAttribute("_mfaAttempts", 0));
  }

  /**
   * Check a code against factors, then as a recovery code
   * @param code - submitted code
   * @param methods - factors to check the code with
   * @param withRecovery - whether a recovery code is accepted
   * @returns the method that accepted the code, undefined when none did
   */
  private async checkFactors(code: string, methods: string[], withRecovery: boolean): Promise<string | undefined> {
    for (const method of methods) {
      if (await MFA.provider(method).check(this, code)) {
        return method;
      }
    }
    return withRecovery && this.consumeRecoveryCode(code) ? "recovery" : undefined;
  }

  /**
   * Start the enrollment of a factor, pending until confirmed
   * @param method - method name
   * @param input - factor-specific enrollment input
   * @returns the enrollment data for the client (e.g. TOTP secret and URI)
   */
  async startEnrollment(method: string, input?: any): Promise<any> {
    if (this.isEnabled(method)) {
      throw new MfaAlreadyEnabled();
    }
    const owner = this.requireOwner();
    const result = await MFA.provider(method).startEnrollment(this, owner, input);
    await runAsSystem(() => owner.save());
    return result;
  }

  /**
   * Enable a pending factor with a valid code. Recovery codes are issued with the first factor and cover every
   * factor: a factor added later keeps them and answers none
   * @param method - method name
   * @param code - code of the pending factor
   * @returns the recovery codes issued, empty when the existing ones are kept
   */
  async confirmFactor(method: string, code: string): Promise<{ recoveryCodes: string[] }> {
    if (this.isEnabled(method)) {
      throw new MfaAlreadyEnabled();
    }
    const provider = MFA.provider(method);
    await this.attempt(() => provider.check(this, code), method);
    this.getFactor(method).enabledAt = Date.now();
    let recoveryCodes: string[] = [];
    const count = provider.recoveryCodeCount ?? DEFAULT_RECOVERY_CODES;
    if (count > 0 && !this.hasRecoveryCodes()) {
      recoveryCodes = generateRecoveryCodes(count);
      this.__recoveryCodes = recoveryCodes.map(hashRecoveryCode);
    }
    await this.saveOwner();
    return { recoveryCodes };
  }

  /**
   * Check a code: against one factor, as a recovery code with method "recovery", or without method against every
   * enabled factor then the recovery codes
   * @param code - submitted code
   * @param method - method to check with
   * @returns the method that accepted the code
   */
  async verifyCode(code: string, method?: string): Promise<string> {
    const withRecovery = method === undefined || method === "recovery";
    if (!this.isEnabled(withRecovery ? undefined : method)) {
      throw new MfaNotEnabled();
    }
    const factors = method === undefined ? this.methods() : withRecovery ? [] : [method];
    let matched: string | undefined;
    await this.attempt(async () => {
      matched = await this.checkFactors(code, factors, withRecovery);
      return matched !== undefined;
    });
    await this.saveOwner();
    return matched!;
  }

  /**
   * Disable a factor with its code or a recovery code; the recovery codes go with the last factor
   * @param method - method name
   * @param code - code of this factor or a recovery code
   */
  async disableFactor(method: string, code: string): Promise<void> {
    if (!this.isEnabled(method)) {
      throw new MfaNotEnabled();
    }
    await this.attempt(async () => (await this.checkFactors(code, [method], true)) !== undefined);
    this.clearFactor(method);
    if (!this.isEnabled()) {
      this.__recoveryCodes = undefined;
    }
    await this.saveOwner();
  }

  /**
   * Replace the recovery codes, with the code of any enabled factor or a recovery code
   * @param code - verification code
   * @returns the new recovery codes
   */
  async regenerateRecoveryCodes(code: string): Promise<{ recoveryCodes: string[] }> {
    if (!this.isEnabled()) {
      throw new MfaNotEnabled();
    }
    const methods = this.methods();
    await this.attempt(async () => (await this.checkFactors(code, methods, true)) !== undefined);
    const count = Math.max(...methods.map(m => MFA.provider(m).recoveryCodeCount ?? DEFAULT_RECOVERY_CODES));
    const recoveryCodes = generateRecoveryCodes(count);
    this.__recoveryCodes = recoveryCodes.map(hashRecoveryCode);
    await this.saveOwner();
    return { recoveryCodes };
  }

  /**
   * Refuse the actions on a login second factor: the authentication operations drive it
   */
  private assertObjectFactor(): void {
    if (this.getOwner()?.constructor[LOGIN_MFA]) {
      throw new WebdaError.Forbidden("A login second factor is managed by the authentication operations");
    }
  }

  /**
   * Start the enrollment of a factor on this object
   * @param method - method name, e.g. "totp"
   * @returns the enrollment data (e.g. TOTP secret and URI)
   */
  @Action({ rest: { method: "POST" } })
  async enroll(method: string): Promise<any> {
    this.assertObjectFactor();
    return this.startEnrollment(method);
  }

  /**
   * Enable a pending factor of this object
   * @param method - method name
   * @param code - code of the pending factor
   * @returns the recovery codes issued with the first factor
   */
  @Action({ rest: { method: "POST" } })
  async confirm(method: string, code: string): Promise<{ recoveryCodes: string[] }> {
    this.assertObjectFactor();
    return this.confirmFactor(method, code);
  }

  /**
   * Step-up verification on this object
   * @param code - code of an enabled factor, or a recovery code
   * @param method - restrict the check to one method ("recovery" for a recovery code)
   * @returns a proof bound to this object and the caller
   */
  @Action({ rest: { method: "POST" } })
  async verify(code: string, method?: string): Promise<MfaProof> {
    this.assertObjectFactor();
    const matched = await this.verifyCode(code, method);
    const proof = await useDynamicService<any>("CryptoService").jwtSign(
      { sub: useContext().getCurrentUserId(), obj: objectKey(this.requireOwner()), amr: [matched] },
      { audience: MFA_PROOF_AUDIENCE, expiresIn: MFA_PROOF_TTL }
    );
    return { method: matched, proof, expiresIn: MFA_PROOF_TTL };
  }

  /**
   * Disable a factor of this object
   * @param method - method name
   * @param code - code of this factor or a recovery code
   */
  @Action({ rest: { method: "POST" } })
  async disable(method: string, code: string): Promise<void> {
    this.assertObjectFactor();
    await this.disableFactor(method, code);
  }

  /**
   * Replace the recovery codes of this object
   * @param code - code of an enabled factor, or a recovery code
   * @returns the new recovery codes
   */
  @Action({ rest: { method: "POST" } })
  async recoveryCodes(code: string): Promise<{ recoveryCodes: string[] }> {
    this.assertObjectFactor();
    return this.regenerateRecoveryCodes(code);
  }
}
