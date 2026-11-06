import {
  type BearerTokenResolver,
  Context,
  Counter,
  Service,
  ServiceParameters,
  Session,
  registerBearerResolver,
  registerOperationAuthorizer,
  scopeAuthorizer,
  unregisterBearerResolver,
  useDynamicService,
  useMetric
} from "@webda/core";
import { useLog } from "@webda/workout";
import * as jose from "jose";
import { OIDCConfigurationError, OIDCTokenInvalid } from "./errors.js";
import { matchAnyGlob } from "./glob.js";
import { checkIssuerUrl } from "./issuer.service.js";

/**
 * An external issuer whose tokens this application accepts
 */
export interface TrustedIssuer {
  /**
   * Exact issuer string compared to `iss` (no glob)
   */
  issuer: string;
  /**
   * Override discovery
   *
   * @default `${issuer}/.well-known/openid-configuration` → jwks_uri
   */
  jwksUri?: string;
  /**
   * Accepted audiences
   *
   * @default [OIDCVerifier.audience]
   */
  audiences?: string[];
  /**
   * Allowed algorithms, never "none" nor HS*
   *
   * @default ["RS256","ES256"]
   */
  algorithms?: string[];
  /**
   * Claim conditions, all must match: values are globs (`*` does not cross `/`)
   *
   * @example { "sub": "repo:loopingz/*:ref:refs/heads/main" }
   */
  claims?: Record<string, string | string[]>;
  /**
   * How to build the application principal name, template over claims
   *
   * A leading `app:` is removed: a Webda issuer `sub` of `app:orders` gives the IAM principal `app:orders`
   * @default "${sub}"
   */
  principal?: string;
  /**
   * Extra static groups, IAM sees them as `app-group:<group>`
   */
  groups?: string[];
  /**
   * Max token lifetime accepted (exp - iat) in seconds
   *
   * @default OIDCVerifier.maxTokenAge
   */
  maxTokenAge?: number;
  /**
   * Session given by a valid token
   *
   * - `application`: a workload token, the caller is the application `app:<principal>`
   * - `user`: an access token (`typ: at+jwt`, RFC 9068) of a Webda `OAuthServer` bound to this application, the
   *   caller is its user, restricted to the token scope. The issuer revocations are only seen when the token expires
   *
   * @default "application"
   */
  session?: "application" | "user";
}

/**
 * Identity of a verified caller: an application, or a user for the `user` trusted issuers
 */
export interface AppIdentity {
  /**
   * Session the identity gives, see {@link TrustedIssuer.session}
   */
  session: "application" | "user";
  /**
   * Token issuer
   */
  issuer: string;
  /**
   * Token subject
   */
  subject: string;
  /**
   * Application principal name, IAM sees it as `app:<principal>`; the user id for a user
   */
  principal: string;
  /**
   * Static groups of the trusted issuer
   */
  groups: string[];
  /**
   * Verified claims
   */
  claims: Record<string, unknown>;
  /**
   * Token expiration timestamp in milliseconds
   */
  expiresAt: number;
}

/**
 * Parameters of the OIDC verifier
 */
export class OIDCVerifierParameters extends ServiceParameters {
  /**
   * Default expected audience, usually this application public URL
   */
  audience: string;
  /**
   * Issuers whose tokens are accepted
   *
   * @default []
   */
  trustedIssuers: TrustedIssuer[];
  /**
   * Clock skew in seconds
   *
   * @default 30
   */
  clockTolerance: number;
  /**
   * Max token lifetime accepted (exp - iat) in seconds
   *
   * @default 3600
   */
  maxTokenAge: number;
  /**
   * Discovery and JWKS cache in seconds
   *
   * @default 600
   */
  jwksCacheTtl: number;
  /**
   * Timeout of the discovery and JWKS requests in milliseconds
   *
   * @default 5000
   */
  requestTimeout: number;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.trustedIssuers ??= [];
    this.clockTolerance ??= 30;
    this.maxTokenAge ??= 3600;
    this.jwksCacheTtl ??= 600;
    this.requestTimeout ??= 5000;
    return this;
  }
}

/**
 * Normalized trusted issuer
 */
type IssuerConfig = Required<Omit<TrustedIssuer, "jwksUri">> & Pick<TrustedIssuer, "jwksUri">;

/**
 * Runtime state of a trusted issuer
 */
interface IssuerState {
  config: IssuerConfig;
  /**
   * Remote key set
   */
  keys?: jose.JWTVerifyGetKey;
  /**
   * jwks_uri of the key set
   */
  jwksUri?: string;
  /**
   * Last discovery, in milliseconds
   */
  discoveredAt: number;
  /**
   * In-flight discovery
   */
  pending?: Promise<jose.JWTVerifyGetKey>;
}

/**
 * Algorithms that can never verify a workload token
 */
