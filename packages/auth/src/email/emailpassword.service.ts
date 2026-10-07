import {
  type AuthResult,
  Ident,
  type Mailer,
  Operation,
  Password,
  Route,
  type ProviderInfo,
  registerPasswordPolicy,
  runAsSystem,
  Service,
  ServiceParameters,
  useContext,
  useDynamicService,
  useModelMetadata,
  type User,
  type WebContext,
  WebdaError
} from "@webda/core";
import { WEBDA_PRIMARY_KEY } from "@webda/models";
import type { AuthProvider } from "../provider.js";
import { useAuthentication } from "../provider.js";
import { AccountExists, IdentLinkedElsewhere, InvalidCredentials, Throttled, TokenInvalid } from "../errors.js";
import { signEmailToken, verifyEmailToken } from "./tokens.js";
import { canSend, isLocked, markSent } from "../throttle.js";

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
  /**
   * Browser redirects for emailed links. `confirm` (default `failure`) receives a verification link opened without
   * the matching session, with `?reason=LOGIN_REQUIRED&token=...`: log in then call Auth.Email.Verify with the token
   */
  redirects: { verified?: string; failure?: string; register?: string; confirm?: string };
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
   * a locked ident does not extend the lock; a count reaching the threshold without timestamp is an expired lock.
   * Both are top-level attributes: stores implement atomic increment and
   * single attribute set on them (nested-path atomic operations are not portable across stores). The timestamp
   * is a plain set (last writer wins); the counter is never written back from a snapshot. A burst starting exactly
   * when an expired lock is read is verified as a whole: it is bounded to one burst per lock window.
   * @param ident - the ident
   * @returns true when this attempt must be refused without checking the password
   */
  protected async countAttempt(ident: Ident): Promise<boolean> {
    const { failedBeforeDelay, lockout } = this.parameters.throttle;
    const now = Date.now();
    // A lock whose last attempt is older than the lockout is over: attempts restart a window. A count without any
    // timestamp (v3 `_failedLogin` upgraded without `_lastFailedLogin`) is an expired lock too: v4 always stamps an
    // attempt it verifies, so only such data reaches the threshold unstamped
    const expired =
      (ident._loginAttempts ?? 0) >= failedBeforeDelay &&
      (!ident._lastLoginAttemptAt || !isLocked(ident, failedBeforeDelay, lockout, now));
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
        // Same silent throttle as a logged-out StartVerification: the answer never depends on it
        await this.sendUnownedLink(normalized);
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

  /**
   * Send (or resend) a verification link
   *
   * Logged in: the link proves the email for the current account (`sub` is only in the token, the ident stays
   * unowned until Auth.Email.Verify is called by the same session). Logged out: always answers with no content and
   * never reveals anything; a link is only sent for an unowned or unknown email.
   * @param email - email
   */
  @Operation({
    id: "Auth.Email.StartVerification",
    input: "EmailPasswordProvider.startVerification.input",
    rest: { method: "post", path: "auth/email/verification" }
  })
  async startVerification(email: string): Promise<void> {
    const ctx = useContext<any>();
    const normalized = Ident.normalizeEmail(email);
    const userId: string | undefined = ctx.getSession()?.isLogged() ? ctx.getCurrentUserId() : undefined;
    if (!userId) {
      return this.sendUnownedLink(normalized);
    }
    const token = await runAsSystem(() => this.prepareLink(normalized, userId));
    await this.sendMail("EMAIL_REGISTER", normalized, this.buildLink("/verify", token), token);
  }

  /**
   * Logged-out link: a register link is emailed, without awaiting the mail, only for an unknown or unowned and
   * unverified email whose send throttle allows it; anything else is silently ignored
   * @param normalized - normalised email
   */
  protected async sendUnownedLink(normalized: string): Promise<void> {
    const token = await runAsSystem(() => this.prepareLink(normalized, undefined));
    if (!token) return;
    // Not awaited: the answer must not depend on whether a mail was sent. The link is built in the request context
    this.sendMailDetached("EMAIL_REGISTER", normalized, this.buildLink("/verify", token), token);
  }

  /**
   * Check and mark the send throttle of an email ident, then sign the token to email; runs as system
   * @param normalized - normalised email
   * @param userId - logged user (verify token), undefined for a logged-out register token
   * @returns the token to send, undefined when nothing must be sent (logged out only)
   * @throws IdentLinkedElsewhere / PreconditionFailed / Throttled (logged in only)
   */
  protected async prepareLink(normalized: string, userId: string | undefined): Promise<string | undefined> {
    const { resendDelay } = this.parameters.throttle;
    const auth = useAuthentication();
    let ident = await this.getIdent(normalized);
    const owner = ident?.getUser()?.toString();
    if (!userId && (owner || ident?.isVerified())) {
      return undefined;
    }
    if (userId) {
      if (owner && owner !== userId) {
        throw new IdentLinkedElsewhere();
      }
      if (ident?.isVerified()) {
        throw new WebdaError.PreconditionFailed("Email already verified");
      }
    }
    if (ident && !canSend(ident._throttle, resendDelay)) {
      if (userId) throw new Throttled();
      return undefined;
    }
    if (!ident) {
      // Unowned: only tracks the send throttle
      ident = new (auth.getIdentModel())({ ...Ident.key(normalized, "email"), email: normalized } as any);
      ident._throttle = markSent(undefined);
      try {
        await ident.getRepository().create(ident);
      } catch (err) {
        // A concurrent request just created it, and sends the mail: stay silent when logged out
        if (userId) throw err;
        return undefined;
      }
    } else {
      await ident.ref().patch({ _throttle: markSent(ident._throttle) } as any);
    }
    return signEmailToken(userId ? "verify" : "register", { email: normalized, sub: userId });
  }

  /**
   * Send a mail without awaiting it; failures are logged without any secret
   * @param template - mail template
   * @param to - recipient
   * @param url - link
   * @param token - token
   */
  protected sendMailDetached(template: "EMAIL_REGISTER" | "EMAIL_RECOVERY", to: string, url: string, token: string) {
    const pending: Promise<void> = this.sendMail(template, to, url, token)
      .catch(err => this.log("ERROR", `Cannot send ${template} mail`, err?.code ?? err?.name))
      .finally(() => this.pendingMails.delete(pending));
    this.pendingMails.add(pending);
  }

  /** Mails sent without being awaited */
  protected pendingMails = new Set<Promise<void>>();

  /**
   * Wait for the mails sent without being awaited (logged out verification, recovery)
   */
  async flushMails(): Promise<void> {
    while (this.pendingMails.size) {
      await Promise.all([...this.pendingMails]);
    }
  }

  /**
   * Mark an email as verified: only the session of the user named by the token can complete it
   * @param token - verify token
   * @returns status
   */
  @Operation({
    id: "Auth.Email.Verify",
    input: "EmailPasswordProvider.verify.input",
    output: "EmailPasswordProvider.verify.output",
    rest: { method: "post", path: "auth/email/verify" }
  })
  async verify(token: string): Promise<{ status: "verified" }> {
    return this.verifyWith(token, useContext<any>());
  }

  /**
   * Verify with an explicit context
   * @param token - verify token
   * @param ctx - context whose session must match the token
   * @returns status
   */
  protected async verifyWith(token: string, ctx: any): Promise<{ status: "verified" }> {
    const claims = await verifyEmailToken(token, "verify");
    await this.completeVerify(claims, ctx);
    return { status: "verified" };
  }

  /**
   * @param claims - verified token claims
   * @param claims.sub - user id
   * @param ctx - context
   * @returns true when the session is logged as the user of the token
   */
  protected sessionMatches(claims: { sub?: string }, ctx: any): boolean {
    return !!claims.sub && !!ctx?.getSession?.()?.isLogged() && ctx.getCurrentUserId() === claims.sub;
  }

  /**
   * Complete a verification; nothing changes unless every check passes
   * @param claims - verified token claims
   * @param claims.email - email of the token
   * @param claims.sub - user id
   * @param ctx - context
   */
  protected async completeVerify(claims: { email: string; sub?: string }, ctx: any): Promise<void> {
    if (!ctx?.getSession?.()?.isLogged()) {
      throw new WebdaError.Unauthorized("Login required");
    }
    if (!this.sessionMatches(claims, ctx)) {
      throw new IdentLinkedElsewhere();
    }
    await runAsSystem(async () => {
      const ident = await this.getIdent(claims.email);
      if (!ident) {
        throw new TokenInvalid();
      }
      const owner = ident.getUser()?.toString();
      if (owner && owner !== claims.sub) {
        throw new IdentLinkedElsewhere();
      }
      const patch: any = {};
      if (!ident.isVerified()) patch.verifiedAt = new Date();
      if (!owner) {
        ident.setUser(claims.sub);
        patch._user = ident._user;
      }
      if (Object.keys(patch).length) await ident.ref().patch(patch);
    });
  }

  /**
   * Start password recovery; always succeeds to avoid revealing accounts
   * @param email - email
   */
  @Operation({
    id: "Auth.Password.StartRecovery",
    input: "EmailPasswordProvider.startRecovery.input",
    rest: { method: "post", path: "auth/password/recovery" }
  })
  async startRecovery(email: string): Promise<void> {
    const normalized = Ident.normalizeEmail(email);
    await runAsSystem(async () => {
      const ident = await this.getIdent(normalized);
      if (!ident?.getUser() || !canSend(ident._throttle, this.parameters.throttle.resendDelay)) return;
      const user: User = await useAuthentication()
        .getUserModel()
        .ref(ident.getUser().toString())
        .get()
        .catch(() => undefined);
      if (!(user as any)?.password?.hasPassword()) return;
      await ident.ref().patch({ _throttle: markSent(ident._throttle) } as any);
      const t = await signEmailToken("recover", {
        email: normalized,
        sub: user.getUUID(),
        pwdAt: (user as any).password.changedAt
      });
      this.sendMailDetached("EMAIL_RECOVERY", normalized, this.buildLink("/recover", t), t);
    });
  }

  /**
   * Set a new password from a recovery link (does not log in): revokes the refresh tokens and ends every session of
   * the user (see `Session.authAt`), resets the login attempts of the email ident
   * @param token - recover token
   * @param password - new password
   */
  @Operation({
    id: "Auth.Password.Recover",
    input: "EmailPasswordProvider.recover.input",
    rest: { method: "post", path: "auth/password/recover" }
  })
  async recover(token: string, password: string): Promise<void> {
    const claims = await verifyEmailToken(token, "recover");
    await runAsSystem(async () => {
      const auth = useAuthentication();
      const user: User = await auth
        .getUserModel()
        .ref(claims.sub)
        .get()
        .catch(() => undefined);
      if (!user || !(user as any).password || (user as any).password.changedAt !== claims.pwdAt) {
        throw new TokenInvalid();
      }
      await (user as any).password.set(password);
      await user.save();
      const tokens = useDynamicService<any>("TokenService");
      if (!tokens) {
        throw new Error("Password recovery requires the TokenService to revoke sessions");
      }
      await tokens.revokeUser(user.getUUID());
      // Receiving the mail proves possession of the address; the new password also ends any login lock
      const ident = await this.getIdent(claims.email);
      if (ident && ident.getUser()?.toString() === user.getUUID()) {
        await ident.ref().setAttribute("_loginAttempts", 0);
        if (!ident.isVerified()) await ident.ref().patch({ verifiedAt: new Date() } as any);
      }
      await auth.emit("Authentication.PasswordUpdate", {
        context: useContext(),
        user,
        password: (user as any).password.__hash
      } as any);
    });
  }

  /**
   * Change the current user's password: revokes the refresh tokens and ends the other sessions of the user, the
   * calling cookie session is re-stamped and stays logged in
   * @param current - current password
   * @param next - new password
   */
  @Operation({
    id: "Auth.Password.Change",
    input: "EmailPasswordProvider.changePassword.input",
    rest: { method: "post", path: "auth/password/change" }
  })
  async changePassword(current: string, next: string): Promise<void> {
    const ctx = useContext<any>();
    if (!ctx.getSession()?.isLogged()) {
      throw new WebdaError.Unauthorized("Login required");
    }
    const user: User = await ctx.getCurrentUser();
    await runAsSystem(() => (user as any).password.change(current, next));
    // Every session authenticated before the change ends, except this one (a Bearer caller logs in again)
    ctx.getSession().authAt = Date.now();
    await useAuthentication().emit("Authentication.PasswordUpdate", {
      context: ctx,
      user,
      password: (user as any).password.__hash
    } as any);
  }

  /**
   * Browser landing for emailed links: verifies then redirects, never throws
   * @param ctx - web context
   */
  @Route("./verify{?token}", ["GET"], { hidden: true })
  async verifyRedirect(ctx: WebContext): Promise<void> {
    const { verified, failure, register } = this.parameters.redirects;
    const confirm = this.parameters.redirects.confirm ?? failure;
    const token = ctx.parameter("token");
    const redirect = (url: string) => ctx.writeHead(302, { Location: url });
    try {
      const claims = await verifyEmailToken(token, "verify");
      if (!this.sessionMatches(claims, ctx)) {
        // Nothing changes: a mail scanner prefetching the link must not verify anything
        redirect(`${confirm}?reason=LOGIN_REQUIRED&token=${encodeURIComponent(token)}`);
        return;
      }
      await this.completeVerify(claims, ctx);
      redirect(`${verified}?validation=email`);
    } catch (err) {
      try {
        const claims = await verifyEmailToken(token, "register");
        redirect(`${register}?token=${encodeURIComponent(token)}&email=${encodeURIComponent(claims.email)}`);
      } catch {
        redirect(`${failure}?reason=${encodeURIComponent((err as any)?.code ?? "TOKEN_INVALID")}`);
      }
    }
  }
}
