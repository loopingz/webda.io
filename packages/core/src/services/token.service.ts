import { createHash, randomBytes } from "node:crypto";
import { getUuid } from "@webda/utils";
import * as WebdaError from "../errors/errors.js";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { useCrypto } from "./cryptoservice.service.js";
import { RefreshToken } from "../models/refreshtoken.model.js";
import { RevokedAccess } from "../models/revokedaccess.model.js";
import { covers, formatScope, InvalidScope, parseScope, type Scope } from "../session/scope.js";
import { registerOperationAuthorizer, unregisterOperationAuthorizer } from "../core/operations.js";
import { scopeAuthorizer } from "./scopeauthorizer.js";
import { MfaState, type MfaVerification, Session } from "../session/session.js";

const ACCESS_AUDIENCE = "webda-access";

/** Raised for unknown, expired, revoked or reused tokens (403 TOKEN_INVALID) */
export class TokenInvalid extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Invalid token") {
    super(message, 403);
  }
}

/** Tokens returned by a successful login or refresh */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Options of {@link TokenService.issue} */
export interface IssueOptions {
  /** OAuth client */
  clientId?: string;
  /** Granted scope */
  scope?: Scope;
  /** Display name of the refresh family */
  name?: string;
}

/** Claims carried by an access token */
export interface AccessClaims {
  sub: string;
  ident: string;
  provider?: string;
  amr: string[];
  roles?: string[];
  fam: string;
  mfa: MfaState;
  mfaVerifications?: Record<string, MfaVerification>;
  /** When the session was authenticated (ms): checked against the user's last password change */
  authAt?: number;
  /** Granted scope (space-separated operation globs) */
  scope?: string;
  /** OAuth client the token was issued to */
  client_id?: string;
  /** Issued at, seconds (set by the JWT signer) */
  iat?: number;
  /** Issued at, ms: `iat` only has a 1 s resolution, which is too coarse to order a token against a revocation */
  iatMs?: number;
}

/** TokenService parameters */
export class TokenServiceParameters extends ServiceParameters {
  /**
   * Access token lifetime in seconds
   * @default 900
   */
  accessTtl: number;
  /**
   * Refresh token lifetime in seconds
   * @default 2592000
   */
  refreshTtl: number;
  /**
   * Reject access tokens whose family or user was revoked
   * @default true
   */
  revocationCheck: boolean;
  /**
   * Seconds a "not revoked" answer is cached: bounds how long a revocation done by another instance can be missed
   * @default 10
   */
  revocationCacheTtl: number;

  /**
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.accessTtl ??= 900;
    this.refreshTtl ??= 2592000;
    this.revocationCheck ??= true;
    this.revocationCacheTtl ??= 10;
    return this;
  }
}

/**
 * Issues access tokens (JWT) and rotating refresh tokens
 * @WebdaModda TokenService
 */
export class TokenService<T extends TokenServiceParameters = TokenServiceParameters> extends Service<T> {
  /** Revoked keys, cached until their expiry */
  protected revocationHits = new Map<string, RevokedAccess>();
  /** Keys known not revoked, cached for revocationCacheTtl */
  protected revocationMisses = new Map<string, number>();
  /** Periodic sweep of the expired denylist entries */
  protected sweepTimer?: ReturnType<typeof setInterval>;

  /**
   * Enforce the bearer token scope on every operation
   * @override
   */
  resolve(): this {
    super.resolve();
    registerOperationAuthorizer(scopeAuthorizer);
    return this;
  }

