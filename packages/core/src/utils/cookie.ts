import { _extend } from "../core";
import * as jwt from "jsonwebtoken";
import { Context } from "./context";

/**
 * Cookie cannot be more than 4096, so we split them by this constant
 * @hidden
 */
const SPLIT = 4000;

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
  _name: string;
  _algo: string;
  _secret: string;
  _changed: boolean;
  _raw: string;
  [key: string]: any;

  /** @ignore */
  constructor(name: string, options: any, ctx: Context, datas: any = {}) {
    this._name = name;
    this._algo = options.algo || "aes-256-ctr";
    this._secret = options.secret;
    if (!this._secret || this._secret.length < 256) {
      throw new Error("Secret must be at least 256 characters");
    }
    let cookies = {};
    if (ctx.getHttpContext()) {
      cookies = ctx.getHttpContext().getCookies();
    }
    this._raw = this.getRaw(name, cookies);
    _extend(this, datas);
    try {
      _extend(this, jwt.verify(this._raw, this._secret));
    } catch (err) {
      // We ignore bad cookies
    }
    // Set changed to false after initial modification
    this._changed = false;
    ctx.addListener("end", () => {
      this.save(ctx);
    });
  }

  getRaw(name, cookies): string {
    if (!cookies) {
      return "";
    }
    let res = cookies[name] || "";
    let j = 2;
    let cookieName = `${name}${j++}`;
    while (cookies[cookieName]) {
      res += cookies[cookieName];
      cookieName = `${name}${j++}`;
    }
    return res;
  }

  getProxy() {
    // Should use Proxy if available
    if (Proxy != undefined) {
      // Proxy implementation
      return new Proxy(this, {
        set: (obj, prop, value) => {
          // @ts-ignore
          obj[prop] = value;
          if (prop !== "_changed") {
            this._changed = true;
          }
          return true;
        }
      });
    }
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

  save(ctx: Context) {
    if (this.needSave()) {
      var params = {
        path: "/",
        domain: ctx.getHttpContext().getHost(),
        httpOnly: true,
        secure: false,
        maxAge: 86400 * 7
      };
      if (ctx.getHttpContext().getProtocol() == "https") {
        params.secure = true;
      }
      // Not sure here
      let cookie = ctx.parameter("cookie");
      if (cookie !== undefined) {
        if (cookie.domain) {
          params.domain = cookie.domain;
        } else {
          params.domain = ctx.getHttpContext().getHost();
        }
        if (cookie.maxAge) {
          params.maxAge = cookie.maxAge;
        }
      }
      let value = jwt.sign(JSON.parse(JSON.stringify(this)), this._secret);
      this.sendCookie(ctx, this._name, value, params);
      // Transform the cookie to a plain object
      return;
    } else {
      console.log("Do not need update", this._name);
    }
  }

  sendCookie(ctx, name, value, params) {
    let j = 1;
    let cookieName = name;
    for (let i = 0; i < value.length; i += SPLIT) {
      if (j > 1) {
        cookieName = `${name}${j}`;
      }
      ctx.cookie(cookieName, value.substr(i, SPLIT), params);
      j++;
    }
  }

  needSave() {
    return this._changed;
  }
}

class SessionCookie extends SecureCookie {
  constructor(ctx: Context) {
    super(
      ctx.getWebda().parameter("sessionName") || "webda",
      {
        secret: ctx.getWebda().parameter("sessionSecret")
      },
      ctx
    );
  }

  userId: string;
  identUsed: string;

  getIdentUsed() {
    return this.identUsed;
  }

  getUserId() {
    return this.userId;
  }

  logout() {
    delete this.userId;
  }

  login(userId, identUsed) {
    this.userId = userId;
    this.identUsed = identUsed;
  }

  isLogged() {
    return this.userId !== undefined;
  }

  needSave() {
    return true;
  }

  async init() {}
}

export { SecureCookie, SessionCookie };
