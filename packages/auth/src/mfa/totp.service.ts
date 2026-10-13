import { generateTotpSecret, MFA, runAsSystem, totpUri, useApplication, type User } from "@webda/core";
import { SecondFactorParameters, SecondFactorService } from "./secondfactor.service.js";

/** Parameters for TOTP service */
export class TotpParameters extends SecondFactorParameters {
  /** Application name / issuer shown in authenticator apps (defaults to application name) */
  issuer?: string;
  /** HMAC hash algorithm (default "sha1") */
  algorithm: "sha1" | "sha256" | "sha512" = "sha1";
  /** Number of digits (default 6) */
  digits: 6 | 8 = 6;
  /** Time step in seconds (default 30) */
  period: number = 30;
  /** Accepted drift window in time steps (default 1) */
  window: number = 1;
}

/**
 * Time-based One-Time Password (TOTP) second-factor authentication service
 * @WebdaModda TotpService
 */
export class TotpService extends SecondFactorService<TotpParameters> {
  static Parameters = TotpParameters;

  readonly method = "totp";

  /**
   * Start TOTP enrollment: generate secret and otpauth URI
   * @param user - current user
   * @returns secret and QR-ready otpauth URI
   */
  protected async startEnrollment(user: User): Promise<{ secret: string; uri: string }> {
    const secret = generateTotpSecret(20);
    const issuer = this.parameters.issuer ?? useApplication()?.getPackageDescription()?.name ?? "Webda";
    const account = user.getEmail() ?? user.getDisplayName() ?? user.getUUID();
    const uri = totpUri({
      secret,
      issuer,
      account,
      algorithm: this.parameters.algorithm,
      digits: this.parameters.digits,
      period: this.parameters.period
    });
    user.mfa ??= new MFA();
    await user.mfa.totp.set({
      secret,
      algorithm: this.parameters.algorithm,
      digits: this.parameters.digits,
      period: this.parameters.period
    });
    await runAsSystem(() => user.save());
    return { secret, uri };
  }

  /**
   * Check submitted code against user's TOTP secret
   * @param user - user
   * @param code - code submitted by user
   * @returns true if valid
   */
  protected async check(user: User, code: string): Promise<boolean> {
    if (!user.mfa) return false;
    return user.mfa.verifyTotp(code, this.parameters.window);
  }
}
