import {
  type MFA,
  registerSecondFactor,
  type SecondFactorProvider,
  Service,
  ServiceParameters,
  type ThrottleParameters
} from "@webda/core";

/** Parameters common to all second factor services */
export class SecondFactorParameters extends ServiceParameters {
  /** Throttle config for failed attempts */
  throttle: ThrottleParameters = { failedBeforeDelay: 5, lockout: 900000 };
  /** Number of recovery codes generated (default 10, 0 disables recovery codes) */
  recoveryCodes: number = 10;
}

/**
 * Base provider of a second factor method (TOTP, SMS, etc.). Public operations belong to model MFA attributes.
 */
export abstract class SecondFactorService<P extends SecondFactorParameters = SecondFactorParameters>
  extends Service<P>
  implements SecondFactorProvider
{
  /** amr value and key in MFA.methods(), e.g. "totp", "sms" */
  abstract readonly method: string;

  /**
   * Store the pending factor data in mfa.factors[method]
   * @param mfa - the MFA behavior
   * @param owner - the user or object holding it
   * @param input - factor-specific enrollment input
   * @returns the enrollment data for the client
   */
  abstract startEnrollment(mfa: MFA, owner: any, input?: any): Promise<any>;

  /**
   * Check a code against the factor data (TOTP: RFC 6238; SMS: hashed one-time code)
   * @param mfa - the MFA behavior
   * @param code - submitted code
   * @returns true when the code is valid
   */
  abstract check(mfa: MFA, code: string): Promise<boolean>;

  /**
   * @returns the throttle of the attempts checked with this method
   */
  get throttle(): ThrottleParameters {
    return this.parameters.throttle;
  }

  /**
   * @returns the recovery codes issued with the first enabled factor
   */
  get recoveryCodeCount(): number {
    return this.parameters.recoveryCodes;
  }

  /**
   * Make the method available to the MFA behavior of every model
   * @returns this
   */
  override resolve(): this {
    super.resolve();
    registerSecondFactor(this);
    return this;
  }
}
