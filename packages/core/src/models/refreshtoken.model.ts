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
  /** Scoped MFA verifications; refreshing does not advance their timestamps. */
  mfaVerifications?: Record<string, MfaVerification>;
  /** Rotation family */
  family: string;
  /** Expiry, ms since epoch */
  expiresAt: number;
  /** Set once exchanged */
  rotatedAt?: number;
  /** Set when revoked */
  revokedAt?: number;
  /** OAuth client the token was issued to */
  clientId?: string;
  /** Granted scope (space-separated) */
  scope?: string;
  /** Display name, e.g. "webda-cli on remi-mbp" */
  name?: string;
  /** Last refresh, ms since epoch */
  lastUsedAt?: number;
}
