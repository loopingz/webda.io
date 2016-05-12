"use strict";

const uuid = require('node-uuid');
const crypto = require('crypto');
const _extend = require('util')._extend;
const Service = require('./service');
const Writable = require('stream').Writable;

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
	 * @override
	 */
	constructor(webda, name, params) {
		super(webda, name, params);
		this._defaultParams = params;

		if (this._defaultParams == undefined) {
			this._defaultParams = {}; 
		}
		this._flushHeaders = false;
	}

	/**
	 * @private
	 * Used in case of Buffer response ( like Lambda )
	 */
	_write(chunk, enc, next) {
		if (this._body === undefined) {
			this._body = [];
		}
		console.log("_write");
	    this._body.push(chunk);
	    next();
	    return true;
	}

	/**
	 * Write data to the client
	 *
	 * @param output If it is an object it will be serializeb with toPublicJSON, if it is a String it will be appended to the result, if it is a buffer it will replace the result
	 */
	write(output) {
		if (typeof(output) == "object" && !(output instanceof Buffer)) {
			this._headers['Content-type']='application/json';
			this._body = this.toPublicJSON(output);
			return;
		} else if (typeof(output) == "string") {
			if (this._body == undefined) {
				this._body = '';
			}
			this._body += output;
			return;
		} else {
			this._body = output;
		}
	}

	/**
	 * Set a header value
	 *
	 * @param {String} header name
	 * @param {String} value
	 */
	setHeader(header,value) {
		this._headers[header]=value;
	}

	/**
	 * Write the http return code and some headers
	 * Those headers are not flushed yet so can still be overwritten
	 *
	 * @param {Number} httpCode to return to the client
	 * @param {Object} headers to add to the response
	 */
	writeHead(httpCode, headers) {
		_extend(this._headers, headers);
		if (httpCode !== undefined) {
			this._returnCode = httpCode;
		}
	}

	/**
	 * For compatibility reason
	 * 
	 * @todo Implement the serialization
	 * Not yet handle by the Webda framework
	 */
	cookie(param, value) {
		/** @ignore */
		if (this._cookie === undefined) {
			this._cookie = {};
		}
		this._cookie[param]=value;
	}

	/**
	 * Flush the request
	 *
	 * @emits 'finish' event
	 * @throws Error if the request was already ended
	 */
	end() {
		/** @ignore */
		if (this._ended) {
			throw Error("Already ended");
		}
		this._ended = true;
		if (this._buffered && this._stream._body !== undefined) {
			this._body = Buffer.concat(this._stream._body);
		}
		if (!this._flushHeaders) {
			this._flushHeaders = true;
			if (this._body !== undefined && this._returnCode == 204) {
				this._returnCode = 200;
			}
			// Coming from express kind of component
			if (this.statusCode !== undefined) {
				this._returnCode = this.statusCode;
			}
			this._webda.flushHeaders(this);
		}
		this._webda.flush(this);
		this.emit("finish");
	}

	/**
	 * Main method called by the webda framework if the route don't specify a _method
	 *
	 * @abstract
	 */
	execute() {
		if (typeof(this._route._method) === "function") {
			return new Promise( (resolve, reject) => {
				resolve(this[this._route._method.name]());
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

	/**
	 * @ignore
	 * Used by Webda framework to set the current route
	 */
	setRoute(route) {
		this._route = route;
		this._params = _extend({}, this._defaultParams);
		this._params = _extend(this._params, route.params);
		// For HTTP query compatibilty and express
		this.query = route._uriParams?route._uriParams:{};
	}

	/**
	 * @ignore
	 * Used for compatibility with express module
	 */
	logIn() {
		
	}

	/**
	 * @ignore
	 * Used by Webda framework to set the body, session and output stream if known
	 */
	setContext(body, session, stream, files) {
		this.session = session;
		this.body = body;
		this.files = files;
		this._headers = {};
		this._flushHeaders = false;
		this._returnCode = 204;
		this._body = undefined;
		this._ended = false;
		this._stream = stream;
		this._buffered = false;
		if (stream === undefined) {
			this._stream = new Writable();
			this._stream._body = [];
			this._stream._write = this._write;
		}
		this._stream.on('pipe', (src) => {
			this._flushHeaders = true;
			this._buffered = true;
		  	this._webda.flushHeaders(this);
		});
	}
}

module.exports = Executor