const FORBIDDEN_ALGORITHMS = /^(none|HS\d*)$/i;

/**
 * Delay before retrying a failed discovery, in milliseconds
 */
const DISCOVERY_RETRY = 30_000;

/**
 * JWT `typ` of the OAuth access tokens (RFC 9068)
 */
const ACCESS_TOKEN_TYPE = "at+jwt";

/**
 * Claims every user access token of a Webda OAuthServer carries
 */
const USER_CLAIMS = ["sub", "ident", "fam"];

/**
 * @param typ - a JWT `typ` header
 * @returns true for an OAuth access token type, in its short or media type form
 */
function isAccessTokenType(typ: unknown): boolean {
  return typeof typ === "string" && typ.toLowerCase().replace(/^application\//, "") === ACCESS_TOKEN_TYPE;
}

/**
 * Check a key set url: absolute, https (http only for a loopback host)
 * @param url - the url
 * @returns true when acceptable
 */
function isSecureUrl(url: unknown): boolean {
  if (typeof url !== "string") {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
    );
  } catch {
    return false;
  }
}

/**
 * @param value - a claim value
 * @param patterns - accepted globs
 * @returns true when the claim, or one of its values for an array, matches
 */
function claimMatches(value: unknown, patterns: string | string[]): boolean {
  return (Array.isArray(value) ? value : [value]).some(
    v => ["string", "number", "boolean"].includes(typeof v) && matchAnyGlob(String(v), patterns)
  );
}

/**
 * @param err - an error
 * @returns a loggable reason, never containing the token
 */
function reason(err: any): string {
  return err?.code ? `${err.code}: ${err.message}` : String(err?.message ?? err);
}

/**
 * Verify OIDC tokens of trusted issuers and authenticate the caller as an application
 *
 * Registered as a Bearer resolver: a `Authorization: Bearer <jwt>` that is not a TokenService access token is
 * verified here, and a valid one gives a stateless application session (`app:<principal>` for IAM).
 *
 * @WebdaModda OIDCVerifier
 */
