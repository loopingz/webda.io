import { SelfJSONed } from "@webda/models";
import { OwnerModel } from "./ownermodel";
import type { User } from "./user";

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
  constructor(data?: Partial<SelfJSONed<Ident>>) {
    super(data);
    this.deserialize(data || {});
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

  setUser(uuid: string | User) {
    this.setOwner(typeof uuid === "string" ? uuid : uuid.getPrimaryKey());
  }

  deserialize(data: Partial<SelfJSONed<Ident>>): this {
    super.deserialize(data);
    this._type = data._type || "";
    this.uid = data.uid || "";
    this.__profile = data.__profile;
    this.__tokens = data.__tokens || { access: "", refresh: "" };
    this._lastUsed = data._lastUsed ? new Date(data._lastUsed) : undefined;
    this._failedLogin = data._failedLogin || 0;
    this._lastValidationEmail = data._lastValidationEmail || 0;
    this._validation = data._validation ? new Date(data._validation) : undefined;
    this.email = data.email;
    this.provider = data.provider;
    return this;
  }
}
