import { Model, ModelLink, WEBDA_PRIMARY_KEY, WEBDA_PRIMARY_KEY_SEPARATOR, type Settable } from "@webda/models";
import * as WebdaError from "../errors/errors.js";
import type { IOperationContext } from "../contexts/icontext.js";
import { User } from "./user.model.js";

/** OAuth tokens associated with an identity provider */
export interface IdentTokens {
  /** Access token */
  access?: string;
  /** Refresh token */
  refresh?: string;
}

/** Email sending throttle state of an ident (login failures are top-level `Ident` attributes) */
export interface IdentThrottle {
  /** Timestamp of the last email sent */
  lastSentAt?: number;
}

/** Raised for malformed ident keys (400 INVALID_IDENT) */
export class InvalidIdent extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Invalid ident") {
    super(message, 400);
  }
}

const SEPARATOR = ":";

/**
 * An identity linked to a user: `<providerUid>:<provider>`
 * @WebdaModel
 */
export class Ident extends Model {
  /** Composite primary key */
  [WEBDA_PRIMARY_KEY] = ["providerUid", "provider"] as const;
  // Must stay a string literal: the content mapper reads it textually
  [WEBDA_PRIMARY_KEY_SEPARATOR] = ":";
  /** Identifier on the provider (normalised email for "email") */
  providerUid: string;
  /** Provider name */
  provider: string;
  /** Owner */
  _user: ModelLink<User>;
  /** Email asserted for this ident */
  email?: string;
  /** When the ident was verified */
  verifiedAt?: Date;
  /** Last login with this ident */
  lastUsedAt?: Date;
  /** Email sending throttle state */
  _throttle: IdentThrottle = {};
  /**
   * Login attempts counted since the last successful login
   *
   * Top-level so stores can increment it atomically (nested-path atomic operations are not portable)
   */
  _loginAttempts: number = 0;
  /** Timestamp (ms) of the last counted login attempt */
  _lastLoginAttemptAt?: number;
  /** Provider profile */
  __profile?: any;
  /** Provider tokens */
  __tokens?: IdentTokens;

  /** @param data - initial data */
  constructor(data?: Settable<Ident>) {
    super();
    Object.assign(this, data);
  }

  /**
   * Build and validate a key
   * @param providerUid - uid on the provider
   * @param provider - provider name
   * @returns the composite key
   */
  static key(providerUid: string, provider: string): { providerUid: string; provider: string } {
    for (const [name, v] of [
      ["providerUid", providerUid],
      ["provider", provider]
    ]) {
      if (typeof v !== "string" || v.length === 0 || v.includes(SEPARATOR)) {
        throw new InvalidIdent(`${name} must be a non-empty string without '${SEPARATOR}'`);
      }
    }
    return { providerUid, provider };
  }

  /**
   * Normalise an email for use as providerUid
   * @param email - raw email
   * @returns trimmed lowercase email
   */
  static normalizeEmail(email: string): string {
    return `${email ?? ""}`.trim().toLowerCase();
  }

  /**
   * @returns the owner link
   */
  getUser(): ModelLink<User> {
    return this._user;
  }

  /**
   * @param user - owner uuid or user
   */
  setUser(user: string | User): void {
    const uuid = typeof user === "string" ? user : (user.getUUID() as string);
    this._user ??= new ModelLink<User>(User as any).set(uuid);
    this._user.set(uuid);
  }

  /**
   * @returns the email of this ident
   */
  getEmail(): string | undefined {
    return this.email;
  }

  /**
   * @returns true when verified
   */
  isVerified(): boolean {
    return this.verifiedAt !== undefined && this.verifiedAt !== null;
  }

  /**
   * Only the owner may act on an ident
   * @param ctx - operation context
   * @param action - action name
   * @returns true or a refusal reason
   */
  async canAct(ctx: IOperationContext, action: string): Promise<string | boolean> {
    if (!ctx.getCurrentUserId() || this._user?.toString() !== ctx.getCurrentUserId()) {
      return "You can't act on this ident";
    }
    return true;
  }
}
