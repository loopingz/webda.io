import { OwnerModel } from "./ownermodel";
import { ModelLink } from "./relations";
import { User } from "./user";

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
   * User linked to this ident
   */
  _user: ModelLink<User>;
  /**
   * If the ident is new
   */
  __new: boolean;
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

  getUser(): ModelLink<User> {
    return this._user;
  }

  getEmail(): string {
    return this.email;
  }

  setUser(user) {
    this._user = user;
  }

  getType() {
    return this._type;
  }

  setType(type) {
    this._type = type;
  }
}
