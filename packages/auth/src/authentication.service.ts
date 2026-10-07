import {
  type AuthenticationEvents,
  type AuthResult,
  Command,
  Counter,
  Ident,
  type IAuthenticationService,
  type IssuedTokens,
  Operation,
  type ProviderInfo,
  type ResolvedIdentity,
  registerUserResolver,
  runAsSystem,
  Service,
  ServiceParameters,
  useContext,
  useCore,
  useModel,
  useService,
  type User,
  V3_PASSWORD_MAPPED,
  WebdaError
} from "@webda/core";
import type { ModelClass } from "@webda/models";
import { AccountExists, IdentConflict, IdentLinkedElsewhere, LastLoginMethod, RegistrationDisabled } from "./errors.js";
import { isLegacyIdent, legacyIdents, legacyKey, splitLegacyKey, upgradeIdent } from "./compat/upgrade.js";
import { type AuthProvider, applyEmailPolicy, isAuthProvider, type ProviderEmailPolicy } from "./provider.js";

/** Account linking policy for unauthenticated logins matching an existing email */
export type LinkingPolicy = "never" | "verified" | "always";

/** v3 data compatibility options */
export interface AuthenticationCompatibility {
  /**
   * Read and write v3 data layouts
   * @default true
   */
  v3?: boolean;
}

/** Counts of one kind of migrated records */
export interface MigrationCounts {
  /** Records migrated (or that would be, in a dry run) */
  migrated: number;
  /** Records that look like v3 data but are not migrated (unrecognised key, foreign row) */
  skipped: number;
  /** Keys of the records whose migration failed */
  failed: string[];
}

/** Result of `webda auth migrate` */
export interface MigrationReport {
  /** v3 ident records */
  idents: MigrationCounts;
  /** Users whose stored record still has the v3 `__password` */
  users: MigrationCounts;
  /** Nothing was written */
  dryRun: boolean;
  /** Set when the ident passes stopped at the pass limit with records still migrating: run the command again */
  incomplete?: boolean;
}

/** Authentication methods (amr) that are a primary factor: a second factor only counts on top of one of them */
export const PRIMARY_FACTORS: readonly string[] = ["pwd", "oauth"];

/** Maximum ident passes of one migration */
const MIGRATION_MAX_PASSES = 100;

/** Authentication parameters */
export class AuthenticationParameters extends ServiceParameters {
  /**
   * User model
   * @default "Webda/User"
   */
  userModel?: string;
  /**
   * Ident model
   * @default "Webda/Ident"
   */
  identModel?: string;
  /**
   * Linking policy
   * @default "verified"
   */
  linking?: LinkingPolicy;
  /**
   * Allow automatic registration of new users
   * @default true
   */
  registration?: boolean;
  /**
   * v3 data compatibility
   * @default { "v3": true }
   */
  compatibility?: AuthenticationCompatibility;

