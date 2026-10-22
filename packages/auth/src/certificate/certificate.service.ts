import {
  type AuthResult,
  type CertificateResolution,
  type CertificateResolver,
  type ClientCertificate,
  type Context,
  Ident,
  Operation,
  type OperationContext,
  type ProviderInfo,
  type ResolvedIdentity,
  Service,
  ServiceParameters,
  Session,
  WebdaError,
  registerCertificateResolver,
  runAsSystem,
  runWithContext,
  useCertificateResolver,
  useContext
} from "@webda/core";
import { type AuthProvider, useAuthentication } from "../provider.js";

/** Certificate field identifying its owner */
export type CertificateIdentityField = "fingerprint256" | "subject.CN" | "san.email" | "san.uri";

/** CertificateProvider parameters */
export class CertificateProviderParameters extends ServiceParameters {
  /**
   * `factor` only adds `mtls` to a session already authenticated as the certificate's linked user.
   * @default "login"
   */
  mode: "login" | "factor";
  /**
   * Certificate field used as ident uid: the SHA-256 fingerprint pins one certificate, the other fields survive a
   * certificate renewal
   * @default "fingerprint256"
   */
  identityField: CertificateIdentityField;
  /**
   * Only certificates whose issuer common name or distinguished name ("O=Webda, CN=ca") is listed are accepted,
   * undefined accepts every issuer trusted by the TLS layer
   */
  allowedIssuers?: string[];
  /**
   * Only certificates whose subject distinguished name ("O=Webda, CN=alice") matches one of these regular
   * expressions are accepted, undefined accepts every subject
   */
  allowedSubjects?: string[];
  /**
   * Register a user on the first request of an unknown certificate; otherwise the certificate has to be linked to
   * a logged user with `Auth.Certificate.Link`
   * @default false
   */
  autoRegister: boolean;
  /**
   * Roles of the certificate sessions by subject attribute: `{ "OU=admins": ["admin"] }` gives the role admin to
   * certificates having an OU admins
   */
  roles?: Record<string, string[]>;
  /**
   * How long a certificate resolved to a user is remembered, in milliseconds (0 disables the cache)
   * @default 60000
   */
  cacheTtl: number;

