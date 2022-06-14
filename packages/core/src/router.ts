import { JSONSchema7 } from "json-schema";
import { OpenAPIV3 } from "openapi-types";
import * as uriTemplates from "uri-templates";
import { Core } from "./core";
import { Context } from "./utils/context";
import { HttpMethodType } from "./utils/httpcontext";

type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>;
};

export interface OpenApiWebdaOperation extends RecursivePartial<OpenAPIV3.OperationObject> {
  schemas?: {
    input?: JSONSchema7 | string;
    output?: JSONSchema7 | string;
  };
}
/**
 * Define overridable OpenAPI description
 */
export interface OpenAPIWebdaDefinition extends RecursivePartial<OpenAPIV3.PathItemObject> {
  /**
   * Do not output for this specific Route
   *
   * It can still be output with --include-hidden, as it is needed to declare
   * the route in API Gateway or any other internal documentation
   */
  hidden?: boolean;
  /**
   * If defined will link to the model schema instead of a generic Object
   */
  model?: string;
  /**
   * Tags defined for all methods
   */
  tags?: string[];
  post?: OpenApiWebdaOperation;
  put?: OpenApiWebdaOperation;
  patch?: OpenApiWebdaOperation;
  get?: OpenApiWebdaOperation;
}

/**
 * Route Information default information
 */
export interface RouteInfo {
  /**
   * HTTP Method to expose
   */
  methods: HttpMethodType[];
  /**
   * Executor name
   */
  executor: string;
  /**
   * Method name on the executor
   */
  _method?: string | Function;
  /**
   * Allow path in path variable
   */
  allowPath?: boolean;
  /**
   * OpenAPI definition
   */
  openapi?: OpenAPIWebdaDefinition;
  /**
   * URI Template parser
   */
  _uriTemplateParse?: { fromUri: (uri: string) => any; varNames: any };
  /**
   * Hash
   */
  hash?: string;
  /**
   * Intend to override existing
   */
  override?: boolean;
}

/**
 * Manage Route resolution
 * @category CoreFeatures
 */
export class Router {
  protected routes: Map<string, RouteInfo[]> = new Map();
  protected initiated: boolean = false;
  protected pathMap: { url: string; config: RouteInfo }[];
  protected webda: Core;

  constructor(webda: Core) {
    this.webda = webda;
  }

  /**
   * Include prefix to the url if not present
   * @param url
   * @returns
   */
  getFinalUrl(url: string): string {
    const prefix = this.webda.getGlobalParams().routePrefix || "";
    if (prefix && url.startsWith(prefix)) {
      return url;
    }
    return `${prefix}${url}`;
  }

  /**
   * Add a route dynamicaly
   *
   * @param {String} url of the route can contains dynamic part like {uuid}
   * @param {Object} info the type of executor
   */
  addRoute(url: string, info: RouteInfo): void {
    const finalUrl = this.getFinalUrl(url);
    this.webda.log("TRACE", `Add route ${info.methods.join(",")} ${finalUrl}`);
    info.openapi ??= {};
    if (this.routes[finalUrl]) {
      // If route is already added do not do anything
      if (this.routes[finalUrl].includes(info)) {
        return;
      }
      // Check and add warning if same method is used
      let methods = this.routes[finalUrl].map((r: RouteInfo) => r.methods).flat();
      info.methods.forEach(m => {
        if (methods.indexOf(m) >= 0) {
          if (!info.override) {
            this.webda.log("WARN", `${m} ${finalUrl} overlap with another defined route`);
          }
        }
      });
      // Last added need to be overriding
      this.routes[finalUrl].unshift(info);
    } else {
      this.routes[finalUrl] = [info];
    }

    if (this.initiated) {
      this.remapRoutes();
    }
  }

  /**
   * Remove a route dynamicly
   *
   * @param {String} url to remove
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
   * Reinit all routes
   *
   * It will readd the URITemplates if needed
   * Sort all routes again
   */
  public remapRoutes() {
    // Might need to ensure each routes is prefixed
    const prefix = this.webda.getGlobalParams().routePrefix || "";
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
    for (var i in this.routes) {
      // Might need to trail the query string
      this.routes[i].forEach((config: RouteInfo) => {
        this.pathMap.push({
          url: i,
          config
        });
      });
    }
    this.pathMap.sort(this.comparePath);
    this.initiated = true;
  }

