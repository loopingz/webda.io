import uriTemplates from "uri-templates";
import { HttpMethodType } from "../contexts/httpcontext.js";
import type { IRouter, RequestFilter, CORSFilter, RouteInfo } from "./irest.js";

import { useApplication, useModelId } from "../application/hooks.js";
import { Command } from "../services/command.js";
import { useLog, useOutput } from "../loggers/hooks.js";
import type { OpenAPIV3 } from "openapi-types";
import { useParameters } from "../application/hooks.js";
import { useDynamicService, useService } from "../core/hooks.js";
import { deepmerge } from "deepmerge-ts";
import { JSONSchema7 } from "json-schema";
import { IWebContext, IOperationContext } from "../contexts/icontext.js";
import { Service } from "../services/service.js";
import { WebContext } from "../contexts/webcontext.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import type { Storable } from "@webda/models";
import { getMetadata } from "@webda/decorators";
import { templateVariables } from "../templates/templates.js";
import { emitCoreEvent, useCoreEvents } from "../events/events.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { FileUtils, JSONUtils } from "@webda/utils";
import * as WebdaError from "../errors/errors.js";

/** Mode used to serve an alias */
export type RouteAliasMode = "rewrite" | "redirect";

/** Full definition of a route alias */
export interface RouteAliasDefinition {
  /**
   * Target URL, relative to the application (routePrefix is applied like routes)
   * Supports ${user.id} and ${params.<name>} placeholders
   */
  target: string;
  /** Methods the alias applies to @default all methods */
  methods?: HttpMethodType[];
  /** rewrite: served in-process, redirect: HTTP redirect to the target @default "rewrite" */
  mode?: RouteAliasMode;
  /** Status code used in redirect mode @default 302 */
  redirectCode?: 301 | 302 | 307 | 308;
  /** Document the alias in OpenAPI @default true for rewrite, false for redirect */
  openapi?: boolean;
}

/**
 * Entry structure for URI template matching
 */
export interface TemplateMatchEntry {
  _uriTemplateParse?: any;
  _queryParams?: { name: string; required: boolean }[];
  _queryCatchAll?: string;
}

/**
 * Compiled route alias representation for router internal matching
 */
export interface CompiledAlias extends TemplateMatchEntry {
  rawUrl: string;
  url: string;
  definition: RouteAliasDefinition;
  target: ReturnType<typeof compileAliasTarget>;
}

/**
 * Compile an alias target into a fast resolver
 *
 * Supported placeholders:
 * - `${user.id}`: `ctx.getCurrentUserId()`, throws Unauthorized (401) if undefined
 * - `${params.<name>}`: parameter from alias template (`{name}`, `{+name}`, `{?name}`), empty string if undefined
 * - `${params.<name>*}`: catch-all query object serialized as `key=value&...`, empty string if undefined
 *
 * @param alias - the alias URL template
 * @param target - the target URL pattern
 * @returns compiled resolver with `requiresUser` flag and `resolve` function
 */
export function compileAliasTarget(
  alias: string,
  target: string
): {
  requiresUser: boolean;
  resolve: (ctx: IOperationContext, params: Record<string, any>) => string;
} {
  let requiresUser = false;
  const parts: (string | ((ctx: IOperationContext, params: Record<string, any>) => string))[] = [];
  let lastIndex = 0;
  let placeholderStart = target.indexOf("${", lastIndex);

  while (placeholderStart !== -1) {
    const placeholderEnd = target.indexOf("}", placeholderStart + 2);
    if (placeholderEnd === -1) {
      throw new WebdaError.CodeError(
        "INVALID_ALIAS_TARGET",
        `Unclosed placeholder in alias "${alias}" target "${target}"`
      );
    }
    if (placeholderStart > lastIndex) {
      parts.push(target.substring(lastIndex, placeholderStart));
    }
    const expr = target.substring(placeholderStart + 2, placeholderEnd);
    if (expr === "user.id") {
      requiresUser = true;
      parts.push((ctx: IOperationContext) => {
        const userId = ctx?.getCurrentUserId?.();
        if (userId === undefined || userId === null || userId === "") {
          throw new WebdaError.Unauthorized("User required for alias target");
        }
        return encodeURIComponent(String(userId));
      });
    } else if (/^params\.[a-zA-Z0-9_]+\*$/.test(expr)) {
      const paramName = expr.substring("params.".length, expr.length - 1);
      parts.push((_ctx: IOperationContext, params: Record<string, any>) => {
        const val = params?.[paramName];
        if (val && typeof val === "object") {
          const entries = Object.entries(val);
          if (entries.length === 0) return "";
          return entries
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join("&");
        }
        return "";
      });
    } else if (/^params\.[a-zA-Z0-9_]+$/.test(expr)) {
      const paramName = expr.substring("params.".length);
      const isPlus = alias.includes(`{+${paramName}}`);
      parts.push((_ctx: IOperationContext, params: Record<string, any>) => {
        const val = params?.[paramName];
        if (val === undefined || val === null) {
          return "";
        }
        if (isPlus) {
          return String(val)
            .split("/")
            .map(encodeURIComponent)
            .join("/");
        }
        return encodeURIComponent(String(val));
      });
    } else {
      throw new WebdaError.CodeError(
        "INVALID_ALIAS_TARGET",
        `Invalid placeholder "\${${expr}}" in alias "${alias}" target "${target}"`
      );
    }
    lastIndex = placeholderEnd + 1;
    placeholderStart = target.indexOf("${", lastIndex);
  }

  if (lastIndex < target.length) {
    parts.push(target.substring(lastIndex));
  }

  const resolve = (ctx: IOperationContext, params: Record<string, any>): string => {
    let result = parts
      .map(part => (typeof part === "function" ? part(ctx, params) : part))
      .join("");
    result = result.replace(/\?&/, "?").replace(/&&+/g, "&").replace(/[?&]$/, "");
    const pathPart = result.split("?")[0];
    if (pathPart.split("/").includes("..")) {
      throw new WebdaError.BadRequest("Path traversal not allowed in alias target");
    }
    return result;
  };

  return {
    requiresUser,
    resolve
  };
}

