import {
  type AuthResult,
  Ident,
  type Mailer,
  Operation,
  Password,
  type ProviderInfo,
  registerPasswordPolicy,
  runAsSystem,
  Service,
  ServiceParameters,
  useContext,
  useDynamicService,
  useModelMetadata,
  type User,
  WebdaError
} from "@webda/core";
import { WEBDA_PRIMARY_KEY } from "@webda/models";
import type { AuthProvider } from "../provider.js";
import { useAuthentication } from "../provider.js";
import { AccountExists, InvalidCredentials, Throttled, TokenInvalid } from "../errors.js";
import { signEmailToken, verifyEmailToken } from "./tokens.js";
import { isLocked } from "../throttle.js";

/** When the email is verified relative to account creation */
export type VerificationMode = "before" | "after" | "none";

/** EmailPasswordProvider parameters */
export class EmailPasswordParameters extends ServiceParameters {
  /**
   * Mailer service name
   * @default "Mailer"
   */
  mailer: string;
  /**
   * Verification mode
   * @default "before"
   */
  verification: VerificationMode;
  /** Password rules */
  password: { policy?: string; verifier?: string };
  /** Throttling */
  throttle: { resendDelay?: number; failedBeforeDelay?: number; lockout?: number };
  /** Browser redirects for emailed links */
  redirects: { verified?: string; failure?: string; register?: string };
  /**
   * Base url for emailed links
   * @default "/auth/email"
   */
  url: string;
  /** Only these email domains may use this provider (see ProviderEmailPolicy) */
  allowedEmailDomains?: string[];
  /** Whether the verification of the email is believed (see ProviderEmailPolicy) */
  trustEmailVerification?: boolean | string[];

