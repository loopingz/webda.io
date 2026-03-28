import { HttpMethodType } from "../contexts/httpcontext.js";
import type { IRouter, RequestFilter, RouteInfo } from "./irest.js";
import type { OpenAPIV3 } from "openapi-types";
import { IWebContext } from "../contexts/icontext.js";
import { Service } from "../services/service.js";
import { WebContext } from "../contexts/webcontext.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Storable } from "@webda/models";
export declare class RouterParameters extends ServiceParameters {
    /**
     * Display a WARNING if a route is overriden
     */
    overrideWarning?: boolean;
}
/**
 * Manage Route resolution
 * @category CoreFeatures
 *
 * @WebdaModda
 */
export declare class Router<T extends RouterParameters = RouterParameters> extends Service<T> implements IRouter {
    /**
     * Routes
     */
    protected routes: Map<string, RouteInfo[]>;
    /**
     *
     */
    protected pathMap: {
        url: string;
        config: RouteInfo;
    }[];
    protected models: Map<string, string>;
    /**
     * Request filters to apply
     */
    private _requestFilters;
    /**
     * Request filters to apply for CORS
     */
    private _requestCORSFilters;
    /**
     * Registration of a model
     * @param model
     * @param url
     */
    registerModelUrl(model: string, url: string): void;
    resolve(): this;
    /**
     * Return the route for model
     * @param model
     * @returns
     */
    getModelUrl(model: string | Storable): string;
    /**
     * Include prefix to the url if not present
     * @param url
     * @returns
     */
    getFinalUrl(url: string): string;
    /**
     * Return routes
     * @returns
     */
    getRoutes(): Map<string, RouteInfo[]>;
    /**
     * Add a route dynamicaly
     *
     * @param {String} url of the route can contains dynamic part like {uuid}
     * @param {Object} info the type of executor
     */
    addRouteToRouter(url: string, info: RouteInfo): void;
    /**
     * Remove a route dynamicly
     *
     * @param {String} url to remove
     */
    removeRoute(url: string, info?: RouteInfo): void;
    /**
     * Reinit all routes
     *
     * It will readd the URITemplates if needed
     * Sort all routes again
     */
    remapRoutes(): void;
    protected comparePath(a: any, b: any): number;
    /**
     * @hidden
     */
    protected initURITemplates(config: Map<string, RouteInfo[]>): void;
    /**
     * Get all method for a specific url
     * @param config
     * @param method
     * @param url
     */
    getRouteMethodsFromUrl(url: any): HttpMethodType[];
    /**
     * Get the route from a method / url
     */
    getRouteFromUrl(ctx: IWebContext, method: HttpMethodType, url: string): RouteInfo;
    protected getOpenAPISchema(schema: any): any;
    /**
     * Add all known routes to paths
     *
     * @param openapi to complete
     * @param skipHidden add hidden routes or not
     */
    completeOpenAPI(openapi: OpenAPIV3.Document, skipHidden?: boolean): void;
    execute(ctx: WebContext<any, any, any>): Promise<void>;
    /**
     * Verify if a request can be done
     *
     * @param context Context of the request
     */
    protected checkRequest(ctx: IWebContext): Promise<boolean>;
    /**
     * Verify if an origin is allowed to do request on the API
     *
     * @param context Context of the request
     */
    protected checkCORSRequest(ctx: IWebContext): Promise<boolean>;
    /**
     * Export OpenAPI
     * @param skipHidden
     * @returns
     */
    exportOpenAPI(skipHidden?: boolean): OpenAPIV3.Document;
    /**
     * Register a request filtering
     *
     * Will apply to all requests regardless of the devMode
     * @param filter
     */
    registerRequestFilter(filter: RequestFilter): void;
    /**
     * Register a CORS request filtering
     *
     * Does not apply in devMode
     * @param filter
     */
    registerCORSFilter(filter: RequestFilter): void;
}
//# sourceMappingURL=router.d.ts.map