/** Parameters for the Router service */
export class RouterParameters extends ServiceParameters {
  /**
   * Display a WARNING if a route is overriden
   */
  overrideWarning?: boolean;
  /**
   * Route aliases: key is the alias URL template, value the target
   * @example { "/me": "/users/${user.id}" }
   */
  aliases?: Record<string, string | RouteAliasDefinition>;

  /**
   * Load parameters and normalize aliases
   * @param params - service parameters to load
   * @returns this for chaining
   */
  override load(params: any = {}): this {
    super.load(params);
    if (this.aliases) {
      const normalized: Record<string, RouteAliasDefinition> = {};
      for (const [key, val] of Object.entries(this.aliases)) {
        const def: RouteAliasDefinition =
          typeof val === "string" ? { target: val, mode: "rewrite" } : { mode: "rewrite", ...val };
        compileAliasTarget(key, def.target);
        normalized[key] = def;
      }
      this.aliases = normalized;
    }
    return this;
  }
}

/**
 * Manage Route resolution
 * @category CoreFeatures
 *
 * @WebdaModda
 */
export class Router<T extends RouterParameters = RouterParameters> extends Service<T> implements IRouter {
  /**
   * Routes
   */
  protected routes: Map<string, RouteInfo[]> = new Map();
  /**
   *
   */
  protected pathMap: { url: string; config: RouteInfo }[];
  protected models: Map<string, string> = new Map();
  /**
   * Route aliases configuration
   */
  protected aliases: Record<string, RouteAliasDefinition> = {};
  /**
   * Compiled route aliases
   */
  protected aliasMap: CompiledAlias[] = [];
  /**
   * Request filters to apply
   */
  private _requestFilters: RequestFilter[] = [];
  /**
   * Request filters to apply for CORS
   */
  private _requestCORSFilters: CORSFilter[] = [];

  /**
   * Registration of a model
   * @param model - the model to use
   * @param url - the URL
   */
  registerModelUrl(model: string, url: string) {
    this.models.set(model, url);
  }

  /**
   * Resolve dependencies and wire up core lifecycle listeners.
   *
   * The Router pulls its inputs from events rather than being driven by
   * `Core.init()` directly:
   *  - `Webda.Init.Services` — scan every resolved service for
   *    `@Route` metadata and filter capabilities.
   *  - `Webda.Init` — finalize the URI template index after all routes
   *    (dynamic or decorator-based) have been registered.
   *
   * @returns the result
   */
  resolve() {
    // Register as the instance router
    useInstanceStorage().router = this;
    if (this.parameters.aliases) {
      for (const [key, val] of Object.entries(this.parameters.aliases)) {
        this.aliases[key] = val as RouteAliasDefinition;
      }
    }
    // Discover routes + filters once every service is resolved and initialized
    useCoreEvents("Webda.Init.Services", services => {
      const list = Object.values(services) as unknown as Service[];
      this.discoverFilters(list);
      this.discoverRoutes(list);
    });
    // Remap route
    useCoreEvents("Webda.Init", () => {
      this.remapRoutes();
    });
    return super.resolve();
  }

