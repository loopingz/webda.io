"use strict";

/**
 * First basic model for Ident
 * Will evolve with version 0.2 and Model addition
 *
 * @class
 */
class Ident {
  /**
   * @ignore
   */
  constructor(type, uid, accessToken, refreshToken) {
    this.type = type;
    this.uid = uid;
    this.uuid = uid + "_" + type;
    this.tokens = {};
    this.tokens.refresh = refreshToken;
    this.tokens.access = accessToken;
  }

  getUser() {
    return this.user;
  }

  setUser(user) {
    this.user = user;
  }
}

module.exports = Ident