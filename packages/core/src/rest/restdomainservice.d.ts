import { DomainServiceParameters, ModelsOperationsService } from "../services/domainservice.js";
import { WebContext } from "../contexts/webcontext.js";
import type { ModelClass } from "@webda/models";
/**
 *
 */
export declare class RESTDomainServiceParameters extends DomainServiceParameters {
    /**
     * Expose the OpenAPI
     *
     * @default true if debug false otherwise
     */
    exposeOpenAPI: boolean;
    /**
     * Swagger version to use
     *
     * https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui.css
     * https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui-bundle.js
     * https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui-standalone-preset.js
     *
     * TODO Add renovatebot regex
     */
    swaggerVersion: string;
    /**
     * When to query
     */
    url: string;
}
/**
 * Expose all models via a REST API
 * @WebdaModda
 */
export declare class RESTDomainService<T extends RESTDomainServiceParameters = RESTDomainServiceParameters> extends ModelsOperationsService<T> {
    /**
     * OpenAPI cache
     */
    openapiContent: string;
    /**
     * Override to fallback on isDebug for exposeOpenAPI
     * @returns
     */
    resolve(): this;
    /**
     * Handle one model and expose it based on the service
     * @param model
     * @param name
     * @param context
     * @returns
     */
    handleModel(model: ModelClass, name: string, context: any): boolean;
    /**
     * Serve the openapi with the swagger-ui
     * @param ctx
     */
    openapi(ctx: WebContext): Promise<void>;
}
//# sourceMappingURL=restdomainservice.d.ts.map