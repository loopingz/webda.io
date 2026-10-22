import { type CryptoService, SecretString } from "../services/cryptoservice.service.js";
import { JWTOptions } from "../services/icryptoservice.js";
import { Inject, Service } from "../services/service.js";

import { CookieOptions, SecureCookie } from "./cookie.js";
import { Context, isWebContext } from "../contexts/icontext.js";
import { getUuid } from "@webda/utils";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Session } from "./session.js";
import { useCertificateResolver, useService, useUserResolver } from "../core/hooks.js";
import { runAsSystem } from "../contexts/execution.js";
import { type ModelClass, type Repository, UuidModel } from "@webda/models";

/**
 * Resolve a Bearer token that is not a {@link TokenService} access token (OIDC workload identity, ...)
 */
export interface BearerTokenResolver {
  /**
   * @param token - the Bearer token
   * @param context - the context
   * @returns a logged stateless session, or undefined when the token is not for this resolver
   */
  resolveBearer(token: string, context: Context): Promise<Session | undefined>;
}

/**
 * Registered Bearer resolvers, tried in order
 */
const bearerResolvers: BearerTokenResolver[] = [];

/**
 * Register a Bearer resolver, tried after the TokenService access tokens
 *
 * Registering the same resolver twice is a no-op
 * @param resolver - the resolver
 * @returns a function that unregisters the resolver
 */
export function registerBearerResolver(resolver: BearerTokenResolver): () => void {
  if (!bearerResolvers.includes(resolver)) {
    bearerResolvers.push(resolver);
  }
  return () => unregisterBearerResolver(resolver);
}

/**
 * Unregister a Bearer resolver
 * @param resolver - the resolver
 */
export function unregisterBearerResolver(resolver: BearerTokenResolver): void {
  const index = bearerResolvers.indexOf(resolver);
  if (index >= 0) {
    bearerResolvers.splice(index, 1);
  }
}

/**
 * @returns the registered Bearer resolvers
 */
export function useBearerResolvers(): readonly BearerTokenResolver[] {
  return bearerResolvers;
}

/**
 * Manage load and save of sessions
 */
export abstract class SessionManager<T extends ServiceParameters = ServiceParameters> extends Service<T> {
  /**
   * Load a session based on context
   * @param context
   */
  abstract load(context: Context): Promise<Session>;
  /**
   * Save the session within the context
   * @param context
   * @param session
   */
  abstract save(context: Context, session: Session): Promise<void>;

  /**
   * Build a stateless session from an access token (any transport)
   *
   * TokenService access tokens first, then each registered {@link BearerTokenResolver}: the first session wins
   * @param context - the context
   * @param token - access token
   * @returns the session, anonymous when the token is invalid
   */
  async loadFromToken(context: Context, token: string): Promise<Session> {
    const session = new Session();
    session.stateless = true;
    const claims = await useService("TokenService").verifyAccess(token);
    if (!claims && token) {
      for (const resolver of bearerResolvers) {
        let resolved: Session | undefined;
        try {
          resolved = await resolver.resolveBearer(token, context);
        } catch (err) {
          this.log("DEBUG", "Bearer resolver failed", err?.message);
        }
        if (resolved) {
          resolved.stateless = true;
          return resolved;
        }
      }
    }
    if (claims) {
      session.login(claims.sub, claims.ident, {
        provider: claims.provider,
        amr: claims.amr,
        mfa: claims.mfa,
        mfaAt: claims.mfaAt,
        mfaVerifications: claims.mfaVerifications
      });
      session.roles = claims.roles;
      session.refreshFamily = claims.fam;
      session.authAt = claims.authAt;
      if (typeof claims.scope === "string") {
        session.scopes = claims.scope.split(" ").filter(Boolean);
      }
      if (claims.client_id) {
        session.clientId = claims.client_id;
      }
      if (await this.isOutdated(session)) {
        session.logout();
      }
    }
    return session;
  }

  /**
   * Build a stateless session from the verified client certificate of the request
   *
   * Needs a registered certificate resolver (see `registerCertificateResolver`), the session uses the provider
   * "certificate" and the authentication method "mtls"
   * @param context - the context
   * @returns the session, undefined when no verified certificate resolves to a user
   */
  async loadFromCertificate(context: Context): Promise<Session | undefined> {
    const resolver = useCertificateResolver();
    const cert = isWebContext(context) ? context.getHttpContext()?.getClientCertificate?.() : undefined;
    if (!resolver || resolver.mode === "factor" || !cert?.verified) {
      return undefined;
    }
    let resolution: Awaited<ReturnType<typeof resolver.resolveCertificate>>;
    try {
      resolution = await resolver.resolveCertificate(cert, context);
    } catch (err) {
      this.log("WARN", "Cannot resolve the client certificate, certificate ignored", err?.message);
      return undefined;
    }
    if (!resolution) {
      return undefined;
    }
    const session = new Session();
    session.stateless = true;
    session.login(resolution.userId, resolution.identId, { provider: "certificate", amr: ["mtls"] });
    session.roles = resolution.roles;
    return session;
  }

