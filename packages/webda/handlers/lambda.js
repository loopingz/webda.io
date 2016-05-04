"use strict";

var Webda = require('../core/webda');
var SecureCookie = require('../utils/cookie');
var _extend = require("util")._extend;

class LambdaServer extends Webda {

	flushHeaders (executor) {
		var headers = executor._headers;
		var session = executor.session;
		var domain = ";domain=" + executor._http.host;
		if (executor._http.wildcard) {
			domain = '';
		}
		headers['Set-Cookie']='webda=' + session.save() + domain + ";httponly;";
		this._result = {};
		this._result.headers = headers;
		this._result.apiCode = "CODE_" + executor._returnCode;
		this._result.code = executor._returnCode;
	}

	flush (executor) {
		if (executor._body !== undefined) {
			this._result.body = executor._body;
		}
	}

	handleRequest(event, context, callback) {
		var cookies = {};
		var sessionCookie = new SecureCookie({'secret': 'webda-private-key'}, cookies.webda);
	  	var session = sessionCookie;
	  	var vhost;
	  	if (event.querystring!==undefined) {
	  		vhost = event.querystring.host;
	  	}
	  	if (vhost === undefined) {
	  		vhost = event.context.vhost;
	  	}
	  	var context = event.context;
	  	var headers;
	  	if (event.params !== undefined) {
	  		headers = event.params.header;
	  	}
	  	if (headers === undefined) {
	  		headers = {};
	  	}
	  	if (context === undefined) {
	  		context = {};
	  	}
	  	var method = context["http-method"];
	  	var resourcePath = context['resource-path'];
	  	var protocol = headers['CloudFront-Forwarded-Proto'];
	  	var port = headers['X-Forwarded-Port'];
	  	if (resourcePath === undefined) {
	  		resourcePath = "/";
	  	}
	  	if (method === undefined) {
	  		method = "GET";
	  	}
	  	if (protocol === undefined) {
	  		protocol = "https";
	  	}
	  	if (port === undefined) {
	  		port = 443;
	  	}
	  	// Replace variable in URL for now
	  	for (var i in event.params.path) {
	  		resourcePath = resourcePath.replace("{"+i+"}", event.params.path[i]);
	  	}

	  	//
	  	var callable = this.getExecutor(vhost, method, resourcePath, protocol, port, headers);
	  	var body = event["body-json"];
	  	if (callable == null) {
	  		callback("Bad mapping " + vhost + " - " + method + " " + resourcePath, null);
	  	}
	  	callable.context(body, session);
		return Promise.resolve(callable.execute()).then( () => {
			if (!callable._ended) {
				callable.end();
			}
			callback(null, this._result);
		}).catch ( (err) => {
			console.log('plop',err);
			if (typeof(err) === "number") {
				console.log('flushHeaders');
				this.flushHeaders(callable);
				console.log('flushHeaders2');
				this._result.apiCode = "CODE_" + err.toString();
				this._result.code = err;
				console.log('test', this._result);
				callback(new Error(JSON.stringify(this._result)), null);
				return;
			}
			this._result.apiCode = "CODE_500";
			this._result.err = err;
			callback(new Error(JSON.stringify(this._result)), null);
		});
	}
}

module.exports = LambdaServer