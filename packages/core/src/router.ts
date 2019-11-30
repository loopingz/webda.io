import * as uriTemplates from "uri-templates";
import { Webda as Core } from "./core";
import { Context } from "./utils/context";

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
}
