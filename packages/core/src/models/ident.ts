import { Model, ModelLink, ModelRef } from "./model";
import { AbstractOwnerModel, OwnerModel } from "./ownermodel";
import type { User } from "./user";
import { UuidModel } from "./uuid";

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
  _lastUsed: Date;
  /**
   * If the ident is validated
   */
  _failedLogin: number;
  /**
   * If EmailIdent
   */
  _lastValidationEmail?: number;
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

  getEmail(): string {
    return this.email;
  }

  getType() {
    return this._type;
  }

  setType(type) {
    this._type = type;
  }

  getUser() {
    return this.getOwner();
  }

  setUser(uuid: string) {
    this.setOwner(uuid);
  }
}