  /**
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.userModel ??= "Webda/User";
    this.identModel ??= "Webda/Ident";
    this.linking ??= "verified";
    this.registration ??= true;
    this.compatibility ??= { v3: true };
    return this;
  }
}

/**
 * Shared authentication logic: providers hand a ResolvedIdentity to complete()
 * @WebdaModda Authentication
 */
export class Authentication<T extends AuthenticationParameters = AuthenticationParameters>
  extends Service<T, AuthenticationEvents>
  implements IAuthenticationService
{
  static Parameters = AuthenticationParameters;

  declare protected metrics?: {
    login?: Counter;
    logout?: Counter;
    registration?: Counter;
  };

  protected providerMap = new Map<string, AuthProvider>();

  /**
   * @returns the configured user model
   */
  getUserModel(): ModelClass<User> {
    return useModel(this.parameters.userModel) as unknown as ModelClass<User>;
  }

  /**
   * @returns the configured ident model
   */
  getIdentModel(): ModelClass<Ident> {
    return useModel(this.parameters.identModel) as unknown as ModelClass<Ident>;
  }

  /** @override */
  resolve(): this {
    super.resolve();
    this.discoverProviders();
    registerUserResolver({
      resolve: async (id: string) => {
        const ref = (this.getUserModel() as any).ref(id);
        return (await ref.exists()) ? await ref.get() : undefined;
      }
    });
    return this;
  }

  /** @override */
  async init(): Promise<this> {
    await super.init();
    // Providers may be created after this service was resolved
    this.discoverProviders();
    return this;
  }

  /**
   * Collect every service implementing {@link AuthProvider}
   * @throws Error when two providers share the same name
   */
  protected discoverProviders(): void {
    // The resolve() pass is best-effort (later services may not exist yet), the init() pass is authoritative
    const providers = new Map<string, AuthProvider>();
    for (const service of Object.values(useCore().getServices())) {
      if (!isAuthProvider(service)) continue;
      if (providers.has(service.providerName)) {
        throw new Error(`Duplicate auth provider '${service.providerName}'`);
      }
      providers.set(service.providerName, service);
    }
    this.providerMap = providers;
  }

  /** @override */
  async stop(): Promise<void> {
    registerUserResolver(undefined);
    await super.stop();
  }

  /**
   * @param name - provider name
   * @returns the provider
   */
  getProvider(name: string): AuthProvider | undefined {
    return this.providerMap.get(name);
  }

  /**
   * @param name - provider name
   * @returns the email policy of that provider, undefined for unknown providers or without policy
   */
  protected emailPolicyFor(name: string): ProviderEmailPolicy | undefined {
    const provider = this.getProvider(name);
    if (!provider) return undefined;
    if (typeof provider.getEmailPolicy === "function") return provider.getEmailPolicy();
    const params: any = provider.getParameters?.();
    if (!params) return undefined;
    const { allowedEmailDomains, trustEmailVerification } = params;
    const strings = (v: unknown) => Array.isArray(v) && v.every(d => typeof d === "string");
    if (allowedEmailDomains !== undefined && !strings(allowedEmailDomains)) {
      throw new Error(`Invalid email policy for provider '${name}': allowedEmailDomains must be a string[]`);
    }
    if (
      trustEmailVerification !== undefined &&
      typeof trustEmailVerification !== "boolean" &&
      !strings(trustEmailVerification)
    ) {
      throw new Error(
        `Invalid email policy for provider '${name}': trustEmailVerification must be a boolean or string[]`
      );
    }
    return allowedEmailDomains === undefined && trustEmailVerification === undefined
      ? undefined
      : { allowedEmailDomains, trustEmailVerification };
  }

  /**
   * @returns public info of every provider
   */
  getProviders(): ProviderInfo[] {
    return [...this.providerMap.values()].map(p => p.getPublicInfo());
  }

  /**
   * List available login methods
   * @returns providers
   */
  @Operation({ id: "Auth.Providers", rest: { method: "get", path: "auth/providers" } })
  providers(): ProviderInfo[] {
    return this.getProviders();
  }

  /**
   * Current user
   * @returns public entry of the logged user
   */
  @Operation({ id: "Auth.Me", rest: { method: "get", path: "auth/me" } })
  async me(): Promise<any> {
    const ctx = useContext();
    const user: User = ctx.getSession()?.isLogged() ? await ctx.getCurrentUser() : undefined;
    if (!user) {
      throw new WebdaError.NotFound("No user found");
    }
    await this.emit("Authentication.GetMe", { context: ctx, user } as any);
    return user.toPublicEntry();
  }

  /** @override */
  initMetrics(): void {
    super.initMetrics();
    this.metrics.login = this.getMetric(Counter, {
      name: "auth_login",
      help: "Counter number of login per provider",
      labelNames: ["provider"]
    });
    this.metrics.logout = this.getMetric(Counter, {
      name: "auth_logout",
      help: "Counter number of logout"
    });
    this.metrics.registration = this.getMetric(Counter, {
      name: "auth_registration",
      help: "Counter number of registration per provider",
      labelNames: ["provider"]
    });
  }

  /**
   * Find an ident; with `compatibility.v3`, a miss falls back to the v3 record `"<uid>_<provider>"`, upgraded on
   * the fly
   * @param provider - provider
   * @param providerUid - uid
   * @returns the ident when it exists
   */
  protected async findIdent(provider: string, providerUid: string): Promise<Ident | undefined> {
    const IdentModel = this.getIdentModel();
    const ref = IdentModel.ref(Ident.key(providerUid, provider));
    if (await ref.exists()) {
      return ref.get();
    }
    if (!this.parameters.compatibility?.v3) {
      return undefined;
    }
    const legacy = IdentModel.ref(legacyKey(providerUid, provider) as any);
    if (!(await legacy.exists())) {
      return undefined;
    }
    // The v3-looking key of a shared store may hold another model's row: only a v3 ident is upgraded
    const v3 = await legacy.get().catch(() => undefined);
    if (!isLegacyIdent(v3, IdentModel)) {
      this.log("WARN", `Ignoring a non-ident row stored under a v3 '${provider}' ident key`);
      return undefined;
    }
    const ident = await runAsSystem(() => upgradeIdent(v3, IdentModel));
    if (ident.provider !== provider || ident.providerUid !== providerUid) {
      this.log("WARN", `v3 '${provider}' ident upgraded under another key: ignored`);
      return undefined;
    }
    return ident;
  }

  /**
   * MFA methods enabled for a user (implemented by sub-project 4)
   * @param user - user
   * @returns enabled methods, empty when MFA is off
   */
  protected mfaMethods(user: User): string[] {
    const mfa = (user as any)?.mfa;
    return mfa?.isEnabled?.() ? mfa.methods() : [];
  }

  /**
   * Create and save a user for an identity
   * @param identity - resolved identity
   * @param data - extra profile data
   * @param ctx - request context (complete() runs as system, so it passes the real one)
   * @returns the user
   */
  async registerUser(identity: ResolvedIdentity, data: any = {}, ctx: any = useContext<any>()): Promise<User> {
    const user: User = await this.getUserModel().create(
      {
        ...data,
        email: identity.email,
        displayName: data.displayName ?? identity.profile?.name,
        locale: ctx?.getLocale?.()
      } as any,
      false
    );
    await this.emit("Authentication.Register", {
      context: ctx,
      user,
      data,
      identId: `${identity.providerUid}:${identity.provider}`,
      identity
    } as any);
    await user.save();
    this.metrics?.registration?.inc({ provider: identity.provider });
    return user;
  }

  /**
   * Complete a login for an identity proven by a provider
   * @param identity - resolved identity
   * @param options - complete options
   * @param options.newUser - identity.user was just created by the provider: its first ident is not a "link"
   * @returns the result
   * @throws IdentLinkedElsewhere when the ident belongs to another user than the logged one
   * @throws AccountExists when the email matches an account the linking policy does not allow
   * @throws RegistrationDisabled when a new user is needed but registration is off
   */
  async complete(identity: ResolvedIdentity, options: { newUser?: boolean } = {}): Promise<AuthResult> {
    identity = this.applyPolicy(identity);
    const ctx = useContext<any>();
    return runAsSystem(() => this.completeAs(identity, ctx, false, !!options.newUser));
  }

  /**
   * Apply the email policy of the identity provider (complete() does it too, idempotently)
   * Lets a provider refuse an identity before creating anything
   * @param identity - resolved identity
   * @returns the identity to use
   * @throws EmailDomainNotAllowed when the policy refuses it
   */
  applyPolicy(identity: ResolvedIdentity): ResolvedIdentity {
    return applyEmailPolicy(identity, this.emailPolicyFor(identity.provider));
  }

  /**
   * Body of {@link complete}, running as system with the request context passed explicitly
   * @param identity - resolved identity
   * @param ctx - request context
   * @param retried - already retried after a concurrent creation
   * @param newUser - identity.user was just created by the provider: its first ident is not a "link"
   * @returns the result
   */
  protected async completeAs(
    identity: ResolvedIdentity,
    ctx: any,
    retried: boolean,
    newUser: boolean = false
  ): Promise<AuthResult> {
    const currentUserId: string | undefined = ctx.getSession()?.isLogged() ? ctx.getCurrentUserId() : undefined;
    let ident = await this.findIdent(identity.provider, identity.providerUid);
    if (ident?.getUser()) {
      if (currentUserId && ident.getUser().toString() !== currentUserId) {
        throw new IdentLinkedElsewhere();
      }
      // A provider handing another user than the owner (a registration that lost a race) must not become the owner
      if (identity.user && identity.user.getUUID() !== ident.getUser().toString()) {
        throw new AccountExists();
      }
      return this.establish(ident.getUser().toString(), ident, identity, ctx);
    }
    // An existing ident without owner is adopted by the resolved, current or newly registered user
    const adopting = !!ident;
    let user: User | undefined = identity.user;
    let userId: string | undefined = currentUserId ?? user?.getUUID();
    const email = identity.email ? Ident.normalizeEmail(identity.email) : undefined;
    const emailIdent = email ? await this.findIdent("email", email) : undefined;
    let linked = !!userId && !(newUser && !currentUserId);
    let registered: User | undefined;
    const policy = this.parameters.linking;
    // never/verified: only a verified email ident is an owner, an unverified one is treated as absent
    const owner =
      emailIdent?.getUser() && (policy === "always" || emailIdent.isVerified()) ? emailIdent.getUser() : undefined;
    if (!userId && owner) {
      if (policy === "never" || (policy === "verified" && !identity.emailVerified)) {
        throw new AccountExists();
      }
      userId = owner.toString();
      linked = true;
    }
    if (!userId) {
      if (!this.parameters.registration) {
        throw new RegistrationDisabled();
      }
      // Narrow the window of a phantom Register event when a concurrent login just created the ident
      if (!adopting && (await this.findIdent(identity.provider, identity.providerUid))) {
        return this.completeAs(identity, ctx, retried, newUser);
      }
      user = registered = await this.registerUser(identity, {}, ctx);
      userId = user.getUUID();
    }
    if (adopting) {
      ident.setUser(userId);
      // Verification is only kept when this identity proves it
      ident.verifiedAt = identity.emailVerified ? (ident.verifiedAt ?? new Date()) : undefined;
      await ident.save();
    } else {
      ident = new (this.getIdentModel())({
        ...Ident.key(identity.providerUid, identity.provider),
        email,
        __profile: identity.profile,
        __tokens: identity.tokens,
        verifiedAt: identity.emailVerified ? new Date() : undefined
      } as any);
      ident.setUser(userId);
      try {
        await ident.getRepository().create(ident);
      } catch (err) {
        if (!retried && /Already exists/.test(`${err?.message}`)) {
          // Lost a concurrent first login: drop the user created for nothing, the retry finds the winner's ident
          await registered?.delete();
          return this.completeAs(identity, ctx, true, newUser);
        }
        throw err;
      }
    }
    // Only an email asserted as verified by the provider may claim the email ident
    if (email && !emailIdent && identity.emailVerified && identity.provider !== "email") {
      const extra = new (this.getIdentModel())({
        ...Ident.key(email, "email"),
        email,
        verifiedAt: new Date()
      } as any);
      extra.setUser(userId);
      await extra
        .getRepository()
        .create(extra)
        .catch(err => {
          if (!/Already exists/.test(`${err?.message}`)) throw err;
        });
    }
    if (linked) {
      await this.emit("Authentication.Linked", {
        context: ctx,
        user: user ?? (await this.loadUser(userId)),
        ident
      } as any);
    }
    return this.establish(user ?? userId, ident, identity, ctx);
  }

  /**
   * @param userId - uuid
   * @returns the user
   */
  protected loadUser(userId: string): Promise<User> {
    return this.getUserModel().ref(userId).get();
  }

  /**
   * Write the session, issue tokens, emit Login
   * @param user - user or uuid
   * @param ident - ident used
   * @param identity - resolved identity
   * @param ctx - request context (complete() runs as system, so it passes the real one)
   * @returns the result
   */
  protected async establish(
    user: User | string,
    ident: Ident,
    identity: ResolvedIdentity,
    ctx: any = useContext<any>()
  ): Promise<AuthResult> {
    const userObj: User = typeof user === "string" ? await this.loadUser(user) : user;
    const userId = userObj.getUUID();
    const session = ctx.getSession();
    const methods = this.mfaMethods(userObj);
    // MFA is satisfied by one of the user's enabled methods on top of a primary factor
    const amr = identity.amr ?? [];
    const secondFactor = amr.some(m => methods.includes(m)) && amr.some(m => PRIMARY_FACTORS.includes(m));
    const mfa = methods.length ? (secondFactor ? "verified" : "pending") : "none";
    session.login(userId, ident.getUUID(), { provider: identity.provider, amr: identity.amr, mfa });
    // A later password change of the user ends this session (checked by the session manager on load)
    session.authAt = Date.now();
    if (mfa === "pending") {
      return { status: "mfa_required", methods };
    }
    await ident.ref().patch({
      lastUsedAt: new Date(),
      ...(identity.profile ? { __profile: identity.profile } : {}),
      ...(identity.tokens ? { __tokens: identity.tokens } : {})
    } as any);
    const tokens = await useService("TokenService").issue(session);
    await this.emit("Authentication.Login", {
      context: ctx,
      userId,
      user: userObj,
      identId: ident.getUUID(),
      ident,
      provider: identity.provider,
      identity
    } as any);
    this.metrics?.login?.inc({ provider: identity.provider });
    return { status: "ok", user: userObj.toPublicEntry(), ...tokens };
  }

  /**
   * @returns the logged user id
   * @throws WebdaError.Unauthorized when no fully logged session exists
   */
  protected requireUser(): string {
    const ctx = useContext<any>();
    if (!ctx.getSession()?.isLogged()) {
      throw new WebdaError.Unauthorized("Login required");
    }
    return ctx.getCurrentUserId();
  }

  /**
   * Logout and revoke the current refresh family; also abandons a pending MFA session
   */
  @Operation({ id: "Auth.Logout", rest: { method: "post", path: "auth/logout" } })
  async logout(): Promise<void> {
    const ctx = useContext<any>();
    const session = ctx.getSession();
    if (!session?.isLogged() && !session?.isPending()) {
      throw new WebdaError.Unauthorized("Login required");
    }
    const family = session.refreshFamily;
    if (family) {
      await runAsSystem(() => useService("TokenService").revokeFamily(family));
    }
    await this.emit("Authentication.Logout", { context: ctx } as any);
    this.metrics?.logout?.inc();
    ctx.newSession();
  }

  /**
   * Exchange a refresh token
   * @param refreshToken - refresh token
   * @returns new tokens
   */
  @Operation({ id: "Auth.Refresh", rest: { method: "post", path: "auth/refresh" } })
  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const { session, ...tokens } = await runAsSystem(() => useService("TokenService").refresh(refreshToken));
    return tokens;
  }

