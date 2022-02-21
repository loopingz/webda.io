import { JSONSchema6 } from "json-schema";
import { OpenAPIV3 } from "openapi-types";
import * as uriTemplates from "uri-templates";
import { Core } from "./core";
import { Context, HttpMethodType } from "./utils/context";

type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>;
};
enum HttpMethods {
  GET = "get",
  PUT = "put",
  POST = "post",
  DELETE = "delete",
  OPTIONS = "options",
  HEAD = "head",
  PATCH = "patch",
  TRACE = "trace"
}

export interface OpenApiWebdaOperation extends RecursivePartial<OpenAPIV3.OperationObject> {
  schemas?: {
    input?: JSONSchema6 | string;
    output?: JSONSchema6 | string;
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
   * Add a route dynamicaly
   *
   * @param {String} url of the route can contains dynamic part like {uuid}
   * @param {Object} info the type of executor
   */
  addRoute(url: string, info: RouteInfo): void {
    this.webda.log("TRACE", `Add route ${info.methods.join(",")} ${url}`);
    info.openapi ??= {};
    if (this.routes[url]) {
      // If route is already added do not do anything
      if (this.routes[url].includes(info)) {
        return;
      }
      // Check and add warning if same method is used
      let methods = this.routes[url].map((r: RouteInfo) => r.methods).flat();
      info.methods.forEach(m => {
        if (methods.indexOf(m) >= 0) {
          this.webda.log("WARN", `${m} ${url} overlap with another defined route`);
        }
      });
      // Last added need to be overriding
      this.routes[url].unshift(info);
    } else {
      this.routes[url] = [info];
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
    if (!info) {
      delete this.routes[url];
    } else if (this.routes[url] && this.routes[url].includes(info)) {
      this.routes[url].splice(this.routes[url].indexOf(info), 1);
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
    let methods = new Set<HttpMethodType>();
    for (let i in this.pathMap) {
      var routeUrl = this.pathMap[i].url;
      var map = this.pathMap[i].config;

      if (
        routeUrl !== url &&
        (map._uriTemplateParse === undefined || map._uriTemplateParse.fromUri(url) === undefined)
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
    let parameters = this.webda.getConfiguration().parameters;
    for (let i in this.pathMap) {
      var routeUrl = this.pathMap[i].url;
      var map = this.pathMap[i].config;

      // Check method
      if (map.methods.indexOf(method) === -1) {
        continue;
      }

      if (routeUrl === url) {
        ctx.setServiceParameters(parameters);
        return map;
      }

      if (map._uriTemplateParse === undefined) {
        continue;
      }
      var parse_result = map._uriTemplateParse.fromUri(url);
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
        $ref: "#/definitions/Object"
      };
    } else if (typeof schema === "string") {
      return {
        $ref: "#/definitions/" + schema
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
        if (route.openapi.hidden && skipHidden) {
          return;
        }
        route.openapi.hidden = false;
        let urlParameters = [];
        let path = i;
        if (i.indexOf("{?") >= 0) {
          urlParameters = i.substring(i.indexOf("{?") + 2, i.length - 1).split(",");
          path = i.substr(0, i.indexOf("{?"));
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
                required: !varName.startsWith("*")
              });
              return;
            }
            openapi.paths[path].parameters.push({
              // ^[a-zA-Z0-9._$-]+$] is the official regex of AWS
              name: varName.replace(/[^a-zA-Z0-9._$-]/g, ""),
              in: "path",
              required: true
            });
          });
        }
        route.methods.forEach(method => {
          let responses: { [key: string]: OpenAPIV3.ResponseObject };
          let schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject;
          let description;
          let summary;
          let operationId;
          let tags = route.openapi.tags ?? [];
          if (route.openapi[method.toLowerCase()]) {
            responses = route.openapi[method.toLowerCase()].responses;
            schema = this.getOpenAPISchema(route.openapi[method.toLowerCase()].schemas?.output);
            description = route.openapi[method.toLowerCase()].description;
            summary = route.openapi[method.toLowerCase()].summary;
            operationId = route.openapi[method.toLowerCase()].operationId;
            tags.push(...(route.openapi[method.toLowerCase()].tags || []));
          }
          responses = responses || {
            200: {
              description: "Operation success"
            }
          };
          for (let j in responses) {
            responses[j].content ??= {};
            responses[j].content["application/json"] = {
              schema
            };
            // Add default answer
            let code = parseInt(j);
            if (code < 300 && code >= 200 && !responses[j].description) {
              responses[j].description = "Operation success";
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
            operationId
          };
          if (method.toLowerCase().startsWith("p") && route.openapi[method.toLowerCase()]?.schemas?.input) {
            // Add request schema if exist
            desc.requestBody = {
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
