import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";
import type { MfaState } from "@webda/core";

/** Identity captured at consent time */
export interface GrantIdentity {
  userId: string;
  identId: string;
  provider?: string;
  amr: string[];
  mfa: MfaState;
}

/**
 * Authorization code (hashed), single use
 * @WebdaModel
 */
export class OAuthCode extends Model {
  [WEBDA_PRIMARY_KEY] = ["hash"] as const;
  hash: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  identity: GrantIdentity;
  scope: string;
  name?: string;
  /** Resource the tokens are bound to (RFC 8707) */
  resource?: string;
  expiresAt: number;
  /** Set when exchanged */
  usedAt?: number;
  /** Refresh family issued from the code */
  family?: string;
  /** Set when the code is presented again: the exchange that recorded the family revokes it */
  reusedAt?: number;
}

/**
 * Pending device authorization
 * @WebdaModel
 */
export class OAuthDeviceCode extends Model {
  [WEBDA_PRIMARY_KEY] = ["userCode"] as const;
  userCode: string;
  secretHash: string;
  clientId: string;
  requestedScope: string;
  status: "pending" | "approved" | "denied" | "consumed";
  identity?: GrantIdentity;
  grantedScope?: string;
  name?: string;
  hostname?: string;
  expiresAt: number;
  lastPolledAt?: number;
  /** Current polling interval (s), raised by slow_down */
  interval: number;
}

/**
 * Remembered consent of a user for a client
 * @WebdaModel
 */
export class OAuthGrant extends Model {
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
  /** `<userId>:<clientId>` */
  uuid: string;
  userId: string;
  clientId: string;
  scope: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
}

/**
 * Client registered dynamically (RFC 7591), public client without secret
 * @WebdaModel
 */
export class OAuthRegisteredClient extends Model {
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
  /** The `dcr_…` client_id */
  uuid: string;
  name: string;
  clientUri?: string;
  logoUri?: string;
  redirect_uris: string[];
  scope?: string;
  createdAt: number;
  lastUsedAt?: number;
  /** Extended on use */
  expiresAt: number;
  /** Address that registered the client */
  ip: string;
}