  /**
   * List the current user's idents; with `compatibility.v3`, listing upgrades the user's v3 ident records first
   * @returns idents of the current user
   */
  @Operation({ id: "Auth.Idents", rest: { method: "get", path: "auth/idents" } })
  async idents(): Promise<
    { provider: string; providerUid: string; email?: string; verifiedAt?: Date; lastUsedAt?: Date }[]
  > {
    const userId = this.requireUser();
    return (await this.listIdents(userId)).map(i => ({
      provider: i.provider,
      providerUid: i.providerUid,
      email: i.email,
      verifiedAt: i.verifiedAt,
      lastUsedAt: i.lastUsedAt
    }));
  }

  /**
   * @param userId - user
   * @returns all idents owned by the user
   */
  protected async listIdents(userId: string): Promise<Ident[]> {
    return runAsSystem(async () => {
      const IdentModel = this.getIdentModel();
      const idents = (await IdentModel.query("_user = ?", [userId])).results;
      if (!idents.some(i => i.getLegacyUID())) {
        return idents;
      }
      // v3 records are upgraded before use, or ignored without v3 compatibility
      const result = new Map<string, Ident>();
      for (const ident of idents) {
        if (!ident.getLegacyUID()) {
          result.set(ident.getUUID(), ident);
        } else if (this.parameters.compatibility?.v3) {
          if (!isLegacyIdent(ident, IdentModel)) continue;
          let upgraded: Ident;
          try {
            upgraded = await upgradeIdent(ident, IdentModel);
          } catch (err) {
            if (!(err instanceof IdentConflict)) throw err;
            // Kept for the operator (`webda auth migrate` reports it): the account stays usable meanwhile
            this.log("WARN", `v3 ident ${ident.getLegacyUID()} conflicts with another user's ident: skipped`);
            continue;
          }
          // A crash-left duplicate resolves to the record already listed
          if (!result.has(upgraded.getUUID())) result.set(upgraded.getUUID(), upgraded);
        }
      }
      return [...result.values()];
    });
  }

