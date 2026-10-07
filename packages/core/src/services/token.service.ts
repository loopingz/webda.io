import { createHash, randomBytes } from "node:crypto";
import { getUuid } from "@webda/utils";
import * as WebdaError from "../errors/errors.js";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { useCrypto } from "./cryptoservice.service.js";
import { RefreshToken } from "../models/refreshtoken.model.js";
import { MfaState, Session } from "../session/session.js";

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

/** Claims carried by an access token */
export interface AccessClaims {
  sub: string;
  ident: string;
  provider?: string;
  amr: string[];
  roles?: string[];
  fam: string;
  mfa: MfaState;
  /** When the session was authenticated (ms): checked against the user's last password change */
  authAt?: number;
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
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.accessTtl ??= 900;
    this.refreshTtl ??= 2592000;
    return this;
  }
}

/**
 * Issues access tokens (JWT) and rotating refresh tokens
 * @WebdaModda TokenService
 */
export class TokenService<T extends TokenServiceParameters = TokenServiceParameters> extends Service<T> {
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
   * @returns the tokens
   */
  async issue(session: Session, family: string = getUuid("base64")): Promise<IssuedTokens> {
    if (!session.isLogged()) {
      throw new TokenInvalid("Session is not fully authenticated");
    }
    const refreshToken = randomBytes(32).toString("base64url");
    await RefreshToken.create({
      hash: this.hash(refreshToken),
      userId: session.userId,
      identId: session.identUsed,
      provider: session.provider,
      amr: session.amr ?? [],
      mfa: session.mfa ?? "none",
      family,
      expiresAt: Date.now() + this.parameters.refreshTtl * 1000
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
      authAt: session.authAt
    };
    const accessToken = await useCrypto().jwtSign(claims, {
      audience: ACCESS_AUDIENCE,
      expiresIn: this.parameters.accessTtl
    });
    return { accessToken, refreshToken, expiresIn: this.parameters.accessTtl };
  }

  /**
   * @param token - access token
   * @returns claims, or undefined when invalid/expired
   */
  async verifyAccess(token: string): Promise<AccessClaims | undefined> {
    try {
      return await useCrypto().jwtVerify(token, { audience: ACCESS_AUDIENCE });
    } catch {
      return undefined;
    }
  }

  /**
   * Exchange a refresh token (rotation with reuse detection)
   *
   * The token is only ever looked up by its hash, so an access token or any
   * arbitrary string simply does not match a stored record.
   * @param refreshToken - raw refresh token
   * @returns new tokens and the rebuilt session
   */
  async refresh(refreshToken: string): Promise<IssuedTokens & { session: Session }> {
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
    if (stored.rotatedAt) {
      await this.revokeFamily(stored.family);
      throw new TokenInvalid("Refresh token reused");
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
      mfa: stored.mfa ?? "none"
    });
    const tokens = await this.issue(session, stored.family);
    // A revocation may have run between our read and the issue: its scan would have missed the new record
    for await (const _ of RefreshToken.iterate("family = ? AND revokedAt IS NOT NULL LIMIT 1", [stored.family])) {
      await RefreshToken.ref({ hash: this.hash(tokens.refreshToken) } as any).patch({
        revokedAt: Date.now()
      } as any);
      throw new TokenInvalid("Refresh token revoked");
    }
    return { ...tokens, session };
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
  }

  /**
   * @param userId - user whose tokens are revoked
   */
  async revokeUser(userId: string): Promise<void> {
    for await (const token of RefreshToken.iterate("userId = ? AND revokedAt IS NULL", [userId])) {
      await token.ref().patch({ revokedAt: Date.now() } as any);
    }
  }
}
