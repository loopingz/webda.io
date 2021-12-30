import * as jwt from "jsonwebtoken";
import { WebdaError } from "../core";
import { Context } from "./context";
import { serialize as cookieSerialize } from "cookie";

/**
 * Cookie cannot be more than 4096, so we split them by this constant
 * @hidden
 */
const SPLIT = 4096;

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
 *
 * You cannot store variables starting with _ in the session if you do use them they won't be persist, so it can be used to add some context
 *
 * @category CoreFeatures
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
      throw new WebdaError("SECRET_INVALID", "Secret must be at least 256 characters");
    }
    let cookies = {};
    if (ctx.getHttpContext()) {
      cookies = ctx.getHttpContext().getCookies();
    }
    this._raw = this.getRaw(name, cookies);
    Object.assign(this, datas);
    if (this._raw) {
      try {
        Object.assign(this, jwt.verify(this._raw, this._secret));
      } catch (err) {
        // We ignore bad cookies
        ctx.log("WARN", "Ignoring bad cookie", this._raw, "from", ctx.getHttpContext());
      }
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
    if (!this.needSave()) {
      return;
    }
    var params = {
      path: "/",
      domain: ctx.getHttpContext().getHost(),
      httpOnly: true,
      secure: ctx.getHttpContext().getProtocol() == "https",
      maxAge: 86400 * 7,
      sameSite: "Lax"
    };
    // Get default cookie value from config
    let cookie = ctx.parameter("cookie");
    if (cookie !== undefined) {
      params = { ...params, ...cookie };
    }
    let value = jwt.sign(JSON.parse(JSON.stringify(this)), this._secret);
    this.sendCookie(ctx, this._name, value, params);
    // Transform the cookie to a plain object
  }

  /**
   * Will send the cookie to context and split it
   * if needed as max length for cookies are 4096
   * including the params (the whole Set-Cookie header)
   *
   * @param ctx to send cookie to
   * @param name name of the cookie
   * @param value of the cookie
   * @param params for the cookie
   */
  sendCookie(ctx: Context, name: string, value: string, params: { [key: string]: string | boolean | number }) {
    let j = 1;
    let cookieName = name;
    let limit;
    const mapLength = cookieSerialize(name, "", params).length;
    for (let i = 0; i < value.length; ) {
      limit = SPLIT - mapLength;
      if (j > 1) {
        cookieName = `${name}${j}`;
        limit--;
      }
      ctx.cookie(cookieName, value.substr(i, limit), params);
      j++;
      i += limit;
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

  /**
   * Login a user
   *
   * If using an Authentication Service use the `login` method of the service instead
   * It will keep the right event to be emitted
   *
   * @param userId
   * @param identUsed
   */
  login(userId, identUsed) {
    this.userId = userId;
    this.identUsed = identUsed;
  }

  /**
   * @returns true if a user id is known
   */
  isLogged() {
    return this.userId !== undefined;
  }

  needSave() {
    return true;
  }

  async init() {
    // For future use
  }
}

export { SecureCookie, SessionCookie };