  /**
   * Remove one of the current user's idents
   * @param provider - provider
   * @param providerUid - uid
   * @throws LastLoginMethod when no other login method would remain
   */
  @Operation({ id: "Auth.Unlink", rest: { method: "post", path: "auth/idents/unlink" } })
  async unlink(provider: string, providerUid: string): Promise<void> {
    const userId = this.requireUser();
    const idents = await this.listIdents(userId);
    const target = idents.find(i => i.provider === provider && i.providerUid === providerUid);
    if (!target) {
      throw new WebdaError.NotFound("Ident not found");
    }
    const remaining = idents.filter(i => i !== target);
    const user: User = await this.loadUser(userId);
    const usesPassword = (user as any).password?.hasPassword?.();
    const lastEmail = provider === "email" && !remaining.some(i => i.provider === "email");
    if (remaining.length === 0 || (usesPassword && lastEmail)) {
      throw new LastLoginMethod();
    }
    await runAsSystem(() => target.ref().delete());
    await this.emit("Authentication.Unlinked", { context: useContext(), user, ident: target } as any);
  }

  /**
   * Migrate v3 authentication data to the v4 layout
   *
   * Idents: every v3 record (`"<providerUid>_<provider>"` key) is upgraded to its `"<providerUid>:<provider>"`
   * record (emails normalised) then deleted; with a custom ident model, the v3 rows typed as the core
   * `Webda/Ident` are found through its repository too. Upgrading shifts position-based paging, so passes run
   * until one upgrades nothing. Users: a user whose stored record still has the v3 `__password` is saved again in
   * the v4 `password` shape. Idempotent: a second run migrates nothing. Failures are reported by key and logged,
   * the migration goes on.
   *
   * Operator notes:
   * - A v3 ident whose upgraded key another user already holds (e.g. two v3 email keys differing only by case) is
   *   reported in `idents.failed` (IDENT_CONFLICT) and kept: decide which user keeps the email, then delete or
   *   rename the other v3 row and run the command again.
   * - A malformed ident key in the store stops the scan: remove that row manually.
   * - Re-running is always safe: migrated records are not touched again.
   * @param dryRun - only count, write nothing
   * @param batch - page size of the scans
   * @returns the report
   */
  @Command("auth migrate", {
    description: "Migrate v3 authentication data (idents, users) to v4",
    phase: "initialized"
  })
  async migrate(
    /** @description Only count the records to migrate, write nothing */
    dryRun: boolean = false,
    /** @description Page size of the store scans */
    batch: number = 100
  ): Promise<MigrationReport> {
    const pageSize = Math.max(1, Math.floor(Number(batch)) || 100);
    const report: MigrationReport = {
      dryRun: !!dryRun,
      idents: { migrated: 0, skipped: 0, failed: [] },
      users: { migrated: 0, skipped: 0, failed: [] }
    };
    await runAsSystem(async () => {
      await this.migrateIdents(report, pageSize);
      await this.migrateUsers(report, pageSize);
    });
    this.log("INFO", "Authentication migration", report);
    return report;
  }

