import type { IWebContext } from "../contexts/icontext.js";
import { Service } from "./service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
/**
 * ResourceService parameters
 */
export declare class ResourceServiceParameters extends ServiceParameters {
    /**
     * URL on which to serve the content
     *
     * @default "resources"
     */
    url?: string;
    /**
     * Folder to server
     *
     * @default "." + url
     */
    folder?: string;
    /**
     * Add the / root to redirect to /{url}
     *
     * @default false
     */
    rootRedirect?: boolean;
    /**
     * Index file
     *
     * @default index.html
     */
    index?: string;
    /**
     * Return the index file for any unfound resource
     * Useful for single page application
     *
     * @default true
     */
    indexFallback?: boolean;
    /**
     * Cache control header to set
     * @default "public, max-age=31536000"
     */
    cacheControl?: string;
    /**
     * Cache control for index file
     * SPA usually do not cache the index file
     *
     * @default "no-cache, no-store, must-revalidate"
     */
    indexCacheControl?: string;
    /**
     * Serve also . prefixed files
     * . files usually have some secrets and should not be served
     *
     * @default false
     */
    allowHiddenFiles?: boolean;
    constructor(params: any);
}
/**
 * This service expose a folder as web
 *
 * It is the same as `static` on `express`
 *
 * @category CoreServices
 * @WebdaModda
 */
declare class ResourceService<T extends ResourceServiceParameters = ResourceServiceParameters> extends Service<T> {
    /**
     * Resolved path to the folder to serve
     */
    _resolved: string;
    /**
     * If serving just one file
     */
    fileOnly: boolean;
    /**
     * Resolve resource folder
     */
    resolve(): this;
    /**
     * Init the routes
     */
    initRoutes(): void;
    /**
     * Handle / request and redirect to the resources folder
     *
     * @param ctx
     */
    _redirect(ctx: IWebContext): void;
    /**
     * Serve the folder by itself, doing the mime detection
     *
     * @param ctx
     */
    _serve(ctx: IWebContext): Promise<void>;
}
export { ResourceService };
//# sourceMappingURL=resource.d.ts.map