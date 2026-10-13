import {
  type AuthResult,
  generateRecoveryCodes,
  hashRecoveryCode,
  type IssuedTokens,
  registerOperation,
  listOperations,
  runAsSystem,
  Service,
  ServiceParameters,
  useContext,
  useService,
  type User,
  WebdaError
} from "@webda/core";
import { useAuthentication } from "../provider.js";
import {
  InvalidMfaCode,
  MfaAlreadyEnabled,
  MfaNotEnabled,
  MfaNotPending,
  Throttled
} from "../errors.js";
import { countAttempt, type ThrottleParameters } from "../throttle.js";

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
 * Base service for Multi-Factor Authentication second factor methods (TOTP, SMS, etc.)
 */
export abstract class SecondFactorService<
  P extends SecondFactorParameters = SecondFactorParameters
> extends Service<P> {
  /** amr value and key in MFA.methods(), e.g. "totp", "sms" */
  abstract readonly method: string;

  /** Start enrollment: store pending factor data in user.mfa.factors[method] */
  protected abstract startEnrollment(user: User, input?: any): Promise<any>;

  /**
   * Send a challenge if the factor needs one (TOTP: no-op)
   * @param _user - user to challenge
   */
  protected async challenge(_user: User): Promise<void> {}

  /** Check a code against the stored factor data (TOTP: RFC 6238; SMS: hashed one-time code) */
  protected abstract check(user: User, code: string): Promise<boolean>;

  /**
   * Start enrollment for the current user
   * @param input - optional factor-specific enrollment input
   * @returns enrollment data (e.g. secret and URI for TOTP)
   */
  async enroll(input?: any): Promise<any> {
    const ctx = useContext<any>();
    const session = ctx.getSession();
    if (!session?.isLogged()) {
      throw new WebdaError.Unauthorized("Login required");
    }
    const userId = session.userId;
    const user = await runAsSystem(() => useAuthentication().getUserModel().ref(userId).get());
    if (user.mfa?.isEnabled(this.method)) {
      throw new MfaAlreadyEnabled();
    }
    if (
      this.parameters.reauthMaxAge &&
      session.authAt &&
      Date.now() - session.authAt > this.parameters.reauthMaxAge * 1000
    ) {
      throw new WebdaError.Unauthorized("Reauthentication required");
    }
    return this.startEnrollment(user, input);
  }

  /**
   * Confirm enrollment of this factor with a valid code
   * @param code - verification code from the factor
   * @returns recovery codes and the tokens of the new MFA-verified session
   */
  async confirm(code: string | { code: string }): Promise<{ recoveryCodes: string[] } & IssuedTokens> {
    const ctx = useContext<any>();
    const session = ctx.getSession();
    if (!session?.isLogged()) {
      throw new WebdaError.Unauthorized("Login required");
    }
    const userId = session.userId;
    const user = await runAsSystem(() => useAuthentication().getUserModel().ref(userId).get());
    if (user.mfa?.isEnabled(this.method)) {
      throw new MfaAlreadyEnabled();
    }
    const codeStr = extractCode(code);
    const ok = await this.check(user, codeStr);
    if (!ok) {
      throw new InvalidMfaCode();
    }

    const factor = user.mfa!.getFactor(this.method);
    factor.enabledAt = Date.now();

    let recoveryCodes: string[] = [];
    const numCodes = this.parameters.recoveryCodes;
    if (numCodes > 0) {
      recoveryCodes = generateRecoveryCodes(numCodes);
      user.mfa!.__recoveryCodes = recoveryCodes.map(hashRecoveryCode);
    }

    await runAsSystem(() => user.save());
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
    const ctx = useContext<any>();
    const session = ctx.getSession();
    if (!session?.isPending()) {
      throw new MfaNotPending();
    }
    const userId = session.userId;
    const user = await runAsSystem(() => useAuthentication().getUserModel().ref(userId).get());
    if (!user.mfa?.isEnabled(this.method)) {
      throw new MfaNotEnabled();
    }

    const locked = await countAttempt(user.ref(), "_mfaAttempts", "_lastMfaAttemptAt", this.parameters.throttle, user);
    if (locked) {
      throw new Throttled();
    }

    const codeStr = extractCode(code);
    const ok = await this.check(user, codeStr);
    if (!ok) {
      await useAuthentication().emit("Authentication.MfaFailed", {
        context: ctx,
        user,
        userId,
        method: this.method
      } as any);
      throw new InvalidMfaCode();
    }

    await runAsSystem(() => user.save());
    await runAsSystem(() => user.ref().setAttribute("_mfaAttempts", 0));
    return useAuthentication().completeSecondFactor([this.method]);
  }

  /**
   * Recover login with a recovery code
   * @param code - recovery code
   * @returns auth result with issued tokens
   */
  async recover(code: string | { code: string }): Promise<AuthResult> {
    const ctx = useContext<any>();
    const session = ctx.getSession();
    if (!session?.isPending()) {
      throw new MfaNotPending();
    }
    const userId = session.userId;
    const user = await runAsSystem(() => useAuthentication().getUserModel().ref(userId).get());
    if (!user.mfa?.isEnabled()) {
      throw new MfaNotEnabled();
    }

    const locked = await countAttempt(user.ref(), "_mfaAttempts", "_lastMfaAttemptAt", this.parameters.throttle, user);
    if (locked) {
      throw new Throttled();
    }

    const codeStr = extractCode(code);
    const ok = user.mfa?.consumeRecoveryCode(codeStr);
    if (!ok) {
      await useAuthentication().emit("Authentication.MfaFailed", {
        context: ctx,
        user,
        userId,
        method: "recovery"
      } as any);
      throw new InvalidMfaCode();
    }

    await runAsSystem(() => user.save());
    await runAsSystem(() => user.ref().setAttribute("_mfaAttempts", 0));
    return useAuthentication().completeSecondFactor(["recovery"]);
  }

  /**
   * Disable this second factor method
   * @param code - verification code (factor code or recovery code)
   */
  async disable(code: string | { code: string }): Promise<void> {
    const ctx = useContext<any>();
    const session = ctx.getSession();
    if (!session?.isLogged() || session.mfa !== "verified") {
      throw new WebdaError.Unauthorized("Login required");
    }
    const userId = session.userId;
    const user = await runAsSystem(() => useAuthentication().getUserModel().ref(userId).get());
    if (!user.mfa?.isEnabled(this.method)) {
      throw new MfaNotEnabled();
    }

    const codeStr = extractCode(code);
    let ok = await this.check(user, codeStr);
    if (!ok && user.mfa?.hasRecoveryCodes()) {
      ok = user.mfa.consumeRecoveryCode(codeStr);
    }
    if (!ok) {
      await useAuthentication().emit("Authentication.MfaFailed", {
        context: ctx,
        user,
        userId,
        method: this.method
      } as any);
      throw new InvalidMfaCode();
    }

    user.mfa!.clearFactor(this.method);
    if (!user.mfa!.isEnabled()) {
      user.mfa!.__recoveryCodes = undefined;
    }
    await runAsSystem(() => user.save());
    await useAuthentication().emit("Authentication.MfaDisabled", {
      context: ctx,
      user,
      userId,
      method: this.method
    } as any);
  }

  /**
   * Regenerate recovery codes
   * @param code - verification code (factor code or existing recovery code)
   * @returns new recovery codes
   */
  async recoveryCodes(code: string | { code: string }): Promise<{ recoveryCodes: string[] }> {
    const ctx = useContext<any>();
    const session = ctx.getSession();
    if (!session?.isLogged() || session.mfa !== "verified") {
      throw new WebdaError.Unauthorized("Login required");
    }
    const userId = session.userId;
    const user = await runAsSystem(() => useAuthentication().getUserModel().ref(userId).get());
    if (!user.mfa?.isEnabled(this.method)) {
      throw new MfaNotEnabled();
    }

    const codeStr = extractCode(code);
    let ok = await this.check(user, codeStr);
    if (!ok && user.mfa?.hasRecoveryCodes()) {
      ok = user.mfa.consumeRecoveryCode(codeStr);
    }
    if (!ok) {
      await useAuthentication().emit("Authentication.MfaFailed", {
        context: ctx,
        user,
        userId,
        method: this.method
      } as any);
      throw new InvalidMfaCode();
    }

    const recoveryCodes = generateRecoveryCodes(this.parameters.recoveryCodes);
    user.mfa!.__recoveryCodes = recoveryCodes.map(hashRecoveryCode);
    await runAsSystem(() => user.save());
    return { recoveryCodes };
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
      [`Auth.${methodCap}.Recover`, "recover", { method: "post", path: "auth/mfa/recover" }],
      [`Auth.${methodCap}.RecoveryCodes`, "recoveryCodes", { method: "post", path: "auth/mfa/recovery-codes" }],
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
