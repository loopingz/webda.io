"use strict";

var Webda = require('../core');
var SecureCookie = require('../utils/cookie');
var _extend = require("util")._extend;

class LambdaServer extends Webda {

	flushHeaders (executor) {
		var headers = executor._headers;
		var session = executor.session;
		var domain = ";domain=" + executor._route._http.host;
		if (executor._route._http.wildcard) {
			domain = '';
		}
		headers['Set-Cookie']='webda=' + session.save() + domain + ";httponly;";
		this._result = {};
		this._result.headers = headers;
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
	  	var executor = this.getExecutor(vhost, method, resourcePath, protocol, port, headers);
	  	var body = event["body-json"];
	  	if (executor == null) {
	  		callback("Bad mapping " + vhost + " - " + method + " " + resourcePath, null);
	  	}
	  	executor.setContext(body, session);
		return Promise.resolve(executor.execute()).then( () => {
			if (!executor._ended) {
				executor.end();
			}
			this.handleLambdaReturn(executor, callback);
		}).catch ( (err) => {
			if (typeof(err) === "number") {
				this.flushHeaders(executor);
				this._result.code = err;
			} else {
				console.log(err);
				this._result.code = 500;
			}
			this.handleLambdaReturn(executor, callback);
		});
	}

	handleLambdaReturn(executor, callback) {
		// Override when it comes for express component
		if (executor.statusCode) {
			this._result.code = executor.statusCode;
		}
		var code = 200;
		if (executor._route && executor._route.aws !== undefined && executor._route.aws.defaultCode !== undefined) {
			code = executor._route.aws.defaultCode;
			if (code == "string") {
				code = parseInt(code);
			}
		}
		console.log("expected code: ", code);
		if (this._result.code == code) {
			callback(null, this._result);
		} else {
			this._result.apiCode = "CODE_" + this._result.code.toString();
			callback(JSON.stringify(this._result), null);
		}
	}
}

module.exports = LambdaServer