  /**
   * Return the route for model
   * @param model - the model to use
   * @returns the result
   */
  getModelUrl(model: string | Storable) {
    if (typeof model !== "string") {
      model = useModelId(model);
    }
    return this.models.get(model);
  }

  /**
   * Include prefix to the url if not present
   * @param url - the URL
   * @returns the result string
   */
  getFinalUrl(url: string): string {
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
   * @returns the result
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
  addRouteToRouter(url: string, info: RouteInfo): void {
    const finalUrl = this.getFinalUrl(url);
    useLog("TRACE", `Add route ${info.methods.join(",")} ${finalUrl}`);
    info.openapi ??= {};
    if (this.routes[finalUrl]) {
      // If route is already added do not do anything
      if (this.routes[finalUrl].includes(info)) {
        return;
      }
      // Check and add warning if same method is used
      if (this.parameters.overrideWarning) {
        const methods = this.routes[finalUrl].map((r: RouteInfo) => r.methods).flat();
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
    } else {
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
   * @param info - the information object
   */
  removeRoute(url: string, info: RouteInfo = undefined): void {
    const finalUrl = this.getFinalUrl(url);
    if (!info) {
      delete this.routes[finalUrl];
    } else if (this.routes[finalUrl] && this.routes[finalUrl].includes(info)) {
      this.routes[finalUrl].splice(this.routes[finalUrl].indexOf(info), 1);
    }

    this.remapRoutes();
  }

  /**
   * Add a route alias dynamically
   *
   * @param url - the alias URL pattern
   * @param def - target URL or RouteAliasDefinition
   */
  addAlias(url: string, def: string | RouteAliasDefinition): void {
    const normalized: RouteAliasDefinition =
      typeof def === "string" ? { target: def, mode: "rewrite" } : { mode: "rewrite", ...def };
    compileAliasTarget(url, normalized.target);
    this.aliases[url] = normalized;
    if (this.getState() === "running") {
      this.remapRoutes();
    }
  }

  /**
   * Remove a route alias dynamically
   *
   * @param url - the alias URL pattern to remove
   */
  removeAlias(url: string): void {
    delete this.aliases[url];
    if (this.getState() === "running") {
      this.remapRoutes();
    }
  }

  /**
   * Return all registered route aliases
   *
   * @returns map of alias URLs to definitions
   */
  getAliases(): Record<string, RouteAliasDefinition> {
    return { ...this.aliases };
  }

  /**
   * Reinit all routes and aliases
   *
   * It will readd the URITemplates if needed
   * Sort all routes and aliases again
   */
  public remapRoutes() {
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
      this.routes[i].forEach((config: RouteInfo) => {
        this.pathMap.push({
          url: i,
          config
        });
      });
    }
    this.pathMap.sort(this.comparePath);

    // Rebuild aliasMap
    this.aliasMap = [];
    for (const url in this.aliases) {
      const def = this.aliases[url];
      const finalUrl = this.getFinalUrl(url);
      if (this.routes[finalUrl]) {
        useLog("WARN", `Alias ${finalUrl} shadows route ${finalUrl}`);
      }
      useLog("TRACE", `Add alias ${finalUrl} -> ${def.target}`);
      const compiledTarget = compileAliasTarget(url, def.target);
      const templateInfo = this.compileTemplate(finalUrl);
      this.aliasMap.push({
        rawUrl: url,
        url: finalUrl,
        definition: def,
        target: compiledTarget,
        ...templateInfo
      });
    }
    this.aliasMap.sort(this.comparePath);
  }

  /**
   * Compare two route paths for sorting, prioritizing literal segments over parameters
   * @param a - the first route
   * @param b - the second route
   * @returns the result number
   */
  protected comparePath(a, b): number {
    // Normal node works with localeCompare but not Lambda...
    // Local compare { to a return: 26 on Lambda
    const bs = b.url.replace(/\{[^{}]+}/, "{}").split("/");
    const as = a.url.replace(/\{[^{}]+}/, "{}").split("/");
    for (const i in as) {
      if (bs[i] === undefined) return -1;
      if (as[i] === bs[i]) continue;
      if (as[i][0] === "{" && bs[i][0] !== "{") return 1;
      if (as[i][0] !== "{" && bs[i][0] === "{") return -1;
      return bs[i] < as[i] ? -1 : 1;
    }
    return 1;
  }

  /**
   * Compile a URI template with optional query parameter handling
   * @param url - the URL pattern
   * @returns compiled template parser and query param definitions
   */
  protected compileTemplate(
    url: string
  ): Pick<RouteInfo, "_uriTemplateParse" | "_queryParams" | "_queryCatchAll"> {
    if (url.indexOf("{") === -1) {
      return {};
    }
    const idx = url.indexOf("{?");
    let queryOptional = true;
    let _queryParams: { name: string; required: boolean }[] | undefined;
    let _queryCatchAll: string | undefined;
    let _uriTemplateParse: any;

    if (idx >= 0) {
      const query = url.substring(idx + 2, url.length - 1);
      _queryParams = [];
      query.split(",").forEach(q => {
        if (q.endsWith("*")) {
          _queryCatchAll = q.substring(0, q.length - 1);
          return;
        } else if (q.endsWith("+")) {
          _queryCatchAll = q.substring(0, q.length - 1);
          queryOptional = false;
          return;
        } else if (q.endsWith("?")) {
          _queryParams.push({ name: q.substring(0, q.length - 1), required: false });
        } else {
          queryOptional = false;
          _queryParams.push({ name: q, required: true });
        }
      });
      const templates = [uriTemplates(url.substring(0, idx) + "?{+URITemplateQuery}")];
      const pathTemplate = uriTemplates(url.substring(0, idx));
      if (queryOptional) {
        templates.push(pathTemplate);
      }
      _uriTemplateParse = {
        fromUri: (testUrl: string) => {
          return templates.reduce((v, t) => (v ? v : t.fromUri(testUrl)), undefined);
        },
        varNames: [...pathTemplate.varNames, ..._queryParams.map(q => q.name)]
      };
    } else {
      _uriTemplateParse = uriTemplates(url);
    }
    return {
      _uriTemplateParse,
      _queryParams,
      _queryCatchAll
    };
  }

  /**
   * @hidden
   * @param config - the configuration
   */
  protected initURITemplates(config: Map<string, RouteInfo[]>): void {
    // Prepare the URI parser
    for (const map in config) {
      const compiled = this.compileTemplate(map);
      if (compiled._uriTemplateParse) {
        config[map].forEach((e: RouteInfo) => {
          e._uriTemplateParse = compiled._uriTemplateParse;
          e._queryParams = compiled._queryParams;
          e._queryCatchAll = compiled._queryCatchAll;
        });
      }
    }
  }

  /**
   * What a request URL is matched against for a route: a route declaring a
   * query template (`{?q,page?}`, `{?rest*}`) matches the whole URL, any other
   * route matches the path alone, so an extra query string (`?v=123`) neither
   * prevents the match nor ends up in a path variable
   * @param routeUrl - the route URL
   * @param finalUrl - the request URL, from `getFinalUrl`
   * @returns the URL to match
   */
  protected getMatchTarget(routeUrl: string, finalUrl: string): string {
    return routeUrl.includes("{?") ? finalUrl : finalUrl.split("?")[0];
  }

  /**
   * Match a URL against an entry (route or alias)
   * @param entry - route or alias info
   * @param routeUrl - the route or alias URL template
   * @param finalUrl - the incoming request URL
   * @returns extracted parameters map, or undefined if no match
   */
  protected matchTemplate(
    entry: TemplateMatchEntry,
    routeUrl: string,
    finalUrl: string
  ): Record<string, any> | undefined {
    const target = this.getMatchTarget(routeUrl, finalUrl);
    // If url is strictly equal
    if (routeUrl === target) {
      return {};
    }

    if (entry._uriTemplateParse === undefined) {
      return undefined;
    }
    const parse_result = entry._uriTemplateParse.fromUri(target, { strict: true });
    if (parse_result !== undefined) {
      const parseUrl = new URL(`http://localhost${finalUrl}`);
      if (entry._queryCatchAll) {
        parse_result[entry._queryCatchAll] = {};
        parseUrl.searchParams.forEach((v, k) => {
          if (!entry._queryParams?.find(q => q.name === k)) {
            parse_result[entry._queryCatchAll][k] = v;
          }
        });
      }
      // Check for each params
      let mandatoryParams = true;
      entry._queryParams?.forEach(q => {
        if (!parseUrl.searchParams.has(q.name)) {
          mandatoryParams &&= !q.required;
          return;
        }
        parse_result[q.name] = parseUrl.searchParams.get(q.name);
      });
      // Skip if we miss mandatory params
      if (!mandatoryParams) {
        return undefined;
      }
      if (parse_result.URITemplateQuery) {
        delete parse_result.URITemplateQuery;
      }
      return parse_result;
    }
    return undefined;
  }

  /**
   * Resolve an incoming URL against route aliases
   * @param ctx - the operation context
   * @param method - the HTTP method
   * @param url - the URL to resolve (relative to prefix)
   * @returns resolved alias target and metadata, or undefined
   */
  public resolveAlias(
    ctx: IWebContext,
    method: HttpMethodType,
    url: string
  ): { alias: string; url: string; mode: RouteAliasMode; redirectCode?: number } | undefined {
    const finalUrl = this.getFinalUrl(url);
    for (const aliasEntry of this.aliasMap) {
      if (aliasEntry.definition.methods && !aliasEntry.definition.methods.includes(method)) {
        continue;
      }
      const params = this.matchTemplate(
        aliasEntry,
        aliasEntry.url,
        aliasEntry.rawUrl.startsWith("//") ? url : finalUrl
      );
      if (params !== undefined) {
        let resolvedTarget = aliasEntry.target.resolve(ctx, params);
        // Query string propagation: if the alias template does not declare a query ({?...}),
        // append the original request query string to the target.
        if (!aliasEntry.url.includes("{?")) {
          const qIdx = url.indexOf("?");
          if (qIdx !== -1) {
            const queryStr = url.substring(qIdx + 1);
            if (queryStr) {
              const sep = resolvedTarget.includes("?") ? "&" : "?";
              resolvedTarget = `${resolvedTarget}${sep}${queryStr}`;
            }
          }
        }
        return {
          alias: aliasEntry.rawUrl,
          url: resolvedTarget,
          mode: aliasEntry.definition.mode || "rewrite",
          redirectCode: aliasEntry.definition.redirectCode
        };
      }
    }
    return undefined;
  }

  /**
   * Get all method for a specific url
   * @param url - the URL
   * @returns the list of results
   */
  getRouteMethodsFromUrl(url): HttpMethodType[] {
    const finalUrl = this.getFinalUrl(url);
    const methods = new Set<HttpMethodType>();
    for (const i in this.pathMap) {
      const routeUrl = this.pathMap[i].url;
      const map = this.pathMap[i].config;
      const target = this.getMatchTarget(routeUrl, finalUrl);

      if (
        routeUrl !== target &&
        (map._uriTemplateParse === undefined || map._uriTemplateParse.fromUri(target, { strict: true }) === undefined)
      ) {
        continue;
      }

      map.methods.forEach(m => methods.add(m));
    }
    for (const aliasEntry of this.aliasMap) {
      const params = this.matchTemplate(
        aliasEntry,
        aliasEntry.url,
        aliasEntry.rawUrl.startsWith("//") ? url : finalUrl
      );
      if (params !== undefined) {
        const placeholderCtx = aliasEntry.target.requiresUser
          ? ({ getCurrentUserId: () => "__placeholder__" } as any)
          : ({} as any);
        try {
          const resolvedTarget = aliasEntry.target.resolve(placeholderCtx, params);
          const targetFinalUrl = this.getFinalUrl(resolvedTarget);
          for (const i in this.pathMap) {
            const routeUrl = this.pathMap[i].url;
            const map = this.pathMap[i].config;
            const target = this.getMatchTarget(routeUrl, targetFinalUrl);
            if (
              routeUrl === target ||
              (map._uriTemplateParse !== undefined &&
                map._uriTemplateParse.fromUri(target, { strict: true }) !== undefined)
            ) {
              map.methods.forEach(m => {
                if (!aliasEntry.definition.methods || aliasEntry.definition.methods.includes(m)) {
                  methods.add(m);
                }
              });
            }
          }
        } catch {
          // ignore error during method discovery
        }
      }
    }
    return Array.from(methods);
  }

  /**
   * Get the route from a method / url
   * @param ctx - the operation context
   * @param method - the HTTP method
   * @param url - the URL
   * @returns the result
   */
  public getRouteFromUrl(ctx: IWebContext, method: HttpMethodType, url: string) {
    const finalUrl = this.getFinalUrl(url);
    // Search for the route
    for (const i in this.pathMap) {
      const routeUrl = this.pathMap[i].url;
      const map = this.pathMap[i].config;

      // Check method
      if (map.methods.indexOf(method) === -1) {
        continue;
      }

      const params = this.matchTemplate(map, routeUrl, finalUrl);
      if (params !== undefined) {
        if (map._uriTemplateParse !== undefined && routeUrl !== this.getMatchTarget(routeUrl, finalUrl)) {
          ctx.setParameters(params);
        }
        return map;
      }
    }
  }

  /**
   * Convert a schema name or object to an OpenAPI $ref or inline schema
   * @param schema - the schema object
   * @returns the result
   */
  protected getOpenAPISchema(schema) {
    if (!schema) {
      return {
        $ref: "#/components/schemas/Object"
      };
    } else if (typeof schema === "string") {
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
  completeOpenAPI(openapi: OpenAPIV3.Document, skipHidden: boolean = true) {
    const hasTag = tag => openapi.tags.find(t => t.name === tag) !== undefined;
    for (const i in this.routes) {
      this.routes[i].forEach((route: RouteInfo) => {
        route.openapi = templateVariables(
          route.openapi || {},
          useDynamicService(route.executor).getOpenApiReplacements()
        );
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
          let responses: { [key: string]: OpenAPIV3.ResponseObject };
          let schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject;
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
              responses[j].content ??= {};
              responses[j].content["application/json"] = {
                schema
              };
            }
          }
          // Add the service name if no tags are defined
          if (tags.length === 0) {
            tags.push(route.executor);
          }
          const desc: OpenAPIV3.OperationObject = {
            tags,
            responses: responses,
            description,
            summary,
            operationId,
            requestBody,
            parameters: route.openapi[method.toLowerCase()]?.parameters
          };
          if (method.toLowerCase().startsWith("p") && route.openapi[method.toLowerCase()]?.schemas?.input) {
            // Add request schema if exist
            desc.requestBody ??= {
              content: {
                "application/json": {
                  schema: this.getOpenAPISchema(route.openapi[method.toLowerCase()]?.schemas?.input)
                }
              }
            };
          }
          openapi.paths[path][method.toLowerCase()] = desc;
          tags
            .filter(tag => !hasTag(tag))
            .forEach(tag =>
              openapi.tags.push({
                name: tag
              })
            );
        });
      });
    }

    // Document aliases
    const routePaths = Object.keys(openapi.paths);
    for (const aliasEntry of this.aliasMap) {
      const def = aliasEntry.definition;
      const isHidden = def.openapi === false || (def.mode === "redirect" && def.openapi !== true);
      if (isHidden && skipHidden) {
        continue;
      }
      let path = aliasEntry.url;
      if (path.indexOf("{?") >= 0) {
        path = path.substring(0, path.indexOf("{?"));
      }
      openapi.paths[path] = openapi.paths[path] || {};
      const aliasDeclaredPathParams: string[] = [];
      if (aliasEntry._uriTemplateParse) {
        openapi.paths[path].parameters = [];
        aliasEntry._uriTemplateParse.varNames.forEach(varName => {
          const queryParam = aliasEntry._queryParams?.find(i => i.name === varName);
          if (queryParam) {
            openapi.paths[path].parameters.push({
              name: varName,
              in: "query",
              required: queryParam.required,
              schema: {
                type: "string"
              }
            });
            return;
          }
          const cleanName = varName.replace(/[^a-zA-Z0-9._$-]/g, "");
          aliasDeclaredPathParams.push(cleanName);
          openapi.paths[path].parameters.push({
            name: cleanName,
            in: "path",
            required: true,
            schema: {
              type: "string"
            }
          });
        });
      }

      if (def.mode === "redirect") {
        const methodsToCheck = def.methods || ["GET"];
        methodsToCheck.forEach(m => {
          openapi.paths[path][m.toLowerCase()] = {
            summary: `Redirect to ${def.target}`,
            responses: {
              [def.redirectCode || 302]: {
                description: `Redirect to ${def.target}`
              }
            }
          };
        });
        continue;
      }

      // Rewrite mode: sample expansion of target
      const sampleUrl = def.target.replace(/\$\{[^}]+\}/g, "sample");
      const targetOperations: { method: HttpMethodType; op: OpenAPIV3.OperationObject }[] = [];
      const allMethods: HttpMethodType[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];
      const allowedMethods = def.methods ? def.methods : allMethods;

      for (const p of routePaths) {
        const pTemplate = uriTemplates(p);
        const samplePath = sampleUrl.split("?")[0];
        if (p === samplePath || pTemplate.fromUri(samplePath, { strict: true }) !== undefined) {
          for (const m of allowedMethods) {
            const candidateOp = openapi.paths[p]?.[m.toLowerCase()];
            if (candidateOp) {
              targetOperations.push({ method: m, op: JSON.parse(JSON.stringify(candidateOp)) });
            }
          }
        }
      }

      if (targetOperations.length > 0) {
        for (const { method, op } of targetOperations) {
          if (op.operationId) {
            op.operationId = `${op.operationId}Alias`;
          }
          op.description = op.description ? `Alias of ${def.target}: ${op.description}` : `Alias of ${def.target}`;
          if (op.parameters) {
            op.parameters = op.parameters.filter(param => {
              if ("in" in param && param.in === "path") {
                return aliasDeclaredPathParams.includes(param.name);
              }
              return true;
            });
          }
          openapi.paths[path][method.toLowerCase()] = op;
        }
      } else {
        const methodsToEmit = def.methods || ["GET"];
        for (const m of methodsToEmit) {
          openapi.paths[path][m.toLowerCase()] = {
            summary: `Alias of ${def.target}`,
            responses: {
              200: {
                description: "Operation success"
              }
            }
          };
        }
      }
    }
  }

