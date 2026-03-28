import * as WebdaError from "../errors/errors.js";
import { Service } from "./service.js";
import { getUuid } from "@webda/utils";
import { Counter } from "../metrics/metrics.js";
import { RegExpStringValidator } from "@webda/utils";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useService } from "../core/hooks.js";
export class OAuthServiceParameters extends ServiceParameters {
    load(params) {
        super.load(params);
        this.scope ?? (this.scope = ["email"]);
        this.exposeScope ?? (this.exposeScope = false);
        this.authenticationService ?? (this.authenticationService = "Authentication");
        this.authorized_uris ?? (this.authorized_uris = []);
        this.no_referer ?? (this.no_referer = false);
        return this;
    }
}
/**
 * OAuth service implementing the default OAuth workflow
 * It is abstract as it does not manage any provider as is
 */
export class OAuthService extends Service {
    /**
     * Ensure default parameter url
     */
    constructor(name, params) {
        var _a;
        super(name, params);
        (_a = this.parameters).url ?? (_a.url = this.getDefaultUrl());
    }
    initMetrics() {
        super.initMetrics();
        this.metrics.login = this.getMetric(Counter, {
            name: "oauth_login",
            help: "count the number of login",
            labelNames: ["method"]
        });
    }
    /**
     * Allow callback referer to access this url no matter what
     * @param context
     * @returns
     */
    async checkRequest(context) {
        // Only authorize url from this service
        if (!context.getHttpContext().getRelativeUri().startsWith(this.parameters.url)) {
            return false;
        }
        const regexps = this.getCallbackReferer();
        let valid = false;
        const referer = context.getHttpContext().getUniqueHeader("referer", "");
        if (this.parameters.no_referer && referer === "") {
            return true;
        }
        for (const i in regexps) {
            valid = referer.match(regexps[i]) !== null;
            if (valid) {
                break;
            }
        }
        return valid;
    }
    /**
     * Resolve dynamic dependancy
     */
    resolve() {
        super.resolve();
        this.parameters.with(params => {
            if (params.url === undefined) {
                params.url = this.getDefaultUrl();
            }
            if (params.authorized_uris === undefined) {
                this.log("WARN", "Not defining authorized_uris is a security risk");
            }
            else {
                this.authorized_uris = new RegExpStringValidator(params.authorized_uris);
            }
            this._authenticationService = useService(this.parameters.authenticationService);
        });
        return this;
    }
    /**
     * Get OAuth callback query parameters
     * @returns
     */
    getCallbackQueryParams() {
        return [
            {
                name: "code",
                required: true
            },
            {
                name: "scope",
                required: true
            },
            {
                name: "state",
                required: true
            }
        ];
    }
    /**
     * Add routes for the authentication
     */
    initRoutes() {
        super.initRoutes();
        const name = this.getName();
        this.addRoute(`${this.parameters.url}{?redirect?}`, ["GET"], this._redirect, {
            get: {
                description: `Log with a ${name} account`,
                summary: `Redirect to ${name}`,
                operationId: `logInWith${name}`,
                responses: {
                    "302": {
                        description: ""
                    },
                    "400": {
                        description: "Missing token"
                    }
                }
            }
        });
        this.addRoute(this.parameters.url +
            "/callback{?" +
            this.getCallbackQueryParams()
                .map(param => param.name + (param.required ? "" : "?"))
                .join(",") +
            "}", ["GET"], this._callback, {
            get: {
                description: `Get result from ${name} Authentication`,
                summary: `Use the token provide to validate with ${name} the user`,
                operationId: `callbackFrom${name}`,
                responses: {
                    "204": {
                        description: ""
                    },
                    "400": {
                        description: "Missing token"
                    }
                }
            }
        });
        if (this.hasToken()) {
            this.addRoute(this.parameters.url + "/token", ["POST"], this._token, {
                post: {
                    description: `Log with a ${name} token`,
                    summary: `Use the token provide to validate with ${name} the user`,
                    operationId: `verify${name}Token`,
                    responses: {
                        "204": {
                            description: ""
                        },
                        "400": {
                            description: "Missing token"
                        }
                    }
                }
            });
        }
        if (this.parameters.exposeScope) {
            this.addRoute(this.parameters.url + "/scope", ["GET"], this._scope, {
                get: {
                    description: `List ${name} auth scope for this apps`,
                    summary: "Retrieve the scope intended to be used with this auth",
                    operationId: `get${name}Scope`,
                    responses: {
                        "204": {
                            description: ""
                        },
                        "400": {
                            description: "Missing token"
                        }
                    }
                }
            });
        }
    }
    /**
     * Expose the scope used by the authentication
     * @param ctx
     */
    _scope(ctx) {
        ctx.write(this.parameters.scope);
    }
    /**
     * Define if this provider allow authentication by tokens
     * @returns
     */
    hasToken() {
        return false;
    }
    /**
     * Check if the url is authorized
     * @param redirect
     * @param context
     * @returns
     */
    isAuthorizedUri(redirect, context) {
        return (!this.parameters.authorized_uris || // If no authorized_uris defined, allow all
            this.authorized_uris?.validate(redirect) || // If redirect is included in authorized_uris
            (this.parameters.no_referer && !context.getHttpContext().getUniqueHeader("referer"))); // If no_referer is allowed
    }
    /**
     * Redirect to the OAuth provider
     *
     * The calling url must be and authorized_uris if defined
     * @param ctx
     */
    _redirect(ctx) {
        // implement default behavior
        const redirect_uri = this.parameters.redirect_uri || `${ctx.getHttpContext().getAbsoluteUrl()}/callback`;
        const redirect = ctx.getParameters().redirect || ctx.getHttpContext().getHeaders().referer;
        if (!this.isAuthorizedUri(redirect, ctx)) {
            throw new WebdaError.Unauthorized("Unauthorized redirect parameter");
        }
        const session = ctx.getSession();
        session.oauth ?? (session.oauth = {});
        // Generate 2 random uuid: nonce and state
        session.oauth.state = getUuid("base64");
        // Redirect to the calling uri
        session.oauth.redirect = redirect;
        ctx.redirect(this.generateAuthUrl(redirect_uri, session.oauth.state, ctx));
    }
    /**
     * Handle a token return
     *
     * This is private to avoid any override
     * @param context
     */
    async _token(context) {
        const res = await this.handleToken(context);
        await this.handleReturn(context, res.identId, res.profile);
        await this.emit("OAuth.Callback", {
            ...res,
            type: "token",
            provider: this.getName(),
            context
        });
        this.metrics.login.inc({ method: "token" });
    }
    /**
     * Handle a standard url callback
     *
     * This is private to avoid any override
     * @param ctx
     */
    async _callback(ctx) {
        const res = await this.handleCallback(ctx);
        await this.handleReturn(ctx, res.identId, res.profile);
        await this.emit("OAuth.Callback", {
            ...res,
            type: "callback",
            provider: this.getName(),
            context: ctx
        });
        this.metrics.login.inc({ method: "callback" });
    }
    /**
     * Once approved by the OAuth provider this will do the common task
     * @param ctx
     * @param identId
     * @param profile
     */
    async handleReturn(ctx, identId, profile, _tokens = undefined) {
        // If no identId has been provided error
        if (!identId) {
            throw new WebdaError.Forbidden("No identId provided by the OAuth provider");
        }
        const session = ctx.getSession();
        session.oauth ?? (session.oauth = {});
        // If authentication service then create a User/Ident couple
        if (this._authenticationService) {
            // Should call the onIdentLogin()
            await this._authenticationService.onIdentLogin(ctx, this.getName().toLowerCase(), identId, profile);
        }
        else {
            // Login in session
            ctx.getSession().login(identId, identId);
            // Store the profile retrieved
            session.oauth.profile = profile;
        }
        // Redirect to our targets
        if (session.oauth.redirect) {
            ctx.redirect(session.oauth.redirect);
        }
        else {
            ctx.write("Your authentication is successful");
        }
        // Clean variables from session
        session.oauth.state = undefined;
        session.oauth.redirect = undefined;
    }
}
//# sourceMappingURL=oauth.js.map