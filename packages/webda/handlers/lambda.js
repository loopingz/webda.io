"use strict";

var Webda = require('../core/webda');
var SecureCookie = require('../utils/cookie');
var _extend = require("util")._extend;

class LambdaServer extends Webda {

	flushHeaders (executor) {
		var headers = executor._headers;
		var session = executor.session;
		//_extend(headers, )
		var domain = ";domain=" + executor._http.host;
		if (executor._http.wildcard) {
			domain = '';
		}
		headers['Set-Cookie']='webda=' + session.save() + domain + ";httponly;";
		this._headers = headers;
		this._code = executor._returnCode;
	}

	flush (executor) {
		this._result = executor._body;
	}

	handleRequest(event, context, callback) {
		var cookies = {};
		var sessionCookie = new SecureCookie({'secret': 'webda-private-key'}, cookies.webda);
	  	var session = sessionCookie;
	  	var vhost;
	  	if (event.querystring!==undefined) {
	  		vhost = event.querystring.host;
	  	}
	  	if (vhost === undefined && event.header !== undefined) {
	  		vhost = event.header.Host;
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
	  	var method = method;
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
	  	var callable = this.getExecutor(vhost, method, resourcePath, protocol, port, headers);
	  	var body = event["body-json"];
	  	callable.context(body, session);
	  	try {
			return Promise.resolve(callable.execute()).then( () => {
				callback(null, this._result);
			}).catch ( (err) => {
				callback(err, null);
			});
		} catch (err) {
			callback(err, null);
		}
	}
}

module.exports = LambdaServer