import type { Authentication } from "./authentication.js";
import { Service } from "./service.js";
import { RequestFilter } from "../rest/irest.js";
import { WebContext } from "../contexts/webcontext.js";
import { Counter } from "../metrics/metrics.js";
import { RegExpStringValidator } from "@webda/utils";
import { ServiceParameters } from "../services/serviceparameters.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { EventWithContext } from "../events/events.js";
export interface EventOAuthToken extends EventWithContext {
    /**
     * Provider from
     */
    provider: string;
    /**
     * token if we got a post of a JWT token
     * callback if it was by http url
     */
    type: "token" | "callback";
    /**
     * Profile comming from the provider
     */
    [key: string]: any;
}
/**
 * OAuth return definition
 */
export interface OAuthReturn {
    profile: any;
    identId: string;
}
export declare class OAuthServiceParameters extends ServiceParameters {
    /**
     * URL to use for expose
     *
     * The default value varying based on implementation
     * It should by default be the provider name in lowercase
     *
     * @SchemaOptional
     */
    url: string;
    /**
     * Scope to request on OAuth flow
     *
     * @defaut ["email"]
     */
    scope: string[];
    /**
     * If set to true it will add a ${url}/scope
     * So client can anticipate the requested scope
     *
     * This is useful when using the client api to generate
     * token. This way the service can request the wanted scope
     *
     * @default false
     */
    exposeScope: boolean;
    /**
     * List of URIs authorized for redirect post authorization
     *
     * @default []
     */
    authorized_uris?: string[];
    /**
     * Default redirect_uri
     *
     * @default ${url}/callback
     */
    redirect_uri?: string;
    /**
     * Allow direct connection without a referer
     *
     * @default false
     */
    no_referer: boolean;
    /**
     * Name of the authentication service to use if exist
     * @default Authentication
     */
    authenticationService: string;
    load(params: any): this;
}
export type OAuthEvents = {
    "OAuth.Callback": EventOAuthToken;
};
/**
 * OAuth Session variables
 */
export interface OAuthSession {
    /**
     * Store within an oauth object
     */
    oauth?: {
        /**
         * state sent
         */
        state?: string;
        /**
         * redirect after auth
         */
        redirect?: string;
        /**
         * Profile retrieved
         */
        profile?: any;
    };
}
/**
 * OAuth service implementing the default OAuth workflow
 * It is abstract as it does not manage any provider as is
 */
export declare abstract class OAuthService<T extends OAuthServiceParameters = OAuthServiceParameters, E extends OAuthEvents = OAuthEvents> extends Service<T, E> implements RequestFilter<WebContext> {
    _authenticationService: Authentication;
    /**
     * @override
     */
    metrics: {
        login: Counter;
    };
    authorized_uris: RegExpStringValidator;
    /**
     * Ensure default parameter url
     */
    constructor(name: string, params?: any);
    initMetrics(): void;
    /**
     * Allow callback referer to access this url no matter what
     * @param context
     * @returns
     */
    checkRequest(context: WebContext): Promise<boolean>;
    /**
     * Resolve dynamic dependancy
     */
    resolve(): this;
    /**
     * Get OAuth callback query parameters
     * @returns
     */
    getCallbackQueryParams(): {
        name: string;
        required: boolean;
    }[];
    /**
     * Add routes for the authentication
     */
    initRoutes(): void;
    /**
     * Expose the scope used by the authentication
     * @param ctx
     */
    _scope(ctx: OperationContext): void;
    /**
     * Define if this provider allow authentication by tokens
     * @returns
     */
    hasToken(): boolean;
    /**
     * Check if the url is authorized
     * @param redirect
     * @param context
     * @returns
     */
    isAuthorizedUri(redirect: string, context: WebContext): boolean;
    /**
     * Redirect to the OAuth provider
     *
     * The calling url must be and authorized_uris if defined
     * @param ctx
     */
    _redirect(ctx: WebContext): void;
    /**
     * Handle a token return
     *
     * This is private to avoid any override
     * @param context
     */
    private _token;
    /**
     * Handle a standard url callback
     *
     * This is private to avoid any override
     * @param ctx
     */
    private _callback;
    /**
     * Once approved by the OAuth provider this will do the common task
     * @param ctx
     * @param identId
     * @param profile
     */
    handleReturn(ctx: WebContext, identId: string, profile: any, _tokens?: any): Promise<void>;
    /**
     * Return default url for the provider
     */
    abstract getDefaultUrl(): string;
    /**
     * Return the different sources of url from the provider
     */
    abstract getCallbackReferer(): RegExp[];
    /**
     * Return the name of the provider
     */
    abstract getName(): string;
    /**
     * Generate the authorization url to the provider
     *
     * @param redirect_uri to redirect to
     * @param state random state
     * @param ctx Context of request
     */
    abstract generateAuthUrl(redirect_uri: string, state: string, ctx: WebContext): any;
    /**
     * Verify a token from a provider
     *
     * @param ctx
     */
    abstract handleToken(ctx: OperationContext): Promise<OAuthReturn>;
    /**
     * Manage the return of a provider
     * @param ctx
     */
    abstract handleCallback(ctx: WebContext): Promise<OAuthReturn>;
}
//# sourceMappingURL=oauth.d.ts.map