  /**
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.mailer ??= "Mailer";
    this.verification ??= "before";
    this.password = { policy: ".{8,}", ...(this.password ?? {}) };
    this.throttle = { resendDelay: 14400000, failedBeforeDelay: 3, lockout: 900000, ...(this.throttle ?? {}) };
    this.redirects ??= {};
    this.url ??= "/auth/email";
    return this;
  }
}

// bcrypt cost-10 hash of a throwaway string: compared against for unknown emails so timing matches
const DUMMY_HASH = "$2b$10$Loq148myoR.Yp2D2x5zkj.Z0FQq2afzaddIc2PGWzzdJCOEL.FZ4W";

/**
 * Profile attributes a client may set: attributes of the user model input schema, minus behaviors, relations,
 * primary key fields and private (`_`-prefixed) fields
 * @param model - user model
 * @returns the allowed attribute names
 */
function allowedProfileKeys(model: any): Set<string> {
  const meta: any = useModelMetadata(model);
  const relations = meta?.Relations ?? {};
  const denied = new Set<string>([
    ...(model.prototype?.[WEBDA_PRIMARY_KEY] ?? ["uuid"]),
    ...(relations.behaviors ?? []).map((r: any) => r.attribute),
    ...(relations.links ?? []).map((r: any) => r.attribute),
    ...(relations.queries ?? []).map((r: any) => r.attribute),
    ...(relations.maps ?? []).map((r: any) => r.attribute),
    ...(relations.binaries ?? []).map((r: any) => r.attribute),
    ...(relations.parent ? [relations.parent.attribute] : [])
  ]);
  const props = Object.keys(meta?.Schemas?.Input?.properties ?? {});
  return new Set(props.filter(k => !denied.has(k) && !k.startsWith("_")));
}

/**
 * @param model - user model
 * @param profile - client supplied profile
 * @returns the profile restricted to the attributes the model allows
 */
function sanitizeProfile(model: any, profile: any): any {
  const safe: any = {};
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return safe;
  const allowed = allowedProfileKeys(model);
  for (const [key, value] of Object.entries(profile)) {
    if (allowed.has(key)) safe[key] = value;
  }
  return safe;
}

/**
 * Email + password login method
 *
 * The password policy is process-wide: resolve() registers the one of this provider and stop() restores the
 * default. With several instances the last one resolved wins.
 *
 * Known residual exposure: Auth.Email.Register answers AccountExists for a registered email (enumeration), and
 * login timing differs slightly for known emails. An unverified squatter owning an email blocks its registration
 * until the real owner goes through account recovery.
 *
 * Under `allowedEmailDomains` an email must be verified: with `verification` "after" or "none" a new registration is
 * unverified and therefore refused (EMAIL_DOMAIN_NOT_ALLOWED); use "before".
 * @WebdaModda EmailPasswordProvider
 */
export class EmailPasswordProvider<T extends EmailPasswordParameters = EmailPasswordParameters>
  extends Service<T>
  implements AuthProvider
{
  static Parameters = EmailPasswordParameters;

  readonly providerName = "email";

  /** @override */
  resolve(): this {
    super.resolve();
    const verifierName = this.parameters.password.verifier;
    const regexp = new RegExp(this.parameters.password.policy);
    registerPasswordPolicy(
      verifierName
        ? { validate: (p, u) => useDynamicService<any>(verifierName).validate(p, u) }
        : { validate: async p => regexp.test(p) }
    );
    return this;
  }

  /** @override */
  async init(): Promise<this> {
    await super.init();
    if (this.parameters.verification !== "none" && !useDynamicService(this.parameters.mailer)) {
      throw new Error(`EmailPasswordProvider requires a Mailer service '${this.parameters.mailer}'`);
    }
    return this;
  }

  /** @override */
  async stop(): Promise<void> {
    registerPasswordPolicy(undefined);
    await super.stop();
  }

  /**
   * @returns public info
   */
  getPublicInfo(): ProviderInfo {
    return { name: "email", type: "password" };
  }

  /**
   * @param email - normalised email
   * @returns the email ident
   */
  protected async getIdent(email: string): Promise<Ident | undefined> {
    return runAsSystem(() => (useAuthentication() as any).findIdent("email", email));
  }

  /**
   * Absolute link for an emailed token
   * @param path - path under the provider url
   * @param token - token
   * @returns url
   */
  buildLink(path: string, token: string): string {
    const ctx = useContext<any>();
    const relative = `${this.parameters.url}${path}?token=${encodeURIComponent(token)}`;
    return ctx?.getHttpContext ? ctx.getHttpContext().getAbsoluteUrl(relative) : relative;
  }

  /**
   * @param template - mail template
   * @param to - recipient
   * @param url - link
   * @param token - token
   */
  protected async sendMail(
    template: "EMAIL_REGISTER" | "EMAIL_RECOVERY",
    to: string,
    url: string,
    token: string
  ): Promise<void> {
    const ctx = useContext<any>();
    await useDynamicService<Mailer>(this.parameters.mailer).send({
      to,
      locale: ctx?.getLocale?.(),
      template,
      replacements: { url, token, to }
    } as any);
  }

  /**
   * Count a login attempt before verifying it and decide whether the ident is locked
   *
   * Rule, equivalent to `isLocked(ident, failedBeforeDelay, lockout)` on the state before this attempt:
   * `_loginAttempts` is incremented first (atomically; the new value is returned by the memory repository and
   * re-read otherwise), so this attempt is locked when the count of PREVIOUS attempts (`_loginAttempts - 1`) is at
   * least `failedBeforeDelay`, unless that lock has expired, ie `_lastLoginAttemptAt` as read when this call started
   * is older than `lockout`. `_lastLoginAttemptAt` is only refreshed by attempts that are not refused, so hammering
   * a locked ident does not extend the lock. Both are top-level attributes: stores implement atomic increment and
   * single attribute set on them (nested-path atomic operations are not portable across stores). The timestamp
   * is a plain set (last writer wins); the counter is never written back from a snapshot. A burst starting exactly
   * when an expired lock is read is verified as a whole: it is bounded to one burst per lock window.
   * @param ident - the ident
   * @returns true when this attempt must be refused without checking the password
   */
  protected async countAttempt(ident: Ident): Promise<boolean> {
    const { failedBeforeDelay, lockout } = this.parameters.throttle;
    const now = Date.now();
    // A lock whose last attempt is older than the lockout is over: attempts restart a window
    const expired =
      (ident._loginAttempts ?? 0) >= failedBeforeDelay &&
      !!ident._lastLoginAttemptAt &&
      !isLocked(ident, failedBeforeDelay, lockout, now);
    const ref = ident.ref();
    const updated = await runAsSystem(() => ref.incrementAttribute("_loginAttempts"));
    const attempts = (updated as any)?.["_loginAttempts"] ?? (await runAsSystem(() => ref.get()))._loginAttempts;
    const locked = !expired && attempts - 1 >= failedBeforeDelay;
    if (!locked) {
      await runAsSystem(() => ref.setAttribute("_lastLoginAttemptAt", now));
    }
    return locked;
  }

  /**
   * Login with email and password
   * @param email - email
   * @param password - password
   * @returns the auth result
   */
  // Schemas are compiled per class: name them explicitly so any service instance name works
  @Operation({
    id: "Auth.Email.Login",
    input: "EmailPasswordProvider.login.input",
    output: "EmailPasswordProvider.login.output",
    rest: { method: "post", path: "auth/email/login" }
  })
  async login(email: string, password: string): Promise<AuthResult> {
    const normalized = Ident.normalizeEmail(email);
    const ctx = useContext<any>();
    const auth = useAuthentication();
    const ident = await this.getIdent(normalized);
    const userId = ident?.getUser()?.toString();
    const user: User | undefined = userId
      ? await runAsSystem(() => auth.getUserModel().ref(userId).get()).catch(() => undefined)
      : undefined;
    // Count before verifying: parallel guesses are each counted and refused once the threshold is crossed
    if (ident && (await this.countAttempt(ident))) {
      throw new Throttled();
    }
    let ok: boolean;
    if (user && (user as any).password) {
      ok = await (user as any).password.verify(password);
    } else {
      // Same cost as a real check so timing does not reveal unknown emails
      const dummy = new Password();
      dummy.setHash(DUMMY_HASH);
      await dummy.verify(`${password}`);
      ok = false;
    }
    if (!ok) {
      await auth.emit("Authentication.LoginFailed", { context: ctx, user } as any);
      throw new InvalidCredentials();
    }
    // A success always follows a counted attempt (a user implies an ident), so the counter is non-zero here
    await runAsSystem(() => ident.ref().setAttribute("_loginAttempts", 0));
    return auth.complete({
      provider: "email",
      providerUid: normalized,
      email: normalized,
      emailVerified: ident.isVerified(),
      amr: ["pwd"],
      user
    });
  }

  /**
   * Register with email and password
   * @param email - email
   * @param password - password
   * @param token - register token from the emailed link (verification "before")
   * @param profile - extra user fields
   * @returns the auth result, or verification_sent
   */
  // Schemas are compiled per class: name them explicitly so any service instance name works
  @Operation({
    id: "Auth.Email.Register",
    input: "EmailPasswordProvider.register.input",
    output: "EmailPasswordProvider.register.output",
    rest: { method: "post", path: "auth/email/register" }
  })
  async register(email: string, password: string, token?: string, profile?: any): Promise<any> {
    const ctx = useContext<any>();
    if (ctx.getSession()?.isLogged()) {
      throw new WebdaError.Gone("Already logged in");
    }
    const normalized = Ident.normalizeEmail(email);
    const mode = this.parameters.verification;
    const auth = useAuthentication();
    const existing = await this.getIdent(normalized);
    // Any owned email ident refuses: logging in as its owner here would skip the password check
    if (existing?.getUser()) {
      throw new AccountExists();
    }
    let verified = false;
    if (mode === "before") {
      if (!token) {
        // Refuse early what the policy would refuse later
        auth.applyPolicy({
          provider: "email",
          providerUid: normalized,
          email: normalized,
          emailVerified: true,
          amr: ["pwd"]
        });
        const t = await signEmailToken("register", { email: normalized });
        await this.sendMail("EMAIL_REGISTER", normalized, this.buildLink("/verify", t), t);
        return { status: "verification_sent" };
      }
      const claims = await verifyEmailToken(token, "register");
      if (claims.email !== normalized) {
        throw new TokenInvalid();
      }
      verified = true;
    }
    const base = {
      provider: "email",
      providerUid: normalized,
      email: normalized,
      emailVerified: verified,
      amr: ["pwd"]
    };
    // Nothing is created when the email policy refuses
    auth.applyPolicy(base);
    const safeProfile = sanitizeProfile(auth.getUserModel(), profile);
    const user: User = await runAsSystem(() =>
      auth.getUserModel().create({ ...safeProfile, email: normalized } as any, false)
    );
    await (user as any).password.set(password);
    const identity = { ...base, user };
    await auth.emit("Authentication.PasswordCreate", {
      context: ctx,
      user,
      password: (user as any).password.__hash
    } as any);
    await auth.emit("Authentication.Register", {
      context: ctx,
      user,
      data: safeProfile,
      identId: `${normalized}:email`,
      identity
    } as any);
    await runAsSystem(() => user.save());
    let result: AuthResult;
    try {
      result = await auth.complete(identity, { newUser: true });
    } catch (err) {
      await runAsSystem(() => user.delete());
      throw err;
    }
    if (mode === "after") {
      const t = await signEmailToken("verify", { email: normalized, sub: user.getUUID() });
      await this.sendMail("EMAIL_REGISTER", normalized, this.buildLink("/verify", t), t);
    }
    return result;
  }
}
