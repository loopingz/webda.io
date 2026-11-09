import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";
import type { MfaState, MfaVerification } from "@webda/core";

/** Identity captured at consent time */
export interface GrantIdentity {
  /**
   * User ID
   */
  userId: string;
  /**
   * Ident ID
   */
  identId: string;
  /**
   * Provider
   */
  provider?: string;
  /**
   * Amr
   */
  amr: string[];
  /**
   * MFA
   */
  mfa: MfaState;
  /**
   * MFA at
   */
  mfaAt?: number;
  /**
   * MFA verifications
   */
  mfaVerifications?: Record<string, MfaVerification>;
}

/**
 * Authorization code (hashed), single use
 * @WebdaModel
 */
export class OAuthCode extends Model {
  /**
   * [webda primary key]
   */
  [WEBDA_PRIMARY_KEY] = ["hash"] as const;
  /**
   * Hash
   */
  hash: string;
  /**
   * Client ID
   */
  clientId: string;
  /**
   * Redirect URI
   */
  redirectUri: string;
  /**
   * Code challenge
   */
  codeChallenge: string;
  /**
   * Identity
   */
  identity: GrantIdentity;
  /**
   * Scope
   */
  scope: string;
  /**
   * Name
   */
  name?: string;
  /** Resource the tokens are bound to (RFC 8707) */
  resource?: string;
  /** Other resources the family may mint access tokens for (RFC 8707 §2.2) */
  resources?: string[];
  /**
   * Expires at
   */
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
  /**
   * [webda primary key]
   */
  [WEBDA_PRIMARY_KEY] = ["userCode"] as const;
  /**
   * User code
   */
  userCode: string;
  /**
   * Secret hash
   */
  secretHash: string;
  /**
   * Client ID
   */
  clientId: string;
  /**
   * Requested scope
   */
  requestedScope: string;
  /**
   * Status
   */
  status: "pending" | "approved" | "denied" | "consumed";
  /**
   * Identity
   */
  identity?: GrantIdentity;
  /**
   * Granted scope
   */
  grantedScope?: string;
  /**
   * Name
   */
  name?: string;
  /**
   * Hostname
   */
  hostname?: string;
  /** Other resources the family may mint access tokens for (RFC 8707 §2.2), from the client configuration */
  resources?: string[];
  /**
   * Expires at
   */
  expiresAt: number;
  /**
   * Last polled at
   */
  lastPolledAt?: number;
  /** Current polling interval (s), raised by slow_down */
  interval: number;
}

/**
 * Remembered consent of a user for a client
 * @WebdaModel
 */
export class OAuthGrant extends Model {
  /**
   * [webda primary key]
   */
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
  /** `<userId>:<clientId>` */
  uuid: string;
  /**
   * User ID
   */
  userId: string;
  /**
   * Client ID
   */
  clientId: string;
  /**
   * Scope
   */
  scope: string;
  /**
   * Created at
   */
  createdAt: number;
  /**
   * Last used at
   */
  lastUsedAt: number;
  /**
   * Expires at
   */
  expiresAt: number;
}

/**
 * Client registered dynamically (RFC 7591), public client without secret
 * @WebdaModel
 */
export class OAuthRegisteredClient extends Model {
  /**
   * [webda primary key]
   */
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
  /** The `dcr_…` client_id */
  uuid: string;
  /**
   * Name
   */
  name: string;
  /**
   * Client URI
   */
  clientUri?: string;
  /**
   * Logo URI
   */
  logoUri?: string;
  /**
   * Redirect URIS
   */
  redirect_uris: string[];
  /**
   * Scope
   */
  scope?: string;
  /**
   * Created at
   */
  createdAt: number;
  /**
   * Last used at
   */
  lastUsedAt?: number;
  /** Extended on use */
  expiresAt: number;
  /** Address that registered the client */
  ip: string;
}
