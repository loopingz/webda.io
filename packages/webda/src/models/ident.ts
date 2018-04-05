"use strict";
import { CoreModel } from './coremodel';

class IdentTokens {
  refresh: string
  access: string
}
/**
 * First basic model for Ident
 * @class
 */
class Ident extends CoreModel {

  type: string
  uid: string
  profile: any
  tokens: IdentTokens
  static init(type, uid, accessToken, refreshToken, profile) : Ident {
    var obj = new Ident({});
    obj.type = type.toLowerCase();
    obj.uid = uid.toLowerCase();
    obj.uuid = obj.uid + "_" + obj.type;
    obj.profile = profile;
    obj.tokens = new IdentTokens();
    obj.tokens.refresh = refreshToken;
    obj.tokens.access = accessToken;
    return obj;
  }

  getUser() {
    return this.user;
  }

  setUser(user) {
    this.user = user;
  }
}

export { Ident };