  /**
   * Enumerate the v3 ident rows: through the ident model, and through the core `Ident` repository when the
   * ident model is a subclass (its queries only see rows typed as itself or its subclasses)
   * @param pageSize - page size
   * @returns the v3 keys found, each once per pass
   */
  protected async *legacyIdentKeys(pageSize: number): AsyncGenerator<string> {
    const IdentModel = this.getIdentModel();
    const models: ModelClass<Ident>[] = [IdentModel];
    if ((IdentModel as any) !== Ident) {
      try {
        if (Ident.getRepository()) models.push(Ident as any);
      } catch {
        // The core Ident model has no repository: no ancestor-typed rows to look for
      }
    }
    const seen = new Set<string>();
    for (const model of models) {
      const scan = legacyIdents(model, `LIMIT ${pageSize}`);
      while (true) {
        let next: IteratorResult<Ident>;
        try {
          next = await scan.next();
        } catch (err) {
          const identifier = (model as any).Metadata?.Identifier ?? model.name;
          const error: any = new Error(
            `Cannot scan the ${identifier} records of the store: ${err?.message ?? err}. ` +
              "A malformed ident key must be removed from the store manually; the migration is safe to re-run."
          );
          error.cause = err;
          throw error;
        }
        if (next.done) break;
        const uid = next.value.getLegacyUID();
        if (seen.has(uid)) continue;
        seen.add(uid);
        yield uid;
      }
    }
  }