  /**
   * Purge expired denylist entries now and then periodically
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    const sweep = () => this.sweepRevoked().catch(err => this.log("WARN", "Revocation sweep failed", err));
    await sweep();
    this.sweepTimer = setInterval(sweep, this.parameters.accessTtl * 1000);
    this.sweepTimer.unref();
    return this;
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
    unregisterOperationAuthorizer(scopeAuthorizer);
    await super.stop();
  }

  /**
   * @param token - raw refresh token
   * @returns SHA-256 hex
   */
  protected hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Issue an access + refresh token pair for a logged session
   *
   * Roles are not persisted: refreshed access tokens carry no roles until they are re-derived.
   * @param session - logged session (must not be anonymous nor pending MFA)
   * @param family - existing family when rotating
   * @param options - OAuth client, scope and display name
   * @returns the tokens and their family
   */
  async issue(
    session: Session,
    family: string = getUuid("base64"),
    options: IssueOptions = {}
  ): Promise<IssuedTokens & { family: string }> {
    if (!session.isLogged()) {
      throw new TokenInvalid("Session is not fully authenticated");
    }
    const scope = options.scope ? formatScope(options.scope) : undefined;
    const refreshToken = randomBytes(32).toString("base64url");
    await RefreshToken.create({
      hash: this.hash(refreshToken),
      userId: session.userId,
      identId: session.identUsed,
      provider: session.provider,
      amr: session.amr ?? [],
      mfa: session.mfa ?? "none",
      mfaVerifications: session.mfaVerifications,
      family,
      expiresAt: Date.now() + this.parameters.refreshTtl * 1000,
      clientId: options.clientId,
      scope,
      name: options.name
    } as any);
    session.refreshFamily = family;
    // A refreshed session is re-authenticated by its (unrevoked) refresh token
    session.authAt ??= Date.now();
    const claims: AccessClaims = {
      sub: session.userId,
      ident: session.identUsed,
      provider: session.provider,
      amr: session.amr ?? [],
      roles: session.roles,
      fam: family,
      mfa: session.mfa ?? "none",
      mfaVerifications: session.mfaVerifications,
      authAt: session.authAt,
      iatMs: Date.now(),
      ...(scope !== undefined ? { scope } : {}),
      ...(options.clientId ? { client_id: options.clientId } : {})
    };
    const accessToken = await useCrypto().jwtSign(claims, {
      audience: ACCESS_AUDIENCE,
      expiresIn: this.parameters.accessTtl
    });
    return { accessToken, refreshToken, expiresIn: this.parameters.accessTtl, family };
  }

  /**
   * @param token - access token
   * @returns claims, or undefined when invalid/expired
   */
  async verifyAccess(token: string): Promise<AccessClaims | undefined> {
    let claims: AccessClaims;
    try {
      claims = await useCrypto().jwtVerify(token, { audience: ACCESS_AUDIENCE });
    } catch {
      return undefined;
    }
    return (await this.isRevoked(claims)) ? undefined : claims;
  }

  /**
   * @param key - denylist key
   * @returns the entry, or undefined
   */
  protected async lookupRevoked(key: string): Promise<RevokedAccess | undefined> {
    const now = Date.now();
    const hit = this.revocationHits.get(key);
    if (hit && hit.expiresAt > now) return hit;
    if ((this.revocationMisses.get(key) ?? 0) > now) return undefined;
    const ref = RevokedAccess.ref({ key } as any);
    const entry = (await ref.exists()) ? await ref.get() : undefined;
    if (entry && entry.expiresAt > now) {
      this.revocationHits.set(key, entry);
      return entry;
    }
    if (this.parameters.revocationCacheTtl > 0) {
      this.revocationMisses.set(key, now + this.parameters.revocationCacheTtl * 1000);
    }
    return undefined;
  }

  /**
   * @param claims - verified access claims
   * @returns true when the family or the user was revoked after the token was issued
   */
  async isRevoked(claims: AccessClaims): Promise<boolean> {
    if (!this.parameters.revocationCheck) return false;
    if (claims.fam && (await this.lookupRevoked(`fam:${claims.fam}`))) return true;
    const user = await this.lookupRevoked(`user:${claims.sub}`);
    // Tokens without iatMs fall back to iat, rounded down to the second: rejected when in doubt
    return user !== undefined && (claims.iatMs ?? (claims.iat ?? 0) * 1000) <= (user.notBefore ?? Infinity);
  }

  /**
   * @param key - denylist key
   * @param notBefore - for user entries, tokens issued before are rejected (ms)
   */
  protected async denylist(key: string, notBefore?: number): Promise<void> {
    const entry = { key, notBefore, expiresAt: Date.now() + this.parameters.accessTtl * 1000 };
    const ref = RevokedAccess.ref({ key } as any);
    if (await ref.exists()) await ref.patch(entry as any);
    else await RevokedAccess.create(entry as any);
    this.revocationMisses.delete(key);
    this.revocationHits.set(key, entry as any);
  }

