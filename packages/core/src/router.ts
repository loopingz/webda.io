import { OpenAPIV3 } from "openapi-types";
import * as uriTemplates from "uri-templates";
import { Core } from "./core";
import { Context } from "./utils/context";

/**
 * Manage Route resolution
 * @category CoreFeatures
 */
export class Router {
  protected routes: Map<string, any> = new Map();
  protected initiated: boolean = false;
  protected pathMap: any[];
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
  addRoute(url, info): void {
    this.routes[url] = info;
    if (this.initiated) {
      this.remapRoutes();
    }
  }

  /**
   * Remove a route dynamicly
   *
   * @param {String} url to remove
   */
  removeRoute(url): void {
    delete this.routes[url];
    this.remapRoutes();
  }

  public remapRoutes() {
    this.initURITemplates(this.routes);

    // Order path desc
    this.pathMap = [];
    for (var i in this.routes) {
      // Might need to trail the query string
      this.pathMap.push({
        url: i,
        config: this.routes[i]
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
      if (map.indexOf("{") != -1) {
        config[map]["_uri-template-parse"] = uriTemplates(map);
      }
    }
  }

  /**
   * Get all method for a specific url
   * @param config
   * @param method
   * @param url
   */
  getRouteMethodsFromUrl(url): string[] {
    let methods = [];
    for (let i in this.pathMap) {
      var routeUrl = this.pathMap[i].url;
      var map = this.pathMap[i].config;

      if (
        routeUrl !== url &&
        (map["_uri-template-parse"] === undefined || map["_uri-template-parse"].fromUri(url) === undefined)
      ) {
        continue;
      }

      if (Array.isArray(map["method"])) {
        methods = methods.concat(map["method"]);
      } else {
        methods.push(map["method"]);
      }
    }
    return methods;
  }

  /**
   * Get the route from a method / url
   */
  public getRouteFromUrl(ctx: Context, method, url): any {
    let parameters = this.webda.getConfiguration().parameters;
    for (let i in this.pathMap) {
      var routeUrl = this.pathMap[i].url;
      var map = this.pathMap[i].config;

      // Check method
      if (Array.isArray(map["method"])) {
        if (map["method"].indexOf(method) === -1) {
          continue;
        }
      } else if (map["method"] !== method) {
        continue;
      }

      if (routeUrl === url) {
        ctx.setServiceParameters(parameters);
        return map;
      }

      if (map["_uri-template-parse"] === undefined) {
        continue;
      }
      var parse_result = map["_uri-template-parse"].fromUri(url);
      if (parse_result !== undefined) {
        ctx.setServiceParameters(parameters);
        ctx.setPathParameters(parse_result);

        return map;
      }
    }
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
      let route = this.routes[i];
      if (!route.openapi) {
        route.openapi = {
          methods: {}
        };
      }
      if (route.openapi.hidden && skipHidden) {
        continue;
      }
      route.openapi.hidden = false;
      let urlParameters = [];
      if (i.indexOf("{?") >= 0) {
        urlParameters = i.substring(i.indexOf("{?") + 2, i.length - 1).split(",");
        i = i.substr(0, i.indexOf("{?"));
      }
      openapi.paths[i] = {};
      if (!Array.isArray(route.method)) {
        route.method = [route.method];
      }
      if (route["_uri-template-parse"]) {
        openapi.paths[i].parameters = [];
        route["_uri-template-parse"].varNames.forEach(varName => {
          if (urlParameters.indexOf(varName) >= 0) {
            let name = varName;
            if (name.startsWith("*")) {
              name = name.substr(1);
            }
            openapi.paths[i].parameters.push({
              name,
              in: "query",
              required: !varName.startsWith("*")
            });
            return;
          }
          openapi.paths[i].parameters.push({
            // ^[a-zA-Z0-9._$-]+$] is the official regex of AWS
            name: varName.replace(/[^a-zA-Z0-9._$-]/g, ""),
            in: "path",
            required: true
          });
        });
      }
      route.method.forEach(method => {
        let responses;
        let schema;
        let description;
        let summary;
        let operationId;
        if (route.openapi[method.toLowerCase()]) {
          responses = route.openapi[method.toLowerCase()].responses;
          schema = route.openapi[method.toLowerCase()].schema;
          description = route.openapi[method.toLowerCase()].description;
          summary = route.openapi[method.toLowerCase()].summary;
          operationId = route.openapi[method.toLowerCase()].operationId;
        }
        schema = schema || {
          $ref: "#/definitions/" + (route.openapi.model || "Object")
        };
        responses = responses || {
          200: {
            description: "Operation success"
          }
        };
        for (let j in responses) {
          if (typeof responses[j] === "string") {
            responses[j] = {
              description: responses[j]
            };
          }
          if (!responses[j].schema && responses[j].model) {
            responses[j].schema = {
              $ref: "#/definitions/" + responses[j].model
            };
            delete responses[j].model;
          }
          let code = parseInt(j);
          if (code < 300 && code >= 200 && !responses[j].description) {
            responses[j].description = "Operation success";
          }
        }
        let desc: any = {
          tags: route.openapi.tags || [route.executor],
          responses: responses,
          description,
          summary,
          operationId
        };
        if (method.toLowerCase().startsWith("p")) {
          desc.parameters = [
            {
              in: "body",
              name: "body",
              description: "",
              required: true,
              schema: schema
            }
          ];
        }
        openapi.paths[i][method.toLowerCase()] = desc;
      });
      if (route.openapi.tags) {
        route.openapi.tags.forEach(tag => {
          if (!hasTag(tag)) {
            openapi.tags.push({
              name: tag
            });
          }
        });
      }
      if (!route.openapi.tags) {
        if (!hasTag(route.executor)) {
          openapi.tags.push({
            name: route.executor
          });
        }
      }
    }
  }
}