  /**
   * Upgrade the v3 idents
   * @param report - report to fill
   * @param pageSize - page size
   */
  protected async migrateIdents(report: MigrationReport, pageSize: number): Promise<void> {
    const IdentModel = this.getIdentModel();
    const status = new Map<string, "migrated" | "skipped" | "failed">();
    let pass = 0;
    let upgraded: number;
    do {
      upgraded = 0;
      for await (const uid of this.legacyIdentKeys(pageSize)) {
        if (status.get(uid) === "migrated" || status.get(uid) === "skipped") continue;
        if (!splitLegacyKey(uid)) {
          status.set(uid, "skipped");
          continue;
        }
        // Load through the ident model: a row found via the core repository hydrates as the ident model, a row
        // its store cannot reach or refuses (another model's row) is not this application's v3 ident
        const ref = IdentModel.ref(uid as any);
        const row = await ref
          .get()
          .catch(err => this.log("WARN", `v3 ident ${uid} not readable through the ident model: ${err?.message}`));
        if (!isLegacyIdent(row, IdentModel)) {
          status.set(uid, "skipped");
          continue;
        }
        try {
          await upgradeIdent(row, IdentModel, { dryRun: report.dryRun });
          status.set(uid, "migrated");
          upgraded++;
        } catch (err) {
          status.set(uid, "failed");
          this.log("WARN", `v3 ident ${uid} not migrated: ${err?.message ?? err}`);
        }
      }
      pass++;
      // A dry run changes nothing: one pass sees every record
    } while (!report.dryRun && upgraded > 0 && pass < MIGRATION_MAX_PASSES);
    if (upgraded > 0 && pass >= MIGRATION_MAX_PASSES) {
      report.incomplete = true;
      this.log("WARN", `Ident migration stopped after ${pass} passes: run it again`);
    }
    for (const [uid, state] of status) {
      if (state === "failed") report.idents.failed.push(uid);
      else report.idents[state]++;
    }
  }

  /**
   * Save again the users whose stored record still has the v3 `__password`
   * @param report - report to fill
   * @param pageSize - page size
   */
  protected async migrateUsers(report: MigrationReport, pageSize: number): Promise<void> {
    for await (const user of this.getUserModel().iterate(`LIMIT ${pageSize}`)) {
      if (!(user as any)[V3_PASSWORD_MAPPED]) continue;
      try {
        if (!report.dryRun) {
          await user.save();
        }
        report.users.migrated++;
      } catch (err) {
        report.users.failed.push(user.getUUID());
        this.log("WARN", `v3 user ${user.getUUID()} not migrated: ${err?.message ?? err}`);
      }
    }
  }
}
