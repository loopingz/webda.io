import { createHash, randomBytes } from "node:crypto";
import { getUuid } from "@webda/utils";
import * as WebdaError from "../errors/errors.js";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { useCrypto } from "./cryptoservice.service.js";
import { RefreshToken } from "../models/refreshtoken.model.js";
import { RevokedAccess } from "../models/revokedaccess.model.js";
import { covers, formatScope, InvalidScope, parseScope, type Scope } from "../session/scope.js";
import { registerOperationAuthorizer } from "../core/operations.js";
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
  /** Access token lifetime (s), defaults to the `accessTtl` parameter; kept by the family on refresh */
  accessTtl?: number;
  /** Refresh token lifetime (s), defaults to the `refreshTtl` parameter; kept by the family on refresh */
  refreshTtl?: number;
  /**
   * Creation of the family (ms), carried across rotations; defaults to now
   * @internal set by {@link TokenService.refresh}
   */
  createdAt?: number;
  /**
   * Last refresh of the family (ms)
   * @internal set by {@link TokenService.refresh}
   */
  lastUsedAt?: number;
  /**
   * The raw refresh token to store, instead of a new random one
   * @internal set by {@link TokenService.refresh}, which records its hash on the rotated token before issuing it
   */
  refreshToken?: string;
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
   * Seconds during which a rotated refresh token presented again is rotated once more, as long as the token it was
   * exchanged for was never used: a client that lost the answer of its refresh (laptop asleep, network drop)
   * retries with the token it still holds instead of losing its session. The unused replacement is retired; if it
   * is presented later anyway (two holders), the family is revoked. 0 disables it: any replay revokes the family
   * @default 86400
   */
  refreshGrace: number;

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
    this.refreshGrace ??= 86400;
    return this;
  }
}

/**
 * Issues access tokens (JWT) and rotating refresh tokens
 * @WebdaModda TokenService
 */
export class TokenService<T extends TokenServiceParameters = TokenServiceParameters> extends Service<T> {
  /** Revoked keys, cached until their expiry (`user:` entries only for revocationCacheTtl: they can be raised) */
  protected revocationHits = new Map<string, { entry: RevokedAccess; until: number }>();
  /** Keys known not revoked, cached for revocationCacheTtl */
  protected revocationMisses = new Map<string, number>();
  /** Periodic sweep of the expired denylist entries */
  protected sweepTimer?: ReturnType<typeof setInterval>;

