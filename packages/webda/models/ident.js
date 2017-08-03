"use strict";
const CoreModel = require('./coremodel');
/**
 * First basic model for Ident
 * @class
 */
class Ident extends CoreModel {

  static init(type, uid, accessToken, refreshToken, profile) {
    var obj = new Ident({});
    obj.type = type;
    obj.uid = uid;
    obj.uuid = uid + "_" + type;
    obj.profile = profile;
    obj.tokens = {};
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

module.exports = Ident