  /**
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.mode ??= "login";
    this.identityField ??= "fingerprint256";
    this.autoRegister ??= false;
    this.cacheTtl ??= 60000;
    return this;
  }
}

/** Maximum number of certificates kept in the resolution cache */
const CACHE_MAX = 10000;

/**
 * Login with a TLS client certificate (mTLS)
 *
 * The certificate is verified by the HttpServer (`clientCa`) or by a trusted reverse proxy (`clientCertHeader`):
 * this provider maps verified certificates to users. In login mode, each request carrying the certificate of a
 * known user gets a stateless session with the provider "certificate" and the authentication method "mtls". In
 * factor mode, it adds "mtls" only to an existing session for the same user on that request.
 *
 * Exposes the operation `Auth.Certificate.Link` (`POST auth/certificate/link`) linking the presented certificate to
 * the logged user.
 *
 * @WebdaModda CertificateProvider
 */
export class CertificateProvider<T extends CertificateProviderParameters = CertificateProviderParameters>
  extends Service<T>
  implements AuthProvider, CertificateResolver
{
  static Parameters = CertificateProviderParameters;

  readonly providerName: string = "certificate";

  /** @returns how certificate authentication contributes to a session */
  get mode(): "login" | "factor" {
    return this.parameters.mode;
  }

  /** Certificates resolved to a user, by ident uid */
  protected cache = new Map<string, { value: CertificateResolution; expires: number }>();
  /** Listeners to remove on stop */
  protected unsubscribers: (() => void)[] = [];

  /** @override */
  resolve(): this {
    super.resolve();
    registerCertificateResolver(this);
    return this;
  }

  /** @override */
  async init(): Promise<this> {
    await super.init();
    const auth = useAuthentication();
    if (auth) {
      // An unlinked certificate stops authenticating at once on this instance (after cacheTtl on the others)
      const onUnlinked = (evt: any) => {
        if (evt?.ident?.provider === this.providerName) {
          this.cache.delete(evt.ident.providerUid);
        }
      };
      auth.on("Authentication.Unlinked" as any, onUnlinked);
      this.unsubscribers.push(() => auth.off("Authentication.Unlinked" as any, onUnlinked));
    }
    return this;
  }

  /** @override */
  async stop(): Promise<void> {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
    if (useCertificateResolver() === this) {
      registerCertificateResolver(undefined);
    }
    await super.stop();
  }

  /**
   * @returns what clients see in Auth.Providers
   */
  getPublicInfo(): ProviderInfo {
    return { name: this.providerName, type: "certificate" };
  }

  /**
   * Whether a certificate is accepted: valid now, from an allowed issuer, with an allowed subject
   * @param cert - client certificate
   * @returns true when accepted
   */
  isAccepted(cert: ClientCertificate): boolean {
    const now = Date.now();
    if (cert.validFrom?.getTime() > now || cert.validTo?.getTime() < now) {
      return false;
    }
    const { allowedIssuers, allowedSubjects } = this.parameters;
    if (allowedIssuers) {
      const names = [cert.issuerDN, ...values(cert.issuer.CN)];
      if (!allowedIssuers.some(issuer => names.includes(issuer))) {
        return false;
      }
    }
    if (allowedSubjects && !allowedSubjects.some(pattern => new RegExp(pattern).test(cert.subjectDN))) {
      return false;
    }
    return true;
  }

  /**
   * Identity asserted by a certificate
   * @param cert - client certificate
   * @returns the identity, undefined when the certificate lacks the identity field
   */
  getIdentity(cert: ClientCertificate): ResolvedIdentity | undefined {
    const email = sanValues(cert, "email")[0];
    let providerUid: string | undefined;
    switch (this.parameters.identityField) {
      case "subject.CN":
        providerUid = values(cert.subject.CN)[0];
        break;
      case "san.email":
        providerUid = email ? Ident.normalizeEmail(email) : undefined;
        break;
      case "san.uri":
        providerUid = sanValues(cert, "URI")[0];
        break;
      default:
        providerUid = cert.fingerprint256?.replace(/:/g, "").toLowerCase();
    }
    if (!providerUid) {
      return undefined;
    }
    return {
      provider: this.providerName,
      // Ident uids cannot contain ":" (URIs do)
      providerUid: providerUid.replace(/%/g, "%25").replace(/:/g, "%3A"),
      email,
      emailVerified: false,
      amr: ["mtls"],
      profile: {
        subject: cert.subject,
        issuer: cert.issuer,
        serialNumber: cert.serialNumber,
        fingerprint256: cert.fingerprint256
      }
    };
  }

  /**
   * Roles given by the `roles` parameter to a certificate
   * @param cert - client certificate
   * @returns the roles, undefined when none
   */
  getRoles(cert: ClientCertificate): string[] | undefined {
    const roles = new Set<string>();
    for (const [match, granted] of Object.entries(this.parameters.roles ?? {})) {
      const idx = match.indexOf("=");
      if (idx < 0) continue;
      if (values(cert.subject[match.substring(0, idx).trim()]).includes(match.substring(idx + 1).trim())) {
        granted.forEach(role => roles.add(role));
      }
    }
    return roles.size ? [...roles] : undefined;
  }

  /**
   * Resolve a verified certificate into a user, registering one when `autoRegister` is set
   * @param cert - verified client certificate
   * @param context - context of the request, its session is not loaded yet
   * @returns the user, undefined when the certificate is refused or unknown
   */
  async resolveCertificate(cert: ClientCertificate, context: Context): Promise<CertificateResolution | undefined> {
    if (!cert?.verified || !this.isAccepted(cert)) {
      return undefined;
    }
    const identity = this.getIdentity(cert);
    if (!identity) {
      return undefined;
    }
    const found = (await this.findUser(identity.providerUid)) ?? (await this.register(identity, context));
    return found ? { ...found, roles: this.getRoles(cert) } : undefined;
  }

  /**
   * User owning a certificate ident, cached for `cacheTtl`
   * @param providerUid - ident uid
   * @returns the user and ident ids, undefined when the certificate is not linked
   */
  protected async findUser(providerUid: string): Promise<CertificateResolution | undefined> {
    const cached = this.cache.get(providerUid);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }
    this.cache.delete(providerUid);
    const ident: Ident | undefined = await runAsSystem(async () => {
      const ref = useAuthentication().getIdentModel().ref(Ident.key(providerUid, this.providerName));
      return (await ref.exists()) ? ref.get() : undefined;
    });
    const userId = ident?.getUser()?.toString();
    if (!ident || !userId) {
      return undefined;
    }
    const value = { userId, identId: ident.getUUID() };
    this.remember(providerUid, value);
    return value;
  }

