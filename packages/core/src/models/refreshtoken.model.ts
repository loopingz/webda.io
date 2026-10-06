import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";

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
  /** Rotation family */
  family: string;
  /** Expiry, ms since epoch */
  expiresAt: number;
  /** Set once exchanged */
  rotatedAt?: number;
  /** Set when revoked */
  revokedAt?: number;
}
