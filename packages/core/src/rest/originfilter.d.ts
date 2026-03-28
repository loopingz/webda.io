import { IWebContext } from "../contexts/icontext.js";
import { RegExpValidator } from "@webda/utils";
import { RequestFilter } from "./irest.js";
/**
 * Filter request based on their origin
 *
 * @category CoreFeatures
 */
export declare class OriginFilter implements RequestFilter<IWebContext> {
    regexs: RegExpValidator;
    constructor(origins: string[]);
    /**
     *
     * @param context
     * @returns
     */
    checkRequest(context: IWebContext): Promise<boolean>;
}
/**
 * Authorize requests based on the website
 */
export declare class WebsiteOriginFilter implements RequestFilter<IWebContext> {
    websites: string[];
    constructor(website: any);
    checkRequest(context: IWebContext): Promise<boolean>;
}
//# sourceMappingURL=originfilter.d.ts.map