export class OIDCVerifier<T extends OIDCVerifierParameters = OIDCVerifierParameters>
  extends Service<T>
  implements BearerTokenResolver
{
  /**
   * Trusted issuers by exact issuer string
   */
  protected issuers = new Map<string, IssuerState>();
  /**
   * `oidc_verify_total{issuer,result}`
   */
  protected verifyCounter: Counter<string>;

  /**
   * Validate the configuration and register as a Bearer resolver
   * @returns this
   */
  resolve(): this {
    super.resolve();
    const { audience, trustedIssuers, maxTokenAge } = this.parameters;
    const issuers = new Map<string, IssuerState>();
    for (const trusted of trustedIssuers) {
      if (typeof trusted?.issuer !== "string" || !trusted.issuer) {
        throw new OIDCConfigurationError(`${this.getName()}: trustedIssuers[].issuer is required`);
      }
      const name = `${this.getName()}: issuer ${trusted.issuer}`;
      if (issuers.has(trusted.issuer)) {
        throw new OIDCConfigurationError(`${name} is defined twice`);
      }
      if (trusted.jwksUri !== undefined) {
        if (!isSecureUrl(trusted.jwksUri)) {
          throw new OIDCConfigurationError(`${name} jwksUri must be an https URL`);
        }
      } else {
        const invalid = checkIssuerUrl(trusted.issuer);
        if (invalid) {
          throw new OIDCConfigurationError(`${name} ${invalid} (or set jwksUri)`);
        }
      }
      const audiences = trusted.audiences ?? (audience ? [audience] : []);
      if (!audiences.length) {
        throw new OIDCConfigurationError(`${name} has no audience`);
      }
      const session = trusted.session ?? "application";
      if (!["application", "user"].includes(session)) {
        throw new OIDCConfigurationError(`${name} session must be "application" or "user"`);
      }
      const algorithms = trusted.algorithms ?? ["RS256", "ES256"];
      if (!algorithms.length || algorithms.some(alg => FORBIDDEN_ALGORITHMS.test(alg))) {
        throw new OIDCConfigurationError(`${name} algorithms must be asymmetric`);
      }
      issuers.set(trusted.issuer, {
        config: {
          issuer: trusted.issuer,
          jwksUri: trusted.jwksUri,
          audiences,
          algorithms,
          claims: trusted.claims ?? {},
          principal: trusted.principal ?? "${sub}",
          groups: trusted.groups ?? [],
          maxTokenAge: trusted.maxTokenAge ?? maxTokenAge,
          session
        },
        discoveredAt: 0
      });
    }
    this.issuers = issuers;
    // Fail closed: the scope of a user token is enforced even without a TokenService
    if ([...issuers.values()].some(state => state.config.session === "user")) {
      registerOperationAuthorizer(scopeAuthorizer);
    }
    this.verifyCounter = useMetric(Counter, {
      name: "oidc_verify_total",
      help: "OIDC token verifications",
      labelNames: ["issuer", "result"]
    });
    registerBearerResolver(this);
    return this;
  }

  /**
   * Unregister the Bearer resolver
   */
  async stop(): Promise<void> {
    unregisterBearerResolver(this);
    await super.stop();
  }

  /**
   * @override
   */
  async resolveBearer(token: string, _context: Context): Promise<Session | undefined> {
    // A verifier of a previous application instance must not authenticate for the current one
    let active: unknown;
    try {
      active = useDynamicService(this.getName());
    } catch {
      active = undefined;
    }
    if (active !== this) {
      unregisterBearerResolver(this);
      return undefined;
    }
    const identity = await this.verify(token);
    if (!identity) {
      return undefined;
    }
    const session = new Session();
    if (identity.session === "user") {
      return this.userSession(session, identity.claims);
    }
    session.loginApplication({
      principal: identity.principal,
      issuer: identity.issuer,
      subject: identity.subject,
      groups: identity.groups,
      claims: identity.claims
    });
    return session;
  }

  /**
   * Log a session in as the user of a verified access token, like a local access token. The refresh family is not
   * kept: it belongs to the issuer
   * @param session - the session
   * @param claims - the verified claims
   * @returns the session
   */
  protected userSession(session: Session, claims: Record<string, any>): Session {
    const mfa = claims.mfa === "verified" ? "verified" : "none";
    const mfaAt = typeof claims.mfaAt === "number" ? claims.mfaAt : undefined;
    session.login(claims.sub, claims.ident, {
      provider: claims.provider,
      amr: claims.amr,
      mfa,
      mfaAt,
      mfaVerifications: claims.mfaVerifications
    });
    session.roles = claims.roles;
    session.authAt = claims.authAt;
    if (typeof claims.client_id === "string") {
      session.clientId = claims.client_id;
    }
    if (typeof claims.scope === "string") {
      session.scopes = claims.scope.split(" ").filter(Boolean);
    } else if (session.clientId !== undefined) {
      session.scopes = [];
    }
    return session;
  }

  /**
   * Verify a token
   * @param token - the JWT
   * @returns the application identity, undefined when the token is not valid
   */
  async verify(token: string): Promise<AppIdentity | undefined> {
    let issuer: unknown;
    try {
      issuer = jose.decodeJwt(token).iss;
    } catch {
      this.refuse(undefined, "malformed", "malformed token");
      return undefined;
    }
    // Only configured issuers are ever contacted: an attacker cannot choose the url
    const state = typeof issuer === "string" ? this.issuers.get(issuer) : undefined;
    if (!state) {
      this.refuse(undefined, "untrusted", "untrusted issuer");
      return undefined;
    }
    const { config } = state;
    try {
      const { payload, protectedHeader } = await jose.jwtVerify(token, await this.getKeySet(state), {
        issuer: config.issuer,
        audience: config.audiences,
        algorithms: config.algorithms,
        clockTolerance: this.parameters.clockTolerance,
        maxTokenAge: config.maxTokenAge,
        requiredClaims: ["exp", "iat"]
      });
      // requiredClaims guarantees both
      const exp = payload.exp as number;
      const iat = payload.iat as number;
      if (exp - iat > config.maxTokenAge) {
        throw new Error("token lifetime exceeds maxTokenAge");
      }
      // A user access token never authenticates an application, nor a workload token a user
      const user = config.session === "user";
      const missing = USER_CLAIMS.find(claim => typeof payload[claim] !== "string" || !payload[claim]);
      if (user) {
        if (!isAccessTokenType(protectedHeader.typ)) {
          throw new Error("not an access token (typ)");
        }
        if (missing) {
          throw new Error(`access token claim ${missing} is missing`);
        }
        if (payload.webda_app !== undefined) {
          throw new Error("workload token");
        }
      } else if (!missing) {
        // Client credentials access tokens of other issuers are `at+jwt` too: only Webda user tokens are refused
        throw new Error("user access tokens are not workload tokens");
      }
      for (const [claim, patterns] of Object.entries(config.claims)) {
        if (!claimMatches(payload[claim], patterns)) {
          throw new Error(`claim ${claim} does not match`);
        }
      }
      const identity: AppIdentity = {
        session: config.session,
        issuer: config.issuer,
        subject: payload.sub ?? "",
        principal: user ? (payload.sub as string) : this.buildPrincipal(config.principal, payload),
        groups: [...config.groups],
        claims: payload,
        expiresAt: exp * 1000
      };
      this.verifyCounter.inc({ issuer: config.issuer, result: "success" });
      return identity;
    } catch (err) {
      this.refuse(config.issuer, "refused", reason(err));
      return undefined;
    }
  }

  /**
   * Verify a token or throw
   * @param token - the JWT
   * @returns the application identity
   * @throws OIDCTokenInvalid when the token is not valid
   */
  async verifyOrFail(token: string): Promise<AppIdentity> {
    const identity = await this.verify(token);
    if (!identity) {
      throw new OIDCTokenInvalid("Invalid OIDC token");
    }
    return identity;
  }

  /**
   * Count and log a refusal
   * @param issuer - the trusted issuer, undefined when the token issuer is not trusted
   * @param result - the metric result
   * @param why - the reason, never the token
   */
  protected refuse(issuer: string | undefined, result: string, why: string): void {
    // Untrusted issuers share one label: an attacker cannot grow the metric cardinality
    this.verifyCounter.inc({ issuer: issuer ?? "untrusted", result });
    useLog("DEBUG", `${this.getName()} refused an OIDC token${issuer ? ` from ${issuer}` : ""}: ${why}`);
  }

  /**
   * Build the principal from its template
   * @param template - `${claim}` placeholders
   * @param claims - the verified claims
   * @returns the sanitized principal
   */
  protected buildPrincipal(template: string, claims: Record<string, unknown>): string {
    const raw = template.replace(/\$\{([A-Za-z0-9_.-]+)\}/g, (_match, claim: string) => {
      const value = claims[claim];
      if (!["string", "number", "boolean"].includes(typeof value)) {
        throw new Error(`principal claim ${claim} is missing`);
      }
      return String(value);
    });
    const principal = raw.replace(/[^A-Za-z0-9:._/@-]/g, "_").replace(/^app:/, "");
    if (!principal) {
      throw new Error("empty principal");
    }
    return principal;
  }

  /**
   * Get the key set of an issuer: its jwksUri, or the one discovered, cached `jwksCacheTtl`
   * @param state - the issuer state
   * @returns the key set
   */
  protected async getKeySet(state: IssuerState): Promise<jose.JWTVerifyGetKey> {
    if (state.config.jwksUri) {
      state.keys ??= this.createKeySet(state.config.jwksUri);
      return state.keys;
    }
    if (state.keys && Date.now() - state.discoveredAt < this.parameters.jwksCacheTtl * 1000) {
      return state.keys;
    }
    state.pending ??= this.discover(state).finally(() => {
      state.pending = undefined;
    });
    return state.pending;
  }

  /**
   * Fetch the discovery document of an issuer
   * @param state - the issuer state
   * @returns the key set
   */
  protected async discover(state: IssuerState): Promise<jose.JWTVerifyGetKey> {
    const { issuer } = state.config;
    try {
      const base = issuer.replace(/\/+$/, "");
      let res = await this.fetchMetadata(`${base}/.well-known/openid-configuration`);
      if (res.status === 404) {
        // An OAuth authorization server publishes RFC 8414 metadata, inserted before the issuer path
        const url = new URL(base);
        res = await this.fetchMetadata(
          `${url.origin}/.well-known/oauth-authorization-server${url.pathname.replace(/\/+$/, "")}`
        );
      }
      if (!res.ok) {
        throw new Error(`discovery returned HTTP ${res.status}`);
      }
      const document: any = await res.json();
      if (document?.issuer !== issuer) {
        throw new Error("discovery issuer does not match");
      }
      if (!isSecureUrl(document.jwks_uri)) {
        throw new Error("discovery jwks_uri is not an https URL");
      }
      // Keep the key set, and its cooldown, while the url does not change
      if (!state.keys || state.jwksUri !== document.jwks_uri) {
        state.keys = this.createKeySet(document.jwks_uri);
        state.jwksUri = document.jwks_uri;
      }
      state.discoveredAt = Date.now();
      return state.keys;
    } catch (err) {
      if (!state.keys) {
        throw err;
      }
      // Keep the previous keys, retry later
      useLog("WARN", `${this.getName()} discovery of ${issuer} failed, keeping the previous keys: ${reason(err)}`);
      state.discoveredAt = Date.now() - this.parameters.jwksCacheTtl * 1000 + DISCOVERY_RETRY;
      return state.keys;
    }
  }

  /**
   * @param url - a discovery url
   * @returns the response, redirects refused
   */
  protected fetchMetadata(url: string): Promise<Response> {
    return fetch(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(this.parameters.requestTimeout)
    });
  }

  /**
   * Create a remote key set: an unknown `kid` refetches at most once per cooldown
   * @param url - the JWKS url
   * @returns the key set
   */
  protected createKeySet(url: string): jose.JWTVerifyGetKey {
    return jose.createRemoteJWKSet(new URL(url), {
      cacheMaxAge: this.parameters.jwksCacheTtl * 1000,
      cooldownDuration: DISCOVERY_RETRY,
      timeoutDuration: this.parameters.requestTimeout
    });
  }
}