  /**
   * Enforce the bearer token scope on every operation. The authorizer is never unregistered, even on stop: a scoped
   * bearer must stay restricted while the service drains or reloads (fail closed). It does nothing for sessions
   * without scopes
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
   * @returns a new raw refresh token
   */
  protected newRefreshToken(): string {
    return randomBytes(32).toString("base64url");
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
    const accessTtl = options.accessTtl ?? this.parameters.accessTtl;
    const refreshToken = options.refreshToken ?? this.newRefreshToken();
    const now = Date.now();
    await RefreshToken.create({
      hash: this.hash(refreshToken),
      userId: session.userId,
      identId: session.identUsed,
      provider: session.provider,
      amr: session.getPersistentAmr(),
      mfa: session.mfa ?? "none",
      mfaVerifications: session.mfaVerifications,
      family,
      expiresAt: Date.now() + (options.refreshTtl ?? this.parameters.refreshTtl) * 1000,
      clientId: options.clientId,
      scope,
      name: options.name,
      accessTtl: options.accessTtl,
      refreshTtl: options.refreshTtl,
      createdAt: options.createdAt ?? now,
      lastUsedAt: options.lastUsedAt
    } as any);
    session.refreshFamily = family;
    // A refreshed session is re-authenticated by its (unrevoked) refresh token
    session.authAt ??= Date.now();
    const claims: AccessClaims = {
      sub: session.userId,
      ident: session.identUsed,
      provider: session.provider,
      amr: session.getPersistentAmr(),
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
      expiresIn: accessTtl
    });
    return { accessToken, refreshToken, expiresIn: accessTtl, family };
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
    if (hit && hit.until > now) return hit.entry;
    if ((this.revocationMisses.get(key) ?? 0) > now) return undefined;
    const ref = RevokedAccess.ref({ key } as any);
    const entry = (await ref.exists()) ? await ref.get() : undefined;
    if (entry && entry.expiresAt > now) {
      this.cacheHit(key, entry);
      return entry;
    }
    if (this.parameters.revocationCacheTtl > 0) {
      this.revocationMisses.set(key, now + this.parameters.revocationCacheTtl * 1000);
    }
    return undefined;
  }

  /**
   * Cache a revoked entry: a `user:` notBefore can be raised by a later revocation, so re-read it after the TTL
   * @param key - denylist key
   * @param entry - the entry
   */
  protected cacheHit(key: string, entry: RevokedAccess): void {
    const until = key.startsWith("user:")
      ? Math.min(entry.expiresAt, Date.now() + this.parameters.revocationCacheTtl * 1000)
      : entry.expiresAt;
    this.revocationHits.set(key, { entry, until });
  }

  /** Drop the expired cache entries */
  protected pruneRevocationCaches(): void {
    const now = Date.now();
    for (const [key, hit] of this.revocationHits) {
      if (hit.until <= now || hit.entry.expiresAt <= now) this.revocationHits.delete(key);
    }
    for (const [key, until] of this.revocationMisses) {
      if (until <= now) this.revocationMisses.delete(key);
    }
  }

  /**
   * @param claims - verified access claims
   * @returns true when the family or the user was revoked after the token was issued
   */
  async isRevoked(claims: AccessClaims): Promise<boolean> {
    if (!this.parameters.revocationCheck) return false;
    if (claims.fam && (await this.lookupRevoked(`fam:${claims.fam}`))) return true;
    if (!claims.sub) return false;
    const user = await this.lookupRevoked(`user:${claims.sub}`);
    // Tokens without iatMs fall back to iat, rounded down to the second: rejected when in doubt
    // A token issued in the very ms of the revocation is accepted: a login right after a revocation (MFA confirm)
    return user !== undefined && (claims.iatMs ?? (claims.iat ?? 0) * 1000) < (user.notBefore ?? Infinity);
  }

  /**
   * @param key - denylist key
   * @param notBefore - for user entries, tokens issued before are rejected (ms)
   * @param accessTtl - longest lifetime (s) of the access tokens to reject, at least the `accessTtl` parameter
   */
  protected async denylist(key: string, notBefore?: number, accessTtl: number = 0): Promise<void> {
    const entry = {
      key,
      notBefore,
      expiresAt: Date.now() + Math.max(accessTtl, this.parameters.accessTtl) * 1000
    };
    const ref = RevokedAccess.ref({ key } as any);
    try {
      await RevokedAccess.create(entry as any);
    } catch (err) {
      // Created concurrently (or already there): update it, an existing row means the conflict is benign
      if (!(await ref.exists())) throw err;
      // Never shorten an entry: it may cover longer-lived access tokens
      entry.expiresAt = Math.max(entry.expiresAt, (await ref.get()).expiresAt ?? 0);
      await ref.patch(entry as any);
    }
    this.revocationMisses.delete(key);
    this.cacheHit(key, entry as any);
  }

  /** @returns number of removed expired entries */
  async sweepRevoked(): Promise<number> {
    this.pruneRevocationCaches();
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
   * @param options.scope - narrower scope to grant
   * @param options.clientId - client the token must belong to
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
    const now = Date.now();
    if (stored.retiredAt) {
      // replaced, unused, by a replay of its predecessor within the grace, and presented anyway: two holders
      await this.revokeFamily(stored.family);
      throw new TokenInvalid("Refresh token reused");
    }
    if (stored.revokedAt) {
      throw new TokenInvalid();
    }
    if (stored.expiresAt < now) {
      throw new TokenInvalid();
    }
    // A token issued to an OAuth client is only refreshed by that client: never by a first-party (client-less) caller
    if ((stored.clientId ?? undefined) !== (options.clientId ?? undefined)) {
      throw new TokenInvalid("Refresh token issued to another client");
    }
    /** replay within the grace: the unused token it was exchanged for, to retire (undefined when never stored) */
    let retired: RefreshToken | undefined;
    if (stored.rotatedAt) {
      const unused = await this.unusedSuccessor(stored, now);
      if (!unused.ok) {
        await this.revokeFamily(stored.family);
        throw new TokenInvalid("Refresh token reused");
      }
      retired = unused.record;
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
    // The replacement is retired before the rotation: no write may follow it (see below)
    if (retired) await retired.ref().patch({ retiredAt: now } as any);
    // The new token is drawn first so the rotated record points at it in the same write
    const nextToken = this.newRefreshToken();
    const successor = this.hash(nextToken);
    // Compare-and-set: only one caller can move rotatedAt from undefined to a value (or, within the grace, replace
    // the successor it recorded)
    try {
      if (stored.rotatedAt) {
        await ref.patch({ successor } as any, "successor" as any, stored.successor as any);
      } else {
        await ref.patch({ rotatedAt: now, successor } as any, "rotatedAt" as any, undefined);
      }
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
    const tokens = await this.issue(session, stored.family, {
      clientId: stored.clientId,
      scope,
      name: stored.name,
      accessTtl: stored.accessTtl,
      refreshTtl: stored.refreshTtl,
      // Written with the new record: a failing write after the rotation would make the client retry a rotated token
      createdAt: stored.createdAt,
      lastUsedAt: now,
      refreshToken: nextToken
    });
    // A revocation may have run between our read and the issue: its scan would have missed the new record
    for await (const _ of RefreshToken.iterate("family = ? AND revokedAt IS NOT NULL LIMIT 1", [stored.family])) {
      await RefreshToken.ref({ hash: this.hash(tokens.refreshToken) } as any).patch({
        revokedAt: Date.now()
      } as any);
      throw new TokenInvalid("Refresh token revoked");
    }
    return { ...tokens, session, scope };
  }

  /**
   * Whether a rotated token presented again may be rotated once more: within `refreshGrace` of its rotation, and
   * the token it was exchanged for was never used (not rotated, not revoked; a record that was never written, the
   * issue having failed after the rotation, counts as unused)
   * @param stored - the rotated token
   * @param now - ms
   * @returns ok, with the successor's record to retire when it exists
   */
  protected async unusedSuccessor(stored: RefreshToken, now: number): Promise<{ ok: boolean; record?: RefreshToken }> {
    const grace = this.parameters.refreshGrace * 1000;
    if (!(grace > 0) || !stored.successor || now - stored.rotatedAt > grace) return { ok: false };
    const ref = RefreshToken.ref({ hash: stored.successor } as any);
    if (!(await ref.exists())) return { ok: true };
    const record: RefreshToken = await ref.get();
    return record.rotatedAt || record.revokedAt || record.retiredAt ? { ok: false } : { ok: true, record };
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
    let accessTtl = 0;
    // Revoked records too: their access tokens may outlive the default lifetime
    for await (const token of RefreshToken.iterate("family = ?", [family])) {
      accessTtl = Math.max(accessTtl, token.accessTtl ?? 0);
      if (!token.revokedAt) await token.ref().patch({ revokedAt: Date.now() } as any);
    }
    await this.denylist(`fam:${family}`, undefined, accessTtl);
  }

  /**
   * @param userId - user whose tokens are revoked
   */
  async revokeUser(userId: string): Promise<void> {
    let accessTtl = 0;
    for await (const token of RefreshToken.iterate("userId = ? AND revokedAt IS NULL", [userId])) {
      accessTtl = Math.max(accessTtl, token.accessTtl ?? 0);
      await token.ref().patch({ revokedAt: Date.now() } as any);
    }
    await this.denylist(`user:${userId}`, Date.now(), accessTtl);
  }
}
