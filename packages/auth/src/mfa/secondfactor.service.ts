import {
  type AuthResult,
  InvalidMfaCode,
  type IssuedTokens,
  type MFA,
  registerOperation,
  registerSecondFactor,
  listOperations,
  runAsSystem,
  type SecondFactorProvider,
  Service,
  ServiceParameters,
  type ThrottleParameters,
  useContext,
  useService,
  type User,
  WebdaError
} from "@webda/core";
import { useAuthentication } from "../provider.js";
import { MfaNotPending } from "../errors.js";
/**
 * Extract string code from either a direct string or a JSON body object `{ code }`
 * @param input - code string or object containing code
 * @returns extracted code string
 */
export function extractCode(input: any): string {
  if (typeof input === "string") return input.trim();
  if (input && typeof input === "object" && typeof input.code === "string") {
    return input.code.trim();
  }
  return "";
}

/** Parameters common to all second factor services */
export class SecondFactorParameters extends ServiceParameters {
  /** Throttle config for failed attempts */
  throttle: ThrottleParameters = { failedBeforeDelay: 5, lockout: 900000 };
  /** Number of recovery codes generated (default 10, 0 disables recovery codes) */
  recoveryCodes: number = 10;
  /** Max age (s) of the primary login for enroll without re-authenticating */
  reauthMaxAge: number = 300;
}

/**
 * Base service of a second factor method (TOTP, SMS, etc.): the method implementation for the MFA behavior, and the
 * authentication operations using it as the login second factor of the current user
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

  /**
   * @param check - session state required: logged in, logged in with MFA verified, or awaiting its second factor
   * @returns the session and the user of the current context
   */
  private async currentUser(check: "logged" | "verified" | "pending"): Promise<{ ctx: any; session: any; user: User }> {
    const ctx = useContext<any>();
    const session = ctx.getSession();
    if (check === "pending") {
      if (!session?.isPending()) {
        throw new MfaNotPending();
      }
    } else if (!session?.isLogged() || (check === "verified" && session.mfa !== "verified")) {
      throw new WebdaError.Unauthorized("Login required");
    }
    const user = await runAsSystem(() => useAuthentication().getUserModel().ref(session.userId).get());
    return { ctx, session, user };
  }

  /**
   * Run an MFA check of the user, emitting Authentication.MfaFailed when the code is refused
   * @param user - user
   * @param method - method reported by the event
   * @param run - the check
   * @returns the check result
   */
  private async reportFailure<T>(user: User, method: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof InvalidMfaCode) {
        await useAuthentication().emit("Authentication.MfaFailed", {
          context: useContext(),
          user,
          userId: user.getUUID(),
          method
        } as any);
      }
      throw err;
    }
  }

  /**
   * Start enrollment for the current user
   * @param input - optional factor-specific enrollment input
   * @returns enrollment data (e.g. secret and URI for TOTP)
   */
  async enroll(input?: any): Promise<any> {
    const { session, user } = await this.currentUser("logged");
    if (
      this.parameters.reauthMaxAge &&
      session.authAt &&
      Date.now() - session.authAt > this.parameters.reauthMaxAge * 1000
    ) {
      throw new WebdaError.Unauthorized("Reauthentication required");
    }
    return user.mfa!.startEnrollment(this.method, input);
  }

  /**
   * Confirm enrollment of this factor with a valid code
   * @param code - verification code from the factor
   * @returns recovery codes (empty when kept from a previous factor) and the tokens of the new MFA-verified session
   */
  async confirm(code: string | { code: string }): Promise<{ recoveryCodes: string[] } & IssuedTokens> {
    const { ctx, session, user } = await this.currentUser("logged");
    const userId = user.getUUID();
    const { recoveryCodes } = await this.reportFailure(user, this.method, () =>
      user.mfa!.confirmFactor(this.method, extractCode(code))
    );
    await useAuthentication().emit("Authentication.MfaEnabled", {
      context: ctx,
      user,
      userId,
      method: this.method
    } as any);

    // Every refresh family is revoked, the caller's too: it gets a new MFA-verified one below
    const tokenService = useService("TokenService");
    await runAsSystem(() => tokenService.revokeUser(userId));

    session.mfa = "verified";
    session.amr = [...(session.amr ?? []).filter((a: string) => a !== this.method), this.method];
    const tokens = await runAsSystem(() => tokenService.issue(session));

    return { recoveryCodes, ...tokens };
  }

  /**
   * Verify second factor during login
   * @param code - code submitted by user
   * @returns auth result with issued tokens
   */
  async verify(code: string | { code: string }): Promise<AuthResult> {
    const { user } = await this.currentUser("pending");
    await this.reportFailure(user, this.method, () => user.mfa!.verifyCode(extractCode(code), this.method));
    return useAuthentication().completeSecondFactor([this.method]);
  }

  /**
   * Recover login with a recovery code
   * @param code - recovery code
   * @returns auth result with issued tokens
   */
  async recover(code: string | { code: string }): Promise<AuthResult> {
    const { user } = await this.currentUser("pending");
    await this.reportFailure(user, "recovery", () => user.mfa!.verifyCode(extractCode(code), "recovery"));
    return useAuthentication().completeSecondFactor(["recovery"]);
  }

  /**
   * Disable this second factor method
   * @param code - verification code (factor code or recovery code)
   */
  async disable(code: string | { code: string }): Promise<void> {
    const { ctx, user } = await this.currentUser("verified");
    await this.reportFailure(user, this.method, () => user.mfa!.disableFactor(this.method, extractCode(code)));
    await useAuthentication().emit("Authentication.MfaDisabled", {
      context: ctx,
      user,
      userId: user.getUUID(),
      method: this.method
    } as any);
  }

  /**
   * Regenerate recovery codes
   * @param code - verification code (code of any enabled factor or an existing recovery code)
   * @returns new recovery codes
   */
  async recoveryCodes(code: string | { code: string }): Promise<{ recoveryCodes: string[] }> {
    const { user } = await this.currentUser("verified");
    return this.reportFailure(user, "recovery", () => user.mfa!.regenerateRecoveryCodes(extractCode(code)));
  }

  /** @override */
  override initOperations(): void {
    super.initOperations();
    const methodCap = this.method.substring(0, 1).toUpperCase() + this.method.substring(1);
    const serviceName = this.getName();

    const ops: [string, string, any][] = [
      [`Auth.${methodCap}.Enroll`, "enroll", { method: "post", path: `auth/mfa/${this.method}/enroll` }],
      [`Auth.${methodCap}.Confirm`, "confirm", { method: "post", path: `auth/mfa/${this.method}/confirm` }],
      [`Auth.${methodCap}.Verify`, "verify", { method: "post", path: `auth/mfa/${this.method}/verify` }],
      [`Auth.${methodCap}.Disable`, "disable", { method: "post", path: `auth/mfa/${this.method}/disable` }],
      // Shared by every factor: registered once, by the first second factor service
      [`Auth.Mfa.Recover`, "recover", { method: "post", path: "auth/mfa/recover" }],
      [`Auth.Mfa.RecoveryCodes`, "recoveryCodes", { method: "post", path: "auth/mfa/recovery-codes" }]
    ];

    const currentOps = listOperations();
    for (const [id, method, rest] of ops) {
      if (!currentOps[id]) {
        registerOperation(id, {
          service: serviceName,
          method,
          rest,
          input: `${serviceName}.${method}.input`,
          output: `${serviceName}.${method}.output`
        } as any);
      }
    }
  }
}