  /**
   * Add the certificate as a request-scoped factor only when it belongs to the session's user.
   * @param context - request context
   * @param session - session authenticated by a cookie or Bearer token
   * @returns the session with the additional factor when it matches
   */
  async addCertificateFactor(context: Context, session: Session): Promise<Session> {
    const resolver = useCertificateResolver();
    const cert = isWebContext(context) ? context.getHttpContext()?.getClientCertificate?.() : undefined;
    if (!resolver || !cert?.verified || !session.userId || session.isApplication()) return session;
    try {
      const resolution = await resolver.resolveCertificate(cert, context);
      if (resolution?.userId === session.userId) {
        session.addTransientAmr("mtls");
      }
    } catch (err) {
      this.log("WARN", "Cannot resolve the client certificate, certificate ignored", err?.message);
    }
    return session;
  }

  /**
   * Whether the user of an authenticated session changed their password after the session was authenticated
   *
   * Costs one user read (through the registered user resolver) per load of a session carrying `authAt`. A failing
   * read counts as outdated: the session is then anonymous for that request.
   * @param session - loaded session
   * @returns true when the session must be treated as anonymous
   */
  protected async isOutdated(session: Session): Promise<boolean> {
    if (session.userId === undefined || typeof session.authAt !== "number") {
      return false;
    }
    try {
      const user: any = await runAsSystem(() => useUserResolver().resolve(session.userId));
      const changedAt = user?.password?.changedAt;
      return typeof changedAt === "number" && changedAt > session.authAt;
    } catch (err) {
      this.log("WARN", "Cannot check the session against the user password, session ignored", err?.message);
      return true;
    }
  }
}

/** Persistent session data stored in a model with a TTL */
export class SessionModel extends UuidModel {
  ttl: number;
  session: any;
  /** Create a new SessionModel
   * @param data - the session data
   */
  constructor(data: any) {
    super(data);
    this.ttl = data.ttl || 0;
    this.session = data.session || {};
  }
}

/** Parameters for the cookie-based session manager */
export class CookieSessionParameters extends ServiceParameters {
  /**
   * Options for issue JWT token
   *
   * `secretOrPublicKey` can be encrypted with `webda config encrypt`
   */
  jwt?: JWTOptions;
  /**
   * Cookie configuration for session
   */
  cookie?: CookieOptions;

  /**
   * Load parameters and initialize cookie options
   * @param params - the service parameters
   * @returns this for chaining
   */
  load(params: any = {}): this {
    super.load(params);
    this.cookie = new CookieOptions(this.cookie || {});
    return this;
  }
}

/**
 * SessionManager that store info in a cookie
 *
 * If SessionStore service exists, only uuid is in the cookie
 * the rest of data is stored within the session store
 *
 * @WebdaModda
 */
export class CookieSessionManager<
  T extends CookieSessionParameters = CookieSessionParameters
> extends SessionManager<T> {
  @Inject("CryptoService")
  cryptoService: CryptoService;

  sessionModel: Repository<ModelClass<SessionModel>>;

  /**
   * @override
   */
  async load(context: Context): Promise<Session> {
    if (!isWebContext(context)) {
      return new Session();
    }
    // A Bearer scheme is authoritative: an invalid token yields an anonymous session, never the cookie
    const authorization = context.getHttpContext().getHeader("authorization");
    if (typeof authorization === "string" && /^bearer(\s|$)/i.test(authorization)) {
      const session = await this.loadFromToken(context, authorization.substring(7).trim());
      return useCertificateResolver()?.mode === "factor" ? this.addCertificateFactor(context, session) : session;
    }
    // A verified client certificate of a known user comes next: an unknown one falls back to the cookie
    if (useCertificateResolver()?.mode !== "factor") {
      const certSession = await this.loadFromCertificate(context);
      if (certSession) return certSession;
    }
    const session = new Session();
    const cookie = await SecureCookie.load(
      this.parameters.cookie.name,
      session,
      context,
      SecretString.unwrap(this.parameters.jwt)
    );
    if (this.sessionModel) {
      if (cookie.sub) {
        Object.assign(session, (await this.sessionModel.get(cookie.sub))?.session);
        session.uuid = cookie.sub;
      }
      session.uuid ??= getUuid("base64");
    } else {
      Object.assign(session, cookie);
    }
    // Only bearer sessions carry a token scope: a browser session is never restricted
    delete session.scopes;
    delete session.clientId;
    // A password change ends the sessions authenticated before it
    if (await this.isOutdated(session)) {
      session.logout();
    }
    return useCertificateResolver()?.mode === "factor" ? this.addCertificateFactor(context, session) : session;
  }

  /**
   * @override
   */
  async save(context: Context, session: Session) {
    if (!isWebContext(context)) {
      return;
    }
    if (session.stateless) {
      return;
    }
    const storedSession = session.transientAmr?.length
      ? Object.assign(new Session(), session, { amr: session.getPersistentAmr() })
      : session;
    // If store is found session info are stored in db
    if (this.sessionModel) {
      if (await this.sessionModel.exists(session.uuid)) {
        await this.sessionModel.update({
          uuid: session.uuid,
          session: storedSession,
          ttl: Date.now() + this.parameters.cookie.maxAge * 1000
        });
      } else {
        await this.sessionModel.create({
          uuid: session.uuid,
          session: storedSession,
          ttl: Date.now() + this.parameters.cookie.maxAge * 1000
        });
      }
      SecureCookie.save(
        this.parameters.cookie.name,
        context,
        {},
        SecretString.unwrap({ ...this.parameters.jwt, subject: session.uuid.toString() }),
        this.parameters.cookie
      );
      return;
    }
    SecureCookie.save(
      this.parameters.cookie.name,
      context,
      storedSession,
      SecretString.unwrap(this.parameters.jwt),
      this.parameters.cookie
    );
  }
}
