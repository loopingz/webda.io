import { IWebContext } from "../contexts/icontext.js";
import { RegExpValidator } from "@webda/utils";
import { CORSFilter, RequestFilter } from "./irest.js";
import { useLog } from "../loggers/hooks.js";

/**
 * Filter request based on their origin
 *
 * @category CoreFeatures
 */
export class OriginFilter implements RequestFilter<IWebContext> {
  regexs: RegExpValidator;
  /** Create a new OriginFilter
   * @param origins - allowed origin patterns
   */
  constructor(origins: string[]) {
    this.regexs = new RegExpValidator(origins);
  }
  /**
   *
   * @param context - the execution context
   * @returns true if the condition is met
   */
  async checkRequest(context: IWebContext): Promise<boolean> {
    const httpContext = context.getHttpContext();
    return this.regexs.validate(httpContext.hostname) || this.regexs.validate(httpContext.origin);
  }
}

/**
 * Authorize requests based on the website
 */
export class WebsiteOriginFilter implements RequestFilter<IWebContext> {
  websites: string[] = [];
  /** Create a new WebsiteOriginFilter
   * @param website - allowed website URL or array of URLs
   */
  constructor(website: any) {
    if (!Array.isArray(website)) {
      if (typeof website === "object") {
        this.websites.push(website.url);
      } else {
        this.websites.push(website);
      }
    } else {
      this.websites = [...website];
    }
  }

  /**
   * Verify that the request origin or host is in the allowed websites list
   * @param context - the execution context
   * @returns true if the condition is met
   */
  async checkRequest(context: IWebContext): Promise<boolean> {
    const httpContext = context.getHttpContext();
    if (
      this.websites.indexOf(httpContext.origin) >= 0 ||
      this.websites.indexOf(httpContext.host) >= 0 ||
      this.websites.indexOf("*") >= 0
    ) {
      return true;
    }
    return false;
  }
}

/**
 * An allowed origin, parsed from the configuration
 */
interface AllowedOrigin {
  protocol: string;
  /** Lowercase hostname, without the `*.` prefix for a wildcard */
  hostname: string;
  port: string;
  /** Match the subdomains of hostname (never hostname itself) */
  wildcard: boolean;
}

/**
 * CORS filter on the request `Origin` header
 *
 * Each entry is an origin compared exactly (scheme, host, port; host case-insensitively), not a regular
 * expression: `https://ui.example.com`, `http://localhost:5173`. A `*.` host prefix matches the subdomains
 * only (`https://*.example.com` accepts `https://a.example.com`, not `https://example.com`), and `"*"` accepts
 * any origin. The opaque `null` origin is never accepted.
 *
 * @category CoreFeatures
 */
export class CorsOriginFilter implements CORSFilter<IWebContext> {
  /** Accept any well-formed origin */
  protected any: boolean = false;
  protected origins: AllowedOrigin[] = [];

  /**
   * @param origins - allowed origins, or `"*"`
   */
  constructor(origins: string | string[]) {
    for (const entry of Array.isArray(origins) ? origins : [origins]) {
      if (entry === "*") {
        this.any = true;
        continue;
      }
      const wildcard = /^[a-z][a-z0-9+.-]*:\/\/\*\./i.test(entry);
      const url = CorsOriginFilter.parse(wildcard ? entry.replace("://*.", "://") : entry);
      if (!url) {
        useLog("WARN", `Ignoring invalid CORS origin '${entry}'`);
        continue;
      }
      this.origins.push({ protocol: url.protocol, hostname: url.hostname, port: url.port, wildcard });
    }
  }

  /**
   * Parse an origin: scheme, host and optional port only
   * @param origin - the origin
   * @returns the URL, undefined when it is not a bare origin
   */
  protected static parse(origin: string): URL | undefined {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return undefined;
    }
    if (url.origin === "null") return undefined;
    // A bare origin serializes back to itself (no path, query or credentials), the default port being optional
    const given = origin.toLowerCase();
    const canonical = url.origin.toLowerCase();
    const defaultPort = { "https:": "443", "http:": "80" }[url.protocol];
    return given === canonical || (defaultPort && given === `${canonical}:${defaultPort}`) ? url : undefined;
  }

  /**
   * @param origin - the request `Origin` header
   * @returns true if the origin is allowed
   */
  matches(origin: string | undefined): boolean {
    if (!origin || origin === "null") return false;
    const url = CorsOriginFilter.parse(origin);
    if (!url) return false;
    if (this.any) return true;
    return this.origins.some(allowed => {
      if (allowed.protocol !== url.protocol || allowed.port !== url.port) return false;
      return allowed.wildcard ? url.hostname.endsWith(`.${allowed.hostname}`) : url.hostname === allowed.hostname;
    });
  }

  /**
   * @param context - the execution context
   * @returns true if the request `Origin` header is allowed
   */
  async checkRequest(context: IWebContext): Promise<boolean> {
    return this.matches(context.getHttpContext().getUniqueHeader("origin"));
  }
}