  /**
   * Execute the matched route handler for a web context
   * @param ctx - the operation context
   */
  async execute(ctx: WebContext<any, any, any>) {
    const httpContext = ctx.getHttpContext();
    const method = httpContext.getMethod();
    // Routes are relative to the prefix (API Gateway stage, custom domain base path…)
    const url = httpContext.getRelativeUri();

    // Handle CORS preflight
    if (method === "OPTIONS") {
      const methods = this.getRouteMethodsFromUrl(url);
      if (methods.length > 0 && (await this.checkCORSRequest(ctx))) {
        ctx.setHeader("Access-Control-Allow-Methods", methods.join(","));
        ctx.writeHead(204);
        return;
      }
      this.writeNotFound(ctx, method, url);
      return;
    }

    let targetUrl = url;
    const resolved = this.resolveAlias(ctx, method, url);
    if (resolved) {
      if (resolved.mode === "redirect") {
        const redirectUrl = httpContext.getAbsoluteUrl(resolved.url);
        const code = resolved.redirectCode || 302;
        ctx.writeHead(code, { Location: redirectUrl });
        return;
      }
      ctx.setExtension("routeAlias", { alias: resolved.alias, target: resolved.url });
      targetUrl = resolved.url;
    }

    const info = this.getRouteFromUrl(ctx, method, targetUrl);
    if (!info) {
      this.writeNotFound(ctx, method, targetUrl);
      return;
    }

    // Check request filters (authentication, etc.)
    if (!(await this.checkRequest(ctx))) {
      ctx.writeHead(403);
      return;
    }

    // Execute the route handler
    if (typeof info._method === "function") {
      await info._method(ctx);
    } else if (info._method && info.executor) {
      const service = useDynamicService<any>(info.executor);
      if (service && typeof service[info._method] === "function") {
        await service[info._method](ctx);
      }
    }
  }

