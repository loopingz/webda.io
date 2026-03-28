import uriTemplates from "uri-templates";
import { useApplication, useModelId } from "../application/hooks.js";
import { useLog } from "../loggers/hooks.js";
import { useParameters } from "../core/instancestorage.js";
import { useDynamicService } from "../core/hooks.js";
import { deepmerge } from "deepmerge-ts";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { templateVariables } from "../templates/templates.js";
import { useCoreEvents } from "../events/events.js";
export class RouterParameters extends ServiceParameters {
}
/**
 * Manage Route resolution
 * @category CoreFeatures
 *
 * @WebdaModda
 */
export class Router extends Service {
    constructor() {
        super(...arguments);
        /**
         * Routes
         */
        this.routes = new Map();
        this.models = new Map();
        /**
         * Request filters to apply
         */
        this._requestFilters = [];
        /**
         * Request filters to apply for CORS
         */
        this._requestCORSFilters = [];
    }
    /**
     * Registration of a model
     * @param model
     * @param url
     */
    registerModelUrl(model, url) {
        this.models.set(model, url);
    }
    resolve() {
        // Remap route
        useCoreEvents("Webda.Init", () => {
            this.remapRoutes();
        });
        return super.resolve();
    }
    /**
     * Return the route for model
     * @param model
     * @returns
     */
    getModelUrl(model) {
        if (typeof model !== "string") {
            model = useModelId(model);
        }
        return this.models.get(model);
    }
    /**
     * Include prefix to the url if not present
     * @param url
     * @returns
     */
    getFinalUrl(url) {
        // We have to replace all @ by %40 as it is allowed in url rfc (https://www.rfc-editor.org/rfc/rfc3986#page-22)
        // But disallowed in https://www.rfc-editor.org/rfc/rfc6570#section-3.2.1
        // Similar for / in query string
        url = url.replace(/@/g, "%40");
        if (url.includes("?")) {
            url = url.substring(0, url.indexOf("?")) + "?" + url.substring(url.indexOf("?") + 1).replace(/\//g, "%2F");
        }
        const prefix = useParameters().routePrefix || "";
        if (prefix && url.startsWith(prefix)) {
            return url;
        }
        // Absolute url
        if (url.startsWith("//")) {
            return url.substring(1);
        }
        return `${prefix}${url}`;
    }
    /**
     * Return routes
     * @returns
     */
    getRoutes() {
        return this.routes;
    }
    /**
     * Add a route dynamicaly
     *
     * @param {String} url of the route can contains dynamic part like {uuid}
     * @param {Object} info the type of executor
     */
    addRouteToRouter(url, info) {
        const finalUrl = this.getFinalUrl(url);
        useLog("TRACE", `Add route ${info.methods.join(",")} ${finalUrl}`);
        info.openapi ?? (info.openapi = {});
        if (this.routes[finalUrl]) {
            // If route is already added do not do anything
            if (this.routes[finalUrl].includes(info)) {
                return;
            }
            // Check and add warning if same method is used
            if (this.parameters.overrideWarning) {
                const methods = this.routes[finalUrl].map((r) => r.methods).flat();
                info.methods.forEach(m => {
                    if (methods.indexOf(m) >= 0) {
                        if (!info.override) {
                            useLog("WARN", `${m} ${finalUrl} overlap with another defined route`);
                        }
                    }
                });
            }
            // Last added need to be overriding
            this.routes[finalUrl].unshift(info);
        }
        else {
            this.routes[finalUrl] = [info];
        }
        if (this.getState() === "running") {
            this.remapRoutes();
        }
    }
    /**
     * Remove a route dynamicly
     *
     * @param {String} url to remove
     */
    removeRoute(url, info = undefined) {
        const finalUrl = this.getFinalUrl(url);
        if (!info) {
            delete this.routes[finalUrl];
        }
        else if (this.routes[finalUrl] && this.routes[finalUrl].includes(info)) {
            this.routes[finalUrl].splice(this.routes[finalUrl].indexOf(info), 1);
        }
        this.remapRoutes();
    }
    /**
     * Reinit all routes
     *
     * It will readd the URITemplates if needed
     * Sort all routes again
     */
    remapRoutes() {
        // Might need to ensure each routes is prefixed
        const prefix = useParameters().routePrefix || "";
        if (prefix) {
            Object.keys(this.routes)
                .filter(k => !k.startsWith(prefix))
                .forEach(k => {
                this.routes[this.getFinalUrl(k)] = this.routes[k];
                delete this.routes[k];
            });
        }
        this.initURITemplates(this.routes);
        // Order path desc
        this.pathMap = [];
        for (const i in this.routes) {
            // Might need to trail the query string
            this.routes[i].forEach((config) => {
                this.pathMap.push({
                    url: i,
                    config
                });
            });
        }
        this.pathMap.sort(this.comparePath);
    }
    comparePath(a, b) {
        // Normal node works with localeCompare but not Lambda...
        // Local compare { to a return: 26 on Lambda
        const bs = b.url.replace(/\{[^{}]+}/, "{}").split("/");
        const as = a.url.replace(/\{[^{}]+}/, "{}").split("/");
        for (const i in as) {
            if (bs[i] === undefined)
                return -1;
            if (as[i] === bs[i])
                continue;
            if (as[i][0] === "{" && bs[i][0] !== "{")
                return 1;
            if (as[i][0] !== "{" && bs[i][0] === "{")
                return -1;
            return bs[i] < as[i] ? -1 : 1;
        }
        return 1;
    }
    /**
     * @hidden
     */
    initURITemplates(config) {
        // Prepare tbe URI parser
        for (const map in config) {
            if (map.indexOf("{") !== -1) {
                config[map].forEach((e) => {
                    const idx = map.indexOf("{?");
                    let queryOptional = true;
                    if (idx >= 0) {
                        const query = map.substring(idx + 2, map.length - 1);
                        e._queryParams = [];
                        query.split(",").forEach(q => {
                            if (q.endsWith("*")) {
                                e._queryCatchAll = q.substring(0, q.length - 1);
                                return;
                            }
                            else if (q.endsWith("+")) {
                                e._queryCatchAll = q.substring(0, q.length - 1);
                                queryOptional = false;
                                return;
                            }
                            else if (q.endsWith("?")) {
                                e._queryParams.push({ name: q.substring(0, q.length - 1), required: false });
                            }
                            else {
                                queryOptional = false;
                                e._queryParams.push({ name: q, required: true });
                            }
                        });
                        // We do not use uri-templates for query parsing
                        //map = map.substring(0, idx) + "?{+URITemplateQuery}";
                        const templates = [uriTemplates(map.substring(0, idx) + "?{+URITemplateQuery}")];
                        const pathTemplate = uriTemplates(map.substring(0, idx));
                        if (queryOptional) {
                            templates.push(pathTemplate);
                        }
                        e._uriTemplateParse = {
                            fromUri: (url) => {
                                return templates.reduce((v, t) => (v ? v : t.fromUri(url)), undefined);
                            },
                            varNames: [...pathTemplate.varNames, ...e._queryParams.map(q => q.name)]
                        };
                    }
                    else {
                        e._uriTemplateParse = uriTemplates(map);
                    }
                });
            }
        }
    }
    /**
     * Get all method for a specific url
     * @param config
     * @param method
     * @param url
     */
    getRouteMethodsFromUrl(url) {
        const finalUrl = this.getFinalUrl(url);
        const methods = new Set();
        for (const i in this.pathMap) {
            const routeUrl = this.pathMap[i].url;
            const map = this.pathMap[i].config;
            if (routeUrl !== finalUrl &&
                (map._uriTemplateParse === undefined || map._uriTemplateParse.fromUri(finalUrl, { strict: true }) === undefined)) {
                continue;
            }
            map.methods.forEach(m => methods.add(m));
        }
        return Array.from(methods);
    }
    /**
     * Get the route from a method / url
     */
    getRouteFromUrl(ctx, method, url) {
        const finalUrl = this.getFinalUrl(url);
        // Search for the route
        for (const i in this.pathMap) {
            const routeUrl = this.pathMap[i].url;
            const map = this.pathMap[i].config;
            // Check method
            if (map.methods.indexOf(method) === -1) {
                continue;
            }
            // If url is strictly equal
            if (routeUrl === finalUrl) {
                return map;
            }
            // If the url
            if (map._uriTemplateParse === undefined) {
                continue;
            }
            const parse_result = map._uriTemplateParse.fromUri(finalUrl, { strict: true });
            if (parse_result !== undefined) {
                const parseUrl = new URL(`http://localhost${finalUrl}`);
                if (map._queryCatchAll) {
                    parse_result[map._queryCatchAll] = {};
                    parseUrl.searchParams.forEach((v, k) => {
                        if (!map._queryParams?.find(q => q.name === k)) {
                            parse_result[map._queryCatchAll][k] = v;
                        }
                    });
                }
                // Check for each params
                let mandatoryParams = true;
                map._queryParams?.forEach(q => {
                    if (!parseUrl.searchParams.has(q.name)) {
                        mandatoryParams && (mandatoryParams = !q.required);
                        return;
                    }
                    parse_result[q.name] = parseUrl.searchParams.get(q.name);
                });
                // Skip if we miss mandatory params
                if (!mandatoryParams) {
                    continue;
                }
                if (parse_result.URITemplateQuery) {
                    delete parse_result.URITemplateQuery;
                }
                ctx.setParameters(parse_result);
                return map;
            }
        }
    }
    getOpenAPISchema(schema) {
        if (!schema) {
            return {
                $ref: "#/components/schemas/Object"
            };
        }
        else if (typeof schema === "string") {
            return {
                $ref: "#/components/schemas/" + schema
            };
        }
        return schema;
    }
    /**
     * Add all known routes to paths
     *
     * @param openapi to complete
     * @param skipHidden add hidden routes or not
     */
    completeOpenAPI(openapi, skipHidden = true) {
        const hasTag = tag => openapi.tags.find(t => t.name === tag) !== undefined;
        for (const i in this.routes) {
            this.routes[i].forEach((route) => {
                route.openapi = templateVariables(route.openapi || {}, useDynamicService(route.executor).getOpenApiReplacements());
                if (route.openapi.hidden && skipHidden) {
                    return;
                }
                route.openapi.hidden = false;
                let path = i;
                if (i.indexOf("{?") >= 0) {
                    path = i.substring(0, i.indexOf("{?"));
                }
                openapi.paths[path] = openapi.paths[path] || {};
                if (route._uriTemplateParse) {
                    openapi.paths[path].parameters = [];
                    route._uriTemplateParse.varNames.forEach(varName => {
                        const queryParam = route._queryParams?.find(i => i.name === varName);
                        if (queryParam) {
                            let name = varName;
                            if (name.startsWith("*")) {
                                name = name.substr(1);
                            }
                            openapi.paths[path].parameters.push({
                                name,
                                in: "query",
                                required: queryParam.required,
                                schema: {
                                    type: "string"
                                }
                            });
                            return;
                        }
                        openapi.paths[path].parameters.push({
                            // ^[a-zA-Z0-9._$-]+$] is the official regex of AWS
                            name: varName.replace(/[^a-zA-Z0-9._$-]/g, ""),
                            in: "path",
                            required: true,
                            schema: {
                                type: "string"
                            }
                        });
                    });
                }
                route.methods.forEach(method => {
                    var _a;
                    let responses;
                    let schema;
                    let description;
                    let summary;
                    let operationId;
                    let requestBody;
                    const tags = route.openapi.tags ?? [];
                    // Refactor here
                    if (route.openapi[method.toLowerCase()]) {
                        responses = route.openapi[method.toLowerCase()].responses;
                        schema = this.getOpenAPISchema(route.openapi[method.toLowerCase()].schemas?.output);
                        description = route.openapi[method.toLowerCase()].description;
                        summary = route.openapi[method.toLowerCase()].summary;
                        operationId = route.openapi[method.toLowerCase()].operationId;
                        tags.push(...(route.openapi[method.toLowerCase()].tags || []));
                        requestBody = route.openapi[method.toLowerCase()].requestBody;
                    }
                    responses = responses || {
                        200: {
                            description: "Operation success"
                        }
                    };
                    for (const j in responses) {
                        // Add default answer
                        const code = parseInt(j);
                        if (code < 300 && code >= 200 && !responses[j].description) {
                            responses[j].description = "Operation success";
                            (_a = responses[j]).content ?? (_a.content = {});
                            responses[j].content["application/json"] = {
                                schema
                            };
                        }
                    }
                    // Add the service name if no tags are defined
                    if (tags.length === 0) {
                        tags.push(route.executor);
                    }
                    const desc = {
                        tags,
                        responses: responses,
                        description,
                        summary,
                        operationId,
                        requestBody
                    };
                    if (method.toLowerCase().startsWith("p") && route.openapi[method.toLowerCase()]?.schemas?.input) {
                        // Add request schema if exist
                        desc.requestBody ?? (desc.requestBody = {
                            content: {
                                "application/json": {
                                    schema: this.getOpenAPISchema(route.openapi[method.toLowerCase()]?.schemas?.input)
                                }
                            }
                        });
                    }
                    openapi.paths[path][method.toLowerCase()] = desc;
                    tags
                        .filter(tag => !hasTag(tag))
                        .forEach(tag => openapi.tags.push({
                        name: tag
                    }));
                });
            });
        }
    }
    async execute(ctx) {
        const info = this.getRouteFromUrl(ctx, ctx.getHttpContext().getMethod(), ctx.getHttpContext().getUrl());
    }
    /**
     * Verify if a request can be done
     *
     * @param context Context of the request
     */
    async checkRequest(ctx) {
        // Do not need to filter on OPTIONS as CORS is for that
        if (ctx.getHttpContext().getMethod() === "OPTIONS" || this._requestFilters.length === 0) {
            return true;
        }
        return (await Promise.all(this._requestFilters.map(filter => filter.checkRequest(ctx, "AUTH")))).some(v => v);
    }
    /**
     * Verify if an origin is allowed to do request on the API
     *
     * @param context Context of the request
     */
    async checkCORSRequest(ctx) {
        return (await Promise.all(this._requestFilters.map(filter => filter.checkRequest(ctx, "CORS")))).some(v => v);
    }
    /**
     * Export OpenAPI
     * @param skipHidden
     * @returns
     */
    exportOpenAPI(skipHidden = true) {
        var _a, _b, _c;
        const packageInfo = useApplication().getPackageDescription();
        let contact;
        if (typeof packageInfo.author === "string") {
            contact = {
                name: packageInfo.author
            };
        }
        else if (packageInfo.author) {
            contact = packageInfo.author;
        }
        let license;
        if (typeof packageInfo.license === "string") {
            license = {
                name: packageInfo.license
            };
        }
        else if (packageInfo.license) {
            license = packageInfo.license;
        }
        const openapi = deepmerge({
            openapi: "3.0.3",
            info: {
                description: packageInfo.description,
                version: packageInfo.version || "0.0.0",
                title: packageInfo.title || "Webda-based application",
                termsOfService: packageInfo.termsOfService,
                contact,
                license
            },
            components: {
                schemas: {
                    Object: {
                        type: "object"
                    }
                }
            },
            paths: {},
            tags: []
        }, useApplication().getCurrentConfiguration().openapi || {});
        const app = useApplication();
        const models = app.getModels();
        const schemas = app.getSchemas();
        // Copy all input/output from actions
        for (const i in schemas) {
            if (!(i.endsWith(".input") || i.endsWith(".output"))) {
                continue;
            }
            // @ts-ignore
            (_a = openapi.components.schemas)[i] ?? (_a[i] = schemas[i]);
            // Not sure how to test following
            /* c8 ignore next 5 */
            for (const j in schemas[i].definitions) {
                // @ts-ignore
                (_b = openapi.components.schemas)[j] ?? (_b[j] = schemas[i].definitions[j]);
            }
        }
        for (const i in models) {
            const model = models[i];
            let desc = {
                type: "object"
            };
            const modelName = model.name || i.split("/").pop();
            const schema = useApplication().getSchema(i);
            if (schema) {
                for (const j in schema.definitions) {
                    // @ts-ignore
                    (_c = openapi.components.schemas)[j] ?? (_c[j] = schema.definitions[j]);
                }
                delete schema.definitions;
                desc = schema;
            }
            // Remove empty required as openapi does not like that
            // Our compiler is not generating this anymore but it is additional protection
            /* c8 ignore next 3 */
            if (desc.required && desc.required.length === 0) {
                delete desc.required;
            }
            // Remove $schema
            delete desc.$schema;
            // Rename all #/definitions/ by #/components/schemas/
            openapi.components.schemas[modelName] = JSON.parse(JSON.stringify(desc).replace(/#\/definitions\//g, "#/components/schemas/"));
        }
        this.completeOpenAPI(openapi, skipHidden);
        openapi.tags.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        const paths = {};
        Object.keys(openapi.paths)
            .sort()
            .forEach(i => (paths[i] = openapi.paths[i]));
        openapi.paths = paths;
        return openapi;
    }
    /**
     * Register a request filtering
     *
     * Will apply to all requests regardless of the devMode
     * @param filter
     */
    registerRequestFilter(filter) {
        this._requestFilters.push(filter);
    }
    /**
     * Register a CORS request filtering
     *
     * Does not apply in devMode
     * @param filter
     */
    registerCORSFilter(filter) {
        this._requestCORSFilters.push(filter);
    }
}
//# sourceMappingURL=router.js.map