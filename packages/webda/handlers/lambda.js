"use strict";

var Webda = require('../core');
var SecureCookie = require('../utils/cookie');
var _extend = require("util")._extend;
const cookieParse = require("cookie").parse;

/**
 * The Lambda entrypoint for Webda
 *
 * This take the input coming from the API Gateway to transform it and analyse it with Webda
 * Once execution is done, it will format the result in a way that the API Gateway will output the result
 * You need to use the Webda deployment so the API Gateway has all the right templates in place
 *
 * @class
 */
class LambdaServer extends Webda {

	/**
	 * @ignore
	 */
	flushHeaders (ctx) {
		var headers = ctx._headers;
		var session = ctx.session;
		headers['Set-Cookie']=this.getCookieHeader(ctx);
		this._result = {};
		this._result.headers = headers;
		this._result.code = ctx.statusCode;
	}

	flush (ctx) {
		if (ctx._body !== undefined) {
			this._result.body = ctx._body;
		}
	}

	/**
	 * Need to unit test this part, with sample of data coming from the API Gateway
	 *
	 * @ignore
	 */
	handleRequest(event, context, callback) {
		var cookies = {};
		var rawCookie = event.params.header.Cookie;
		if (rawCookie) {
			cookies = cookieParse(rawCookie);
		}
		var sessionCookie = new SecureCookie({'secret': 'webda-private-key'}, cookies.webda).getProxy();
	  	var session = sessionCookie;
	  	var vhost;
	  	var i;
	  	if (event.params.header!==undefined) {
	  		vhost = event.params.header.Host;
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
	  	for (i in event.params.path) {
	  		resourcePath = resourcePath.replace("{"+i+"}", event.params.path[i]);
	  	}
	  	// Rebuild query string
	  	if (event.params.querystring) {
	  		var sep = "?";
	  		for (i in event.params.querystring) {
	  			// If additional error code it will be contained so need to check for &
	  			// May need to add urlencode
	  			resourcePath += sep + i + "=" + event.params.querystring[i];
	  			sep = "&";
	  		}
	  	}
	  	//
	  	var body = event["body-json"];
	  	var ctx = this.newContext(body, session);
	  	var executor = this.getExecutor(ctx, vhost, method, resourcePath, protocol, port, headers);

	  	if (executor == null) {
	  		callback("Bad mapping " + vhost + " - " + method + " " + resourcePath, null);
	  	}
	  	
	  	// Set predefined headers for CORS
	  	if (event.params.header.Origin) {
	  		ctx.setHeader('Access-Control-Allow-Origin', event.params.header.Origin);
	  	}
  		ctx.setHeader('Access-Control-Allow-Credentials', true);

	  	
		return Promise.resolve(executor.execute(ctx)).then( () => {
			if (!ctx._ended) {
				ctx.end();
			}
			this.handleLambdaReturn(ctx, callback);
		}).catch ( (err) => {
			if (typeof(err) === "number") {
				this.flushHeaders(ctx);
				this._result.code = err;
			} else {
				console.log(err);
				this._result.code = 500;
			}
			this.handleLambdaReturn(ctx, callback);
		});
	}

	handleLambdaReturn(ctx, callback) {
		// Override when it comes for express component
		if (ctx.statusCode) {
			this._result.code = ctx.statusCode;
		}
		var code = 200;
		if (ctx._route && ctx._route.aws !== undefined && ctx._route.aws.defaultCode !== undefined) {
			code = ctx._route.aws.defaultCode;
			if (code == "string") {
				code = parseInt(code);
			}
		}

		if (this._result.code == code) {
			callback(null, this._result);
		} else {
			this._result.apiCode = "CODE_" + this._result.code.toString();
			callback(JSON.stringify(this._result), null);
		}
	}
}

module.exports = LambdaServer