  /**
   * Answer a request no route matches: 404 with the same error body a thrown
   * `NotFound` gets, so clients don't receive an empty response
   * @param ctx - the web context
   * @param method - the HTTP method
   * @param url - the requested URL
   */
  protected writeNotFound(ctx: WebContext<any, any, any>, method: string, url: string) {
    emitCoreEvent("Webda.404", { context: ctx });
    ctx.writeHead(404);
    ctx.write({ error: { code: "NOT_FOUND", message: `No route for ${method} ${url}` } });
  }

  /**
   * Verify if a request can be done
   *
   * @param context Context of the request
   * @param ctx - the operation context
   * @returns true if the condition is met
   */
  async checkRequest(ctx: IWebContext): Promise<boolean> {
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
   * @param ctx - the operation context
   * @returns true if the condition is met
   */
  protected async checkCORSRequest(ctx: IWebContext): Promise<boolean> {
    return (await Promise.all(this._requestCORSFilters.map(filter => filter.checkRequest(ctx, "CORS")))).some(v => v);
  }

  /**
   * Export the OpenAPI definition as JSON to stdout
   * @param output - file path to write to (prints to stdout if omitted)
   * @param includeHidden - include hidden routes in the output
   */
  @Command("openapi", { description: "Export the OpenAPI definition", requires: ["router", "rest-domain"] })
  openapi(
    /** @alias o @description Output file path (stdout if omitted) */
    output?: string,
    /** @description Include hidden routes */
    includeHidden?: boolean
  ) {
    const doc = this.exportOpenAPI(!includeHidden);
    const json = JSON.stringify(doc, undefined, 2);
    if (output) {
      FileUtils.save(doc, output);
      useLog("INFO", `OpenAPI definition written to ${output}`);
    } else {
      useOutput(json);
    }
  }

  /**
   * Export OpenAPI
   * @param skipHidden - whether to skip hidden entries
   * @returns the result
   */
  exportOpenAPI(skipHidden: boolean = true): OpenAPIV3.Document {
    const packageInfo = useApplication().getPackageDescription();
    let contact: OpenAPIV3.ContactObject;
    if (typeof packageInfo.author === "string") {
      contact = {
        name: packageInfo.author
      };
    } else if (packageInfo.author) {
      contact = packageInfo.author;
    }
    let license: OpenAPIV3.LicenseObject;
    if (typeof packageInfo.license === "string") {
      license = {
        name: packageInfo.license
      };
    } else if (packageInfo.license) {
      license = packageInfo.license;
    }
    const openapi: OpenAPIV3.Document = deepmerge(
      {
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
              type: "object" as const
            }
          }
        },
        paths: {},
        tags: []
      },
      useApplication().getCurrentConfiguration().openapi || {}
    ) as OpenAPIV3.Document;
    const app = useApplication();
    const models = app.getModels();
    const schemas = app.getSchemas();
    // Copy all input/output from actions
    for (const i in schemas) {
      if (!(i.endsWith(".input") || i.endsWith(".output"))) {
        continue;
      }
      // @ts-ignore
      openapi.components.schemas[i] ??= schemas[i];
      // Not sure how to test following
      /* c8 ignore next 5 */
      for (const j in schemas[i].definitions) {
        // @ts-ignore
        openapi.components.schemas[j] ??= schemas[i].definitions[j];
      }
    }
    for (const i in models) {
      const model = models[i];
      let desc: JSONSchema7 = {
        type: "object"
      };
      const modelName = model.name || i.split("/").pop();
      // A copy: the definitions move to components below, the application schema must keep them for validation.
      // A JSON one: schemas are JSON, and those of a webda.config.jsonc are JSONC proxies structuredClone rejects
      const appSchema = useApplication().getSchema(i);
      const schema: JSONSchema7 | undefined = appSchema ? JSONUtils.duplicate(appSchema) : undefined;
      if (schema) {
        for (const j in schema.definitions) {
          // @ts-ignore
          openapi.components.schemas[j] ??= schema.definitions[j];
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
      openapi.components.schemas[modelName] = JSON.parse(
        JSON.stringify(desc).replace(/#\/definitions\//g, "#/components/schemas/")
      );
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
   * @param filter - the filter to apply
   */
  registerRequestFilter(filter: RequestFilter) {
    this._requestFilters.push(filter);
  }

  /**
   * Register a CORS request filtering
   *
   * Does not apply in devMode
   * @param filter - the filter to apply
   */
  registerCORSFilter(filter: CORSFilter) {
    this._requestCORSFilters.push(filter);
  }

  /**
   * Auto-discover services that declare `request-filter` or `cors-filter` capabilities
   * and register them with the Router.
   *
   * Called during framework initialization (after all services are resolved and
   * initialized) to replace manual `registerRequestFilter(this)` calls. Iterates
   * all services, checks their {@link Service.getCapabilities} return value, and
   * registers matching services as request or CORS filters.
   *
   * @param services - Iterable of initialized services to scan for filter capabilities
   *
   * @example
   * ```typescript
   * // Called automatically by Core.init():
   * router.discoverFilters(Object.values(this.services));
   *
   * // A service with "request-filter" capability is auto-registered:
   * class HawkService extends Service implements RequestFilter {
   *   // getCapabilities() returns { "request-filter": {}, "cors-filter": {} }
   *   // → automatically registered with router as both request and CORS filter
   * }
   * ```
   */
  discoverFilters(services: Iterable<Service>): void {
    for (const service of services) {
      // Services that failed to construct are kept as undefined entries
      if (!service) continue;
      const caps = service.getCapabilities();
      if ("request-filter" in caps) {
        this.registerRequestFilter(service as unknown as RequestFilter);
      }
      if ("cors-filter" in caps) {
        this.registerCORSFilter(service as unknown as CORSFilter);
      }
    }
  }

  /**
   * Auto-discover routes declared with `@Route` (or the legacy
   * `constructor.routes` bucket) on each service, and register them with the
   * router. Called once from `Core.init()` after all services have resolved —
   * services don't have to push their own routes anymore.
   *
   * @param services - iterable of initialized services to scan
   */
  discoverRoutes(services: Iterable<Service>): void {
    for (const service of services) {
      if (!service) continue;
      // @ts-ignore — back-compat for subclasses that still populate this
      const legacy: Record<string, any[]> = service.constructor.routes || {};
      const fromMetadata: Record<string, any[]> =
        getMetadata(service.constructor as any)?.["webda.route"] || {};
      const routes: Record<string, any[]> = { ...legacy };
      for (const path in fromMetadata) {
        routes[path] = [...(routes[path] || []), ...fromMetadata[path]];
      }
      for (const path in routes) {
        for (const route of routes[path]) {
          const executor = (service as any)[route.executor];
          if (typeof executor !== "function") {
            useLog("WARN", `@Route on ${service.getName()} references non-method ${route.executor}`);
            continue;
          }
          const finalUrl = (service as any).getUrl(path, route.methods);
          if (!finalUrl) continue;
          this.addRouteToRouter(finalUrl, {
            _method: executor.bind(service),
            executor: service.getName(),
            openapi: route.openapi,
            methods: route.methods
          });
        }
      }
    }
  }
}
