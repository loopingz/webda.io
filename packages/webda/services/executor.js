"use strict";

const uuid = require('node-uuid');
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
	 * Main method called by the webda framework if the route don't specify a _method
	 *
	 * @abstract
	 */
	execute(ctx) {
		if (typeof(ctx._route._method) === "function") {
			return new Promise( (resolve, reject) => {
				resolve(this[ctx._route._method.name](ctx));
			});
		}
		return Promise.reject(Error("Not implemented"));
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
