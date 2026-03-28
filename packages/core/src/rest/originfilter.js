import { RegExpValidator } from "@webda/utils";
/**
 * Filter request based on their origin
 *
 * @category CoreFeatures
 */
export class OriginFilter {
    constructor(origins) {
        this.regexs = new RegExpValidator(origins);
    }
    /**
     *
     * @param context
     * @returns
     */
    async checkRequest(context) {
        const httpContext = context.getHttpContext();
        return this.regexs.validate(httpContext.hostname) || this.regexs.validate(httpContext.origin);
    }
}
/**
 * Authorize requests based on the website
 */
export class WebsiteOriginFilter {
    constructor(website) {
        this.websites = [];
        if (!Array.isArray(website)) {
            if (typeof website === "object") {
                this.websites.push(website.url);
            }
            else {
                this.websites.push(website);
            }
        }
        else {
            this.websites = [...website];
        }
    }
    async checkRequest(context) {
        const httpContext = context.getHttpContext();
        if (this.websites.indexOf(httpContext.origin) >= 0 ||
            this.websites.indexOf(httpContext.host) >= 0 ||
            this.websites.indexOf("*") >= 0) {
            return true;
        }
        return false;
    }
}
//# sourceMappingURL=originfilter.js.map