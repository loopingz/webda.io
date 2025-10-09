import { IWebContext } from "../contexts/icontext.js";
import { RegExpValidator } from "@webda/utils";
import { RequestFilter } from "./irest.js";

/**
 * Filter request based on their origin
 *
 * @category CoreFeatures
 */
export class OriginFilter implements RequestFilter<IWebContext> {
  regexs: RegExpValidator;
  constructor(origins: string[]) {
    this.regexs = new RegExpValidator(origins);
  }
  /**
   *
   * @param context
   * @returns
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
