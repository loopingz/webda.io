import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";
import type { MfaState, MfaVerification } from "../session/session.js";

/**
 * Stored refresh token (only its SHA-256 hash)
 * @WebdaModel
 */
export class RefreshToken extends Model {
  [WEBDA_PRIMARY_KEY] = ["hash"] as const;
  /** SHA-256 hex of the token */
  hash: string;
  /** Owner */
  userId: string;
  /** Ident used to log in */
  identId: string;
  /** Provider used */
  provider?: string;
  /** Authentication methods */
  amr: string[] = [];
  /** MFA state of the session that issued the token */
  mfa: MfaState = "none";
  /** When the second factor was verified (ms): refreshing does not advance it */
  mfaAt?: number;
  /** Scoped MFA verifications; refreshing does not advance their timestamps. */
  mfaVerifications?: Record<string, MfaVerification>;
  /** Rotation family */
  family: string;
  /** Expiry, ms since epoch */
  expiresAt: number;
  /** Set once exchanged */
  rotatedAt?: number;
  /** Hash of the token it was exchanged for: a replay within the grace checks whether that one was ever used */
  successor?: string;
  /**
   * Set when replaced, never used, by a replay of the token it came from (within the grace): presenting it means two
   * holders, and revokes the family
   */
  retiredAt?: number;
  /** Set when revoked */
  revokedAt?: number;
  /** OAuth client the token was issued to */
  clientId?: string;
  /** Granted scope (space-separated) */
  scope?: string;
  /** Display name, e.g. "webda-cli on remi-mbp" */
  name?: string;
  /** Creation of the family, ms since epoch: carried across rotations */
  createdAt?: number;
  /** Last refresh, ms since epoch */
  lastUsedAt?: number;
  /** Access token lifetime of the family (s), when it overrides the TokenService one */
  accessTtl?: number;
  /** Refresh token lifetime of the family (s), when it overrides the TokenService one */
  refreshTtl?: number;
}
