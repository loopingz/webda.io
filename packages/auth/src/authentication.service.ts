import {
  type AuthenticationEvents,
  type AuthResult,
  Counter,
  Ident,
  type IAuthenticationService,
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
  WebdaError
} from "@webda/core";
import type { ModelClass } from "@webda/models";
import { AccountExists, IdentLinkedElsewhere, RegistrationDisabled } from "./errors.js";
import { type AuthProvider, isAuthProvider } from "./provider.js";

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
   * @param provider - provider
   * @param providerUid - uid
   * @returns the ident when it exists
   */
  protected async findIdent(provider: string, providerUid: string): Promise<Ident | undefined> {
    const ref = this.getIdentModel().ref(Ident.key(providerUid, provider));
    return (await ref.exists()) ? await ref.get() : undefined;
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
   * @returns the result
   * @throws IdentLinkedElsewhere when the ident belongs to another user than the logged one
   * @throws AccountExists when the email matches an account the linking policy does not allow
   * @throws RegistrationDisabled when a new user is needed but registration is off
   */
  async complete(identity: ResolvedIdentity): Promise<AuthResult> {
    const ctx = useContext<any>();
    return runAsSystem(() => this.completeAs(identity, ctx, false));
  }

  /**
   * Body of {@link complete}, running as system with the request context passed explicitly
   * @param identity - resolved identity
   * @param ctx - request context
   * @param retried - already retried after a concurrent creation
   * @returns the result
   */
  protected async completeAs(identity: ResolvedIdentity, ctx: any, retried: boolean): Promise<AuthResult> {
    const currentUserId: string | undefined = ctx.getSession()?.isLogged() ? ctx.getCurrentUserId() : undefined;
    let ident = await this.findIdent(identity.provider, identity.providerUid);
    if (ident?.getUser()) {
      if (currentUserId && ident.getUser().toString() !== currentUserId) {
        throw new IdentLinkedElsewhere();
      }
      return this.establish(ident.getUser().toString(), ident, identity, ctx);
    }
    // An existing ident without owner is adopted by the resolved, current or newly registered user
    const adopting = !!ident;
    let user: User | undefined = identity.user;
    let userId: string | undefined = currentUserId ?? user?.getUUID();
    const email = identity.email ? Ident.normalizeEmail(identity.email) : undefined;
    const emailIdent = email ? await this.findIdent("email", email) : undefined;
    let linked = !!userId;
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
        return this.completeAs(identity, ctx, retried);
      }
      user = registered = await this.registerUser(identity, {}, ctx);
      userId = user.getUUID();
    }
    if (adopting) {
      ident.setUser(userId);
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
          return this.completeAs(identity, ctx, true);
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
    // Any amr other than pwd/oauth is a second factor
    const secondFactor = identity.amr.some(m => m !== "pwd" && m !== "oauth");
    const mfa = methods.length ? (secondFactor ? "verified" : "pending") : "none";
    session.login(userId, ident.getUUID(), { provider: identity.provider, amr: identity.amr, mfa });
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
   * Not available yet
   * @returns never
   */
  async logout(): Promise<void> {
    throw new WebdaError.NotImplemented("logout");
  }
}
