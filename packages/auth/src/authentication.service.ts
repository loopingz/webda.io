import {
  type AuthenticationEvents,
  type AuthResult,
  type Ident,
  type IAuthenticationService,
  Operation,
  type ProviderInfo,
  registerUserResolver,
  Service,
  ServiceParameters,
  useContext,
  useCore,
  useModel,
  type User,
  WebdaError
} from "@webda/core";
import type { ModelClass } from "@webda/models";
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

  /**
   * Not available yet
   * @returns never
   */
  async complete(): Promise<AuthResult> {
    throw new WebdaError.NotImplemented("complete");
  }

  /**
   * Not available yet
   * @returns never
   */
  async logout(): Promise<void> {
    throw new WebdaError.NotImplemented("logout");
  }
}
