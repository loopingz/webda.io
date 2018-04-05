"use strict";

const uuid = require('uuid');
const crypto = require('crypto');
const Service = require('./service');

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
   * @param {Object} info the type of executor
   */
  _addRoute(url, methods, executer) {
    let info;
    if (typeof(methods) === 'object') {
      info = methods;
    } else {
      info = {};
      info._method = executer;
      info.method = methods;
    }
    info.executor = this._name;
    this._webda.addRoute(url, info);
  }

  /**
   * Main method called by the webda framework if the route don't specify a _method
   *
   * @abstract
   */
  execute(ctx) {
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
  updateContext(ctx) {
    ctx.setExecutor(this);
  }

  /**
   * Get a service from webda
   *
   * @see Webda
   * @param {String} name of the service
   */
  getService(name) {
    return this._webda.getService(name);
  }
}

module.exports = Executor