  /** @returns number of removed expired entries */
  async sweepRevoked(): Promise<number> {
    let removed = 0;
    for await (const entry of RevokedAccess.iterate("expiresAt < ?", [Date.now()])) {
      await entry.ref().delete();
      removed++;
    }
    return removed;
  }

  /**
   * Exchange a refresh token (rotation with reuse detection)
   *
   * The token is only ever looked up by its hash, so an access token or any
   * arbitrary string simply does not match a stored record.
   * @param refreshToken - raw refresh token
   * @param options - client the token must belong to and optional narrower scope
   * @returns new tokens, the rebuilt session and the granted scope
   */
  async refresh(
    refreshToken: string,
    options: { scope?: Scope; clientId?: string } = {}
  ): Promise<IssuedTokens & { session: Session; scope?: Scope }> {
    if (typeof refreshToken !== "string" || !refreshToken) {
      throw new TokenInvalid();
    }
    const ref = RefreshToken.ref({ hash: this.hash(refreshToken) } as any);
    if (!(await ref.exists())) {
      throw new TokenInvalid();
    }
    const stored: RefreshToken = await ref.get();
    if (stored.revokedAt || stored.expiresAt < Date.now()) {
      throw new TokenInvalid();
    }
    if ((stored.clientId ?? undefined) !== (options.clientId ?? stored.clientId)) {
      throw new TokenInvalid("Refresh token issued to another client");
    }
    if (stored.rotatedAt) {
      await this.revokeFamily(stored.family);
      throw new TokenInvalid("Refresh token reused");
    }
    // Checked before the compare-and-set so an invalid narrowing does not burn the refresh token
    const storedScope = stored.scope !== undefined ? parseScope(stored.scope) : undefined;
    let scope = storedScope;
    if (options.scope) {
      if (storedScope && !covers(storedScope, options.scope)) {
        throw new InvalidScope("Requested scope exceeds the granted scope");
      }
      scope = options.scope;
    }
    // Compare-and-set: only one caller can move rotatedAt from undefined to a value
    try {
      await ref.patch({ rotatedAt: Date.now() } as any, "rotatedAt" as any, undefined);
    } catch (err) {
      if (!this.isConditionFailure(err)) {
        throw err;
      }
      // Lost the race: treat as reuse and kill the family
      await this.revokeFamily(stored.family);
      throw new TokenInvalid("Refresh token reused");
    }
    const session = new Session();
    session.login(stored.userId, stored.identId, {
      provider: stored.provider,
      amr: stored.amr,
      mfa: stored.mfa ?? "none",
      mfaVerifications: stored.mfaVerifications
    });
    const tokens = await this.issue(session, stored.family, { clientId: stored.clientId, scope, name: stored.name });
    // A revocation may have run between our read and the issue: its scan would have missed the new record
    for await (const _ of RefreshToken.iterate("family = ? AND revokedAt IS NOT NULL LIMIT 1", [stored.family])) {
      await RefreshToken.ref({ hash: this.hash(tokens.refreshToken) } as any).patch({
        revokedAt: Date.now()
      } as any);
      throw new TokenInvalid("Refresh token revoked");
    }
    await RefreshToken.ref({ hash: this.hash(tokens.refreshToken) } as any).patch({
      lastUsedAt: Date.now()
    } as any);
    return { ...tokens, session, scope };
  }

  /**
   * @param err - error thrown by a conditional write
   * @returns true if the error is a failed write condition
   */
  protected isConditionFailure(err: any): boolean {
    return /condition/i.test(`${err?.name} ${err?.message}`);
  }

  /**
   * @param family - family to revoke
   */
  async revokeFamily(family: string): Promise<void> {
    for await (const token of RefreshToken.iterate("family = ? AND revokedAt IS NULL", [family])) {
      await token.ref().patch({ revokedAt: Date.now() } as any);
    }
    await this.denylist(`fam:${family}`);
  }

  /**
   * @param userId - user whose tokens are revoked
   */
  async revokeUser(userId: string): Promise<void> {
    for await (const token of RefreshToken.iterate("userId = ? AND revokedAt IS NULL", [userId])) {
      await token.ref().patch({ revokedAt: Date.now() } as any);
    }
    await this.denylist(`user:${userId}`, Date.now());
  }
}
