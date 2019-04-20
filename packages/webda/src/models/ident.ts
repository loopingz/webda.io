"use strict";
import { CoreModel } from "./coremodel";

class IdentTokens {
  refresh: string;
  access: string;
}
/**
 * First basic model for Ident
 * @class
 */
class Ident extends CoreModel {
  _type: string;
  uid: string;
  __profile: any;
  __tokens: IdentTokens;
  _lastUsed: Date;
  _user: string;
  __new: boolean;
  _failedLogin: number;
  _lastValidationEmail: number;
  _validation: Date;

  static init(type, uid, accessToken, refreshToken, profile): Ident {
    var obj = new Ident();
    obj._type = type.toLowerCase();
    obj.uid = uid.toLowerCase();
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

export { Ident, IdentTokens };
