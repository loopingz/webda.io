import { _extend } from "../core";
import * as jwt from "jsonwebtoken";

/**
 * Object that handle the session
 *
 * To get stateless server the session is encrypted inside a cookie, so you should not store large amount of data in it
 * If you need big session then i would suggest to use a Memcache store with the user.uuid as a key
 *
 * It is part of the core framework implementation, you should not rely on any method of this object, as the implementation can change if needed
 * An object session is exposed by the framework, so use this one ( for now it is a SecureCookie.getProxy() but can evolve )
 *
 * The object use Object.observe if available or try Proxy in other case, so old JS VM won't run it
 */
class SecureCookie {
  _algo: string;
  _secret: string;
  _changed: boolean;
  _options: any;
  _raw: string;
  userId: string;
  identUsed: string;
  // Expiration date
  exp: number;

  /** @ignore */
  constructor(options, data) {
    this._algo = "aes-256-ctr";
    this._secret = options.secret;
    this._options = options;
    this._changed = false;
    if (data === undefined || data === "") {
      return;
    }
    if (typeof data === "string") {
      this._raw = data;
      try {
        _extend(this, jwt.verify(data, this._secret));
      } catch (err) {
        // We ignore bad cookies
      }
    } else {
      _extend(this, data);
    }
  }

  getProxy() {
    // Should use Proxy if available
    if (Proxy != undefined) {
      // Proxy implementation
      return new Proxy(this, {
        set: (obj, prop, value) => {
          obj[prop] = value;
          if (prop !== "_changed") {
            this._changed = true;
          }
          return true;
        }
      });
    }
  }

  login(userId, identUsed) {
    this.userId = userId;
    this.identUsed = identUsed;
  }

  isLogged() {
    return this.userId !== undefined;
  }

  destroy() {
    for (let prop in this) {
      if (prop[0] === "_") {
        continue;
      }
      delete this[prop];
    }
    this._changed = true;
  }

  getIdentUsed() {
    return this.identUsed;
  }

  getUserId() {
    return this.userId;
  }

  logout() {
    delete this.userId;
  }

  toJSON() {
    let data: any = {};
    for (let prop in this) {
      if (prop[0] === "_") {
        continue;
      }
      data[prop] = this[prop];
    }
    return data;
  }

  save() {
    if (this.needSave()) {
      this.exp = Math.floor(Date.now() / 1000) + 24 * 30 * 3600;
      // Transform the cookie to a plain object
      return jwt.sign(JSON.parse(JSON.stringify(this)), this._secret);
    }
    return this._raw;
  }

  needSave() {
    return this._changed;
  }
}

export { SecureCookie };
