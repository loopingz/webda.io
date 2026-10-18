import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";

/**
 * Denylist entry for access tokens: `fam:<family>` or `user:<userId>` (with `notBefore`)
 * @WebdaModel
 */
export class RevokedAccess extends Model {
  [WEBDA_PRIMARY_KEY] = ["key"] as const;
  /** `fam:<family>` or `user:<userId>` */
  key: string;
  /** For `user:` entries: tokens issued before (ms) are rejected */
  notBefore?: number;
  /** Removal time (ms): revocation time + access token lifetime */
  expiresAt: number;
}
