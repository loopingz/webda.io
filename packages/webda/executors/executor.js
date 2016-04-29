"use strict";

const uuid = require('node-uuid');
const crypto = require('crypto');
const Service = require('../services/service');

class Executor extends Service {
	constructor(webda, name, callable) {
		super(webda, name, callable);
		var self = this;
		self.callable = callable;
		self.params = callable.params;
		if (self.params == undefined) {
			self.params = {}; 
		}
	}

	context(req, res) {
		this.session = req.session;
		this.body = req.body;
		this._rawResponse = res;
		this._rawRequest = req;
	}

	write(output) {
		this._rawResponse.write(output);
	}

	writeHead(httpCode, header) {
		this._rawResponse.writeHead(httpCode, header);
	}

	cookie(param, value) {
		if (this._cookie === undefined) {
			this._cookie = {};
		}
		this._cookie[param]=value;
	}
	end() {
		if (this._rawResponse === undefined) {
			return;
		}
		if (this._rawResponse.ended === undefined) {
			this._rawResponse.end();
		}
		this._rawResponse.ended = true;
		// Throw an exception ?
	}

	execute() {
		this.writeHead(200, {'Content-Type': 'text/plain'});
	  	this.write("Callable is " + JSON.stringify(callable));
	  	this.end();
	}
	
	getService(name) {
		return this._webda.getService(name);
	}

	getStore(name) {
		return this.getService(name);
	}

	enrichRoutes(map) {
		return {};
	}

	setParameters(params) {
		this.params = params;
		if (this.params === undefined) {
			this.params = {};
		}
	}

	enrichParameters(params) {
		for (var property in params) {
	    	if (this.params[property] === undefined) {
	      		this.params[property] = params[property];
	    	}
	  	}
	}
}

module.exports = Executor
