import crypto from "node:crypto";
import { EncryptedField } from "./encrypted.model.js";
import { verifyTotp } from "../utils/totp.js";
import type { User } from "./user.model.js";

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
  return (code ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
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

/**
 * Multi-Factor Authentication credential behavior of a user
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
   * Owning user (set by behavior hydration)
   * @returns the user or undefined when detached
   */
  protected getUser(): User | undefined {
    return (this as any).parent?.instance;
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
}
