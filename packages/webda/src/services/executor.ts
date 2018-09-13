"use strict";
import {
  Service,
  Context,
  Core
} from '../index';

/**
 * An Executor is a Service that is designed to handle HTTP request to it
 * It has output methods to be able to communicate with the client
 *
 * An executor has several properties set :
 *  body : The request
 *  session : The current session object
 *  _params : like all services (but the parameters from the route definition are added)
 *  _route : The current route used
 *  query : With the query parameters
 *
 * @class
 */
class Executor extends Service {

  /**
   * Add a route dynamicaly
   *
   * @param {String} url of the route can contains dynamic part like {uuid}
   * @param {Array[]} methods
   * @param {Function} executer Method to execute for this route
   */
  _addRoute(url: string, methods: string[], executer: Function, allowPath: boolean = false) {
    let info: any = {};
    info._method = executer;
    info.method = methods;
    info.executor = this._name;
    info.allowPath = allowPath;
    this._webda.addRoute(url, info);
  }

  /**
   * Main method called by the webda framework if the route don't specify a _method
   */
  execute(ctx: Context): Promise < any > {
    if (typeof(ctx._route._method) === "function") {
      return new Promise((resolve, reject) => {
        resolve(this[ctx._route._method.name](ctx));
      });
    }
    return Promise.reject(Error("Not implemented"));
  }

  /**
   * Use this method to enhance the context if needed
   *
   */
  updateContext(ctx: Context) {
    ctx.setExecutor(this);
  }

  /**
   * Init the routes
   */
  initRoutes() {

  }

  /**
   *
   */
  resolve() {
    super.resolve();
    this.initRoutes();
  }
}

export {
  Executor
};
