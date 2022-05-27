import { CookieSerializeOptions, serialize as cookieSerialize } from "cookie";
import { JWTOptions } from "../services/cryptoservice";
import { Context } from "./context";
import { HttpContext } from "./httpcontext";

/**
 * Cookie cannot be more than 4096, so we split them by this constant
 * @hidden
 */
const SPLIT = 4096;

/**
 * Cookie Options
 */
export class CookieOptions implements CookieSerializeOptions {
  /**
   * @default lax
   */
  sameSite?: "none" | "strict" | "lax";
  /**
   * @default to request hostname
   */
  domain?: string;
  /**
   * @minimum 1
   * @default 86400 * 7
   */
  maxAge?: number;
  /**
   * @default /
   */
  path?: string;
  /**
   * @default true
   */
  httpOnly?: boolean;
  /**
   * If not set will be true if https request and false otherwise
   * If defined it will be set to the value
   */
  secure?: boolean;
  /**
   * Name of the cookie
   */
  name?: string;

  /**
   * Load with default value
   * @param options
   * @param httpContext
   */
  constructor(options: Partial<CookieOptions>, httpContext?: HttpContext) {
    Object.assign(this, options);
    this.httpOnly ??= true;
    this.path ??= "/";
    this.maxAge ??= 86400 * 7;
    this.sameSite ??= "lax";
    this.name ??= "webda";
    if (httpContext) {
      this.domain ??= httpContext.getHostName();
      this.httpOnly ??= httpContext.getProtocol() === "https:";
    }
  }
}

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
 * @WebdaModel
 */
export class SecureCookie {
  /**
   * Load cookie
   *
   * It manages the split of the cookie to 4096 if required
   *
   * @param name cookie name
   * @param options
   * @param context
   * @returns
   */
  static async load(name: string, context: Context, options?: JWTOptions) {
    let cookies = {};
    let raw = "";
    let session = context.newSession();

    // No http context
    if (!context.getHttpContext()) {
      return session;
    }

    cookies = context.getHttpContext().getCookies();
    if (cookies) {
      raw = cookies[name] || "";
      let j = 2;
      let cookieName = `${name}${j++}`;
      while (cookies[cookieName]) {
        raw += cookies[cookieName];
        cookieName = `${name}${j++}`;
      }
    }

    // No cookie found or empty
    if (raw === "") {
      return session;
    }

    try {
      return Object.assign(session, await context.getWebda().getCrypto().jwtVerify(raw, options));
    } catch (err) {
      context.log("WARN", "Ignoring bad cookie", `'${raw}'`, "from", context.getHttpContext());
      return session;
    }
  }

  /**
   * Send a cookie, split it if required
   *
   * @param name
   * @param context
   * @param data
   * @param options
   */
  static async save(
    name: string,
    context: Context,
    data: any,
    options?: JWTOptions,
    cookieOptions?: Partial<CookieOptions>
  ) {
    let value = await context.getWebda().getCrypto().jwtSign(Object.assign({}, data), options);
    this.sendCookie(context, name, value, new CookieOptions(cookieOptions, context.getHttpContext()));
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
  static sendCookie(ctx: Context, name: string, value: string, params: CookieOptions) {
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
      ctx.cookie(cookieName, value.substring(i, i + limit), params);
      j++;
      i += limit;
    }
  }
}