  protected comparePath(a, b): number {
    // Normal node works with localeCompare but not Lambda...
    // Local compare { to a return: 26 on Lambda
    let bs = b.url.split("/");
    let as = a.url.split("/");
    for (let i in as) {
      if (bs[i] === undefined) return -1;
      if (as[i] === bs[i]) continue;
      if (as[i][0] === "{" && bs[i][0] !== "{") return 1;
      if (as[i][0] !== "{" && bs[i][0] === "{") return -1;
      return bs[i] < as[i] ? -1 : 1;
    }
    return 1;
  }

  /**
   * @hidden
   */
  protected initURITemplates(config: any): void {
    // Prepare tbe URI parser
    for (var map in config) {
      if (map.indexOf("{") !== -1) {
        config[map].forEach((e: RouteInfo) => (e._uriTemplateParse = uriTemplates(map)));
      }
    }
  }

  /**
   * Get all method for a specific url
   * @param config
   * @param method
   * @param url
   */
  getRouteMethodsFromUrl(url): HttpMethodType[] {
    const finalUrl = this.getFinalUrl(url);
    let methods = new Set<HttpMethodType>();
    for (let i in this.pathMap) {
      var routeUrl = this.pathMap[i].url;
      var map = this.pathMap[i].config;

      if (
        routeUrl !== finalUrl &&
        (map._uriTemplateParse === undefined || map._uriTemplateParse.fromUri(finalUrl) === undefined)
      ) {
        continue;
      }

      map.methods.forEach(m => methods.add(m));
    }
    return Array.from(methods);
  }

  /**
   * Get the route from a method / url
   */
  public getRouteFromUrl(ctx: Context, method: HttpMethodType, url: string): any {
    const finalUrl = this.getFinalUrl(url);
    let parameters = this.webda.getConfiguration().parameters;
    for (let i in this.pathMap) {
      var routeUrl = this.pathMap[i].url;
      var map = this.pathMap[i].config;

      // Check method
      if (map.methods.indexOf(method) === -1) {
        continue;
      }

      if (routeUrl === finalUrl) {
        ctx.setServiceParameters(parameters);
        return map;
      }

      if (map._uriTemplateParse === undefined) {
        continue;
      }
      var parse_result = map._uriTemplateParse.fromUri(finalUrl);
      if (parse_result !== undefined) {
        ctx.setServiceParameters(parameters);
        ctx.setPathParameters(parse_result);

        return map;
      }
    }
  }

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
    let hasTag = (tag: string) => {
      for (let t in openapi.tags) {
        if (openapi.tags[t].name === tag) {
          return true;
        }
      }
      return false;
    };
    for (let i in this.routes) {
      this.routes[i].forEach((route: RouteInfo) => {
        route.openapi = this.webda
          .getApplication()
          .replaceVariables(route.openapi || {}, this.webda.getService(route.executor).getOpenApiReplacements());
        if (route.openapi.hidden && skipHidden) {
          return;
        }
        route.openapi.hidden = false;
        let urlParameters = [];
        let path = i;
        if (i.indexOf("{?") >= 0) {
          urlParameters = i.substring(i.indexOf("{?") + 2, i.length - 1).split(",");
          path = i.substring(0, i.indexOf("{?"));
        }
        openapi.paths[path] = openapi.paths[path] || {};
        if (route._uriTemplateParse) {
          openapi.paths[path].parameters = [];
          route._uriTemplateParse.varNames.forEach(varName => {
            if (urlParameters.indexOf(varName) >= 0) {
              let name = varName;
              if (name.startsWith("*")) {
                name = name.substr(1);
              }
              openapi.paths[path].parameters.push({
                name,
                in: "query",
                required: !varName.startsWith("*"),
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
          let tags = route.openapi.tags ?? [];
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
          for (let j in responses) {
            // Add default answer
            let code = parseInt(j);
            if (code < 300 && code >= 200 && !responses[j].description) {
              responses[j].description = "Operation success";
              responses[j].content ??= {};
              responses[j].content["application/json"] = {
                schema
              };
            }
          }
          if (tags.length === 0) {
            tags.push(route.executor);
          }
          let desc: OpenAPIV3.OperationObject = {
            tags,
            responses: responses,
            description,
            summary,
            operationId,
            requestBody
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
          tags.forEach(tag => {
            if (!hasTag(tag)) {
              openapi.tags.push({
                name: tag
              });
            }
          });
        });
      });
    }
  }
}
