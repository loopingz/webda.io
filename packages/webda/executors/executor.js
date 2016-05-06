"use strict";

const uuid = require('node-uuid');
const crypto = require('crypto');
const _extend = require('util')._extend;
const Service = require('../services/service');
const Writable = require('stream').Writable;

class Executor extends Service {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._defaultParams = params;

		if (this._defaultParams == undefined) {
			this._defaultParams = {}; 
		}
		this._flushHeaders = false;
	}

	_write(chunk, enc, next) {
		if (this._body === undefined) {
			this._body = [];
		}
	    this._body.push(chunk);
	    next();
	}

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

	setHeader(header,value) {
		this._headers[header]=value;
	}

	writeHead(httpCode, header) {
		_extend(this._headers, header);
		if (httpCode !== undefined) {
			this._returnCode = httpCode;
		}
	}

	cookie(param, value) {
		if (this._cookie === undefined) {
			this._cookie = {};
		}
		this._cookie[param]=value;
	}

	end() {
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
	}

	execute() {
		if (typeof(this._route._method) === "function") {
			return new Promise( (resolve, reject) => {
				resolve(this[this._route._method.name]());
			});
		}
		return Promise.reject(Error("Not implemented"));
	}
	
	getService(name) {
		return this._webda.getService(name);
	}

	setRoute(route) {
		this._route = route;
		this._params = _extend({}, this._defaultParams);
		this._params = _extend(this._params, route.params);
	}

	setContext(body, session, stream) {
		this.session = session;
		this.body = body;
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