  /**
   * @param providerUid - ident uid
   * @param value - resolution to cache
   */
  protected remember(providerUid: string, value: CertificateResolution): void {
    if (!this.parameters.cacheTtl) {
      return;
    }
    if (this.cache.size >= CACHE_MAX) {
      this.cache.clear();
    }
    this.cache.set(providerUid, { value, expires: Date.now() + this.parameters.cacheTtl });
  }

  /**
   * Register the user of an unknown certificate through `Authentication.complete()` (linking and registration
   * policies apply), when `autoRegister` is set
   * @param identity - identity of the certificate
   * @param context - context of the request
   * @returns the new user and ident ids, undefined when not registered
   */
  protected async register(identity: ResolvedIdentity, context: Context): Promise<CertificateResolution | undefined> {
    if (this.mode === "factor" || !this.parameters.autoRegister) {
      return undefined;
    }
    // The request session is not loaded yet: complete() logs a scratch session in
    const ctx = context as OperationContext;
    const previous = ctx.getSession();
    const session = new Session();
    ctx.setSession(session);
    try {
      const result = await runWithContext(ctx, () => useAuthentication().complete(identity));
      if (result.status !== "ok" || !session.userId || !session.identUsed) {
        return undefined;
      }
      const value = { userId: session.userId, identId: session.identUsed };
      this.remember(identity.providerUid, value);
      return value;
    } catch (err) {
      this.log("WARN", `Cannot register the client certificate ${identity.providerUid}`, (err as Error)?.message);
      return undefined;
    } finally {
      ctx.setSession(previous);
    }
  }

  /**
   * Link the client certificate of the request to the logged user
   * @returns the auth result
   * @throws WebdaError.Unauthorized when no user is logged
   * @throws WebdaError.Forbidden when the request has no verified, accepted certificate with the identity field
   */
  @Operation({ id: "Auth.Certificate.Link", rest: { method: "post", path: "auth/certificate/link" } })
  async link(): Promise<AuthResult | { status: "linked" }> {
    const ctx = useContext<any>();
    if (!ctx.getSession()?.isLogged()) {
      throw new WebdaError.Unauthorized("Login required");
    }
    const cert: ClientCertificate | undefined = ctx.getHttpContext?.()?.getClientCertificate?.();
    if (!cert?.verified || !this.isAccepted(cert)) {
      throw new WebdaError.Forbidden("A verified client certificate is required");
    }
    const identity = this.getIdentity(cert);
    if (!identity) {
      throw new WebdaError.Forbidden(`The client certificate has no ${this.parameters.identityField}`);
    }
    if (this.mode === "factor") {
      const result = await useAuthentication().linkIdentity(identity);
      this.cache.delete(identity.providerUid);
      return result;
    }
    return useAuthentication().complete(identity);
  }
}

/**
 * @param value - an attribute value
 * @returns the values as a list
 */
function values(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * @param cert - client certificate
 * @param type - subject alternative name type ("email", "URI", "DNS")
 * @returns the names of that type
 */
function sanValues(cert: ClientCertificate, type: string): string[] {
  const prefix = `${type.toLowerCase()}:`;
  return (cert.san ?? [])
    .filter(name => name.toLowerCase().startsWith(prefix))
    .map(name => name.substring(prefix.length));
}
