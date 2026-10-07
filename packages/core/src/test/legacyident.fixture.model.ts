import type { LoadParameters, SelfJSONed, Settable } from "@webda/models";
import { OwnerModel } from "../models/ownermodel.model.js";
import type { User } from "../models/user.model.js";

/**
 * OAuth tokens associated with an identity provider (fixture version)
 */
export class LegacyIdentTokens {
  /**
   * Refresh token
   */
  refresh: string;
  /**
   * Access token
   */
  access: string;
}

/**
 * Legacy fixture for Ident model used in tests
 * @class
 * @WebdaIgnore
 */
export class LegacyIdentFixture extends OwnerModel {
  /**
   * Create a new LegacyIdentFixture
   * @param data - initial data
   */
  constructor(data?: Settable<LegacyIdentFixture>) {
    super(data);
  }
  /**
   * Type of the ident
   */
  _type: string;
  /**
   * Uid on the provider
   */
  uid: string;
  /**
   * Provider profile
   */
  __profile: any;
  /**
   * Tokens for this ident
   */
  __tokens: LegacyIdentTokens;
  /**
   * Last time the ident was used
   */
  _lastUsed?: Date = undefined;
  /**
   * If the ident is validated
   */
  _failedLogin: number = 0;
  /**
   * If EmailIdent
   */
  _lastValidationEmail?: number = 0;
  /**
   * When the ident was validated
   */
  _validation?: Date;
  /**
   * Email for this ident if it exist
   */
  email?: string;
  /**
   * Provider id
   */
  provider?: string;

  /**
   * Get the email for this ident
   * @returns the result string
   */
  getEmail(): string {
    return this.email;
  }

  /**
   * Get the provider type
   * @returns the result
   */
  getType() {
    return this._type;
  }

  /**
   * Set the provider type
   * @param type - the type to look up
   */
  setType(type) {
    this._type = type;
  }

  /**
   * Get the user who owns this ident
   * @returns the result
   */
  getUser() {
    return this.getOwner();
  }

  /**
   * Set the user who owns this ident
   * @param uuid - the unique identifier
   */
  setUser(uuid: string | User) {
    this.setOwner(typeof uuid === "string" ? uuid : uuid.getPrimaryKey());
  }
}
