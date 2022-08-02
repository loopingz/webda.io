import { ModelLink } from "./coremodel";
import { OwnerModel } from "./ownermodel";
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
  _type: string;
  uid: string;
  __profile: any;
  __tokens: IdentTokens;
  _lastUsed: Date;
  /**
   * @SchemaIgnore
   */
  _user: ModelLink<User, "_idents">;
  __new: boolean;
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

  static init(
    type: string,
    uid: string,
    accessToken: string = "",
    refreshToken: string = "",
    profile: object = {}
  ): Ident {
    const obj = new Ident();
    obj._type = type.toLowerCase();
    obj.uid = uid.toLowerCase();
    if (obj._type === "email") {
      obj.email = obj.uid;
    }
    obj.uuid = obj.uid + "_" + obj._type;
    obj.__profile = profile;
    obj.__tokens = new IdentTokens();
    obj.__tokens.refresh = refreshToken;
    obj.__tokens.access = accessToken;
    return obj;
  }

  getUser() {
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
