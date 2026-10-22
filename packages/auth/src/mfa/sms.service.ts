import crypto from "node:crypto";
import { type MFA, MfaNotEnabled, type SmsSender, Throttled, useApplication, useDynamicService } from "@webda/core";
import { Duration } from "@webda/utils";
import { InvalidPhone } from "../errors.js";
import { SecondFactorParameters, SecondFactorService } from "./secondfactor.service.js";

/** Parameters for the SMS second factor */
export class SmsMfaParameters extends SecondFactorParameters {
  /** Name of the {@link SmsSender} service delivering the codes */
  sender: string = "SmsSender";
  /**
   * Number of digits of a code
   * @minimum 4
   * @maximum 10
   */
  digits: number = 6;
  /** Lifetime of a code: seconds or a duration string such as "5m" */
  ttl: number | string = "5m";
  /** Minimum delay between two codes sent to the same factor: seconds or a duration string such as "60s" */
  resendDelay: number | string = "60s";
  /** Message template, `{code}` and `{app}` are replaced */
  message: string = "{code} is your {app} verification code";
  /** Application name in the message (defaults to the application package name) */
  app?: string;
}

/** SMS factor data, stored encrypted in `mfa.factors.sms.data` */
export interface SmsFactorData {
  /** Phone number in E.164 format */
  phone: string;
  /** SHA-256 hash of the current code, cleared once used */
  hash?: string;
  /** Expiry of the current code (ms) */
  expiresAt?: number;
  /** Last time a code was sent (ms) */
  sentAt?: number;
}

/**
 * Normalise a phone number to E.164: separators (spaces, dots, dashes, parentheses) are removed, the country code
 * is required
 * @param phone - phone number as typed
 * @returns the E.164 number, undefined when invalid
 */
export function normalizePhone(phone: unknown): string | undefined {
  if (typeof phone !== "string") {
    return undefined;
  }
  const normalized = phone.trim().replace(/[\s.()-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : undefined;
}

/**
 * Mask a phone number for display, keeping the first two and last two characters
 * @param phone - E.164 phone number
 * @returns masked number, e.g. "+1********89"
 */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 2)}${"*".repeat(Math.max(phone.length - 4, 0))}${phone.slice(-2)}`;
}

/**
 * @param code - submitted or generated code
 * @returns the SHA-256 hash of the code
 */
function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * One-time codes sent by SMS second-factor authentication service
 *
 * Enrollment input is `{ phone }`; confirming the enrollment verifies the phone. Codes are sent through a pluggable
 * {@link SmsSender} service (`DebugSmsSender` for tests, `SnsSmsSender` in `@webda/aws`) with the
 * `<Model>.<Attribute>.Challenge` operation.
 * @WebdaModda SmsMfaService
 */
export class SmsMfaService extends SecondFactorService<SmsMfaParameters> {
  static Parameters = SmsMfaParameters;

  readonly method = "sms";

  /** Transport of the codes */
  protected sender: SmsSender;

  /**
   * Resolve the SMS sender service
   * @returns this
   */
  override resolve(): this {
    super.resolve();
    this.sender = useDynamicService<SmsSender>(this.parameters.sender);
    if (!this.sender) {
      throw new Error(`${this.getName()} requires an SMS sender service named "${this.parameters.sender}"`);
    }
    return this;
  }

  /**
   * Refuse to send a code before the resend delay
   * @param data - current factor data
   */
  protected checkResend(data?: SmsFactorData): void {
    const delay = new Duration(this.parameters.resendDelay).toMs();
    if (data?.sentAt && Date.now() - data.sentAt < delay) {
      throw new Throttled("Wait before requesting another code");
    }
  }

  /**
   * Store the phone (pending until confirmed) then send it a code
   * @param mfa - the MFA behavior
   * @param owner - the object holding it
   * @param input - enrollment input
   * @param input.phone - phone number, with its `+` country code
   * @returns the masked phone and the code lifetime
   */
  async startEnrollment(mfa: MFA, owner: any, input?: { phone?: string }): Promise<any> {
    const phone = normalizePhone(input?.phone);
    if (!phone) {
      throw new InvalidPhone();
    }
    const factor = mfa.getFactor<SmsFactorData>(this.method);
    const previous = await factor.data.get();
    this.checkResend(previous);
    await factor.data.set({ phone, sentAt: previous?.sentAt });
    return this.challenge(mfa, owner);
  }

  /**
   * Send a new code to the factor phone, replacing the previous one
   * @param mfa - the MFA behavior
   * @param _owner - the object holding it
   * @returns the masked phone and the code lifetime in seconds
   */
  async challenge(mfa: MFA, _owner: any): Promise<{ phone: string; expiresIn: number }> {
    const factor = mfa.factors[this.method] ? mfa.getFactor<SmsFactorData>(this.method) : undefined;
    const data = await factor?.data.get();
    if (!data?.phone) {
      throw new MfaNotEnabled();
    }
    this.checkResend(data);
    const digits = this.parameters.digits;
    const code = crypto
      .randomInt(0, 10 ** digits)
      .toString()
      .padStart(digits, "0");
    const expiresIn = new Duration(this.parameters.ttl).toSeconds();
    const now = Date.now();
    await factor!.data.set({ phone: data.phone, hash: hashCode(code), expiresAt: now + expiresIn * 1000, sentAt: now });
    const app = this.parameters.app ?? useApplication()?.getPackageDescription()?.name ?? "Webda";
    await this.sender.send(
      data.phone,
      this.parameters.message.replace(/\{(code|app)\}/g, (_match, key) => (key === "code" ? code : app))
    );
    return { phone: maskPhone(data.phone), expiresIn };
  }

  /**
   * Check a code against the current one: unexpired, constant-time hash compare, single use. Confirming the
   * enrollment verifies the phone: `phoneVerifiedAt` is set on owners declaring it
   * @param mfa - the MFA behavior
   * @param code - submitted code
   * @returns true if valid
   */
  async check(mfa: MFA, code: string): Promise<boolean> {
    if (typeof code !== "string" || !mfa.factors[this.method]) {
      return false;
    }
    const factor = mfa.getFactor<SmsFactorData>(this.method);
    const data = await factor.data.get();
    if (!data?.hash || !data.expiresAt || Date.now() > data.expiresAt) {
      return false;
    }
    const stored = Buffer.from(data.hash, "hex");
    const submitted = Buffer.from(hashCode(code.trim()), "hex");
    if (!crypto.timingSafeEqual(stored, submitted)) {
      return false;
    }
    await factor.data.set({ phone: data.phone, sentAt: data.sentAt });
    factor.lastUsed = Date.now();
    const owner = (mfa as any).parent?.instance;
    if (factor.enabledAt === undefined && owner && "phoneVerifiedAt" in owner) {
      owner.phoneVerifiedAt = factor.lastUsed;
    }
    return true;
  }
}
