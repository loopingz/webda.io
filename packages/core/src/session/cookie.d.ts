import { type CookieSerializeOptions } from "cookie";
import type { JWTOptions } from "../services/icryptoservice.js";
import type { HttpContext } from "../contexts/httpcontext.js";
import { IWebContext } from "../contexts/icontext.js";
import { Duration } from "@webda/utils";
/**
 * Cookie Options
 */
export declare class CookieOptions implements Omit<CookieSerializeOptions, "domain"> {
    /**
     * @default lax
     */
    sameSite?: "none" | "strict" | "lax";
    /**
     * if true domain will be set to the request hostname
     * if undefined no domain will be output (browser will use the current domain and only this one)
     * if a string is provided it will be used as the domain
     *
     * When provided a domain is setting the cookie to be available to all subdomains
     */
    domain?: string | true;
    /**
     * Duration storage
     */
    _maxAge?: Duration;
    /**
     * @minimum 1
     * @default 7d
     */
    set maxAge(value: string | number);
    get maxAge(): number;
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
     * @default undefined
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
    constructor(options: Partial<CookieOptions>, httpContext?: HttpContext);
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
 */
export declare class SecureCookie {
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
    static load(name: string, session: object, context: IWebContext, options?: JWTOptions): Promise<any>;
    /**
     * Send a cookie, split it if required
     *
     * @param name
     * @param context
     * @param data
     * @param options
     */
    static save(name: string, context: IWebContext, data: any, options?: JWTOptions, cookieOptions?: Partial<CookieOptions>): Promise<void>;
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
    static sendCookie(ctx: IWebContext, name: string, value: string, params: CookieOptions): void;
}
//# sourceMappingURL=cookie.d.ts.map