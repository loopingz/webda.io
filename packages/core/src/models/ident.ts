import type { LoadParameters, SelfJSONed, Settable } from "@webda/models";
import { OwnerModel } from "./ownermodel.js";
import type { User } from "./user.js";

/** OAuth tokens associated with an identity provider */
export class IdentTokens {
  refresh: string;
  access: string;
}

/**
 * First basic model for Ident
 * @class
 * @WebdaModel
 */
export class Ident extends OwnerModel {
  constructor(data?: Settable<Ident>) {
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
  __tokens: IdentTokens;
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

  /** Get the email for this ident */
  getEmail(): string {
    return this.email;
  }

  /** Get the provider type */
  getType() {
    return this._type;
  }

  /** Set the provider type */
  setType(type) {
    this._type = type;
  }

  /** Get the user who owns this ident */
  getUser() {
    return this.getOwner();
  }

  /** Set the user who owns this ident */
  setUser(uuid: string | User) {
    this.setOwner(typeof uuid === "string" ? uuid : uuid.getPrimaryKey());
  }
}
