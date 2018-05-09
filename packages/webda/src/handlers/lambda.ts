"use strict";
import {
  Core as Webda,
  SecureCookie
} from '../index';
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
  _result: any
  /**
   * @ignore
   */
  flushHeaders(ctx) {
    var headers = ctx._headers;
    // No route found probably coming from an OPTIONS
    if (ctx._route) {
      headers['Set-Cookie'] = this.getCookieHeader(ctx);
    }
    this._result = {};
    this._result.headers = headers;
    this._result.statusCode = ctx.statusCode;
  }

  flush(ctx) {
    if (ctx._body !== undefined) {
      this._result.body = ctx._body;
    }
  }

  /**
   * Need to unit test this part, with sample of data coming from the API Gateway
   *
   * @ignore
   */
  async handleRequest(event, context, callback) {
    this._result = {};
    var cookies: any = {};
    var rawCookie = event.headers.Cookie;
    if (rawCookie) {
      cookies = cookieParse(rawCookie);
    }
    var sessionCookie = new SecureCookie({
      'secret': 'webda-private-key'
    }, cookies.webda).getProxy();
    var session = sessionCookie;
    var vhost;
    var i;

    var headers = event.headers || {};
    vhost = headers.Host;
    var method = event.httpMethod || 'GET';
    var protocol = headers['CloudFront-Forwarded-Proto'] || 'https';
    var port = headers['X-Forwarded-Port'] || 443;

    var resourcePath = event.path;
    // Rebuild query string
    if (event.queryStringParameters) {
      var sep = "?";
      for (i in event.queryStringParameters) {
        // If additional error code it will be contained so need to check for &
        // May need to add urlencode
        resourcePath += sep + i + "=" + event.queryStringParameters[i];
        sep = "&";
      }
    }
    //
    var body = JSON.parse(event.body);
    var ctx = this.newContext(body, session);
    // Debug mode
    await this.emitSync('Webda.Request', vhost, method, resourcePath, ctx.getCurrentUserId(), body);

    let origin = headers.Origin || headers.origin;
    // Set predefined headers for CORS
    if (origin) {
      let website = this.getGlobalParams().website || "";
      if (Array.isArray(website)) {
        website = website.join(',');
      }
      if (website.indexOf(origin) >= 0 || website === '*') {
        ctx.setHeader('Access-Control-Allow-Origin', origin);
      }
    }
    ctx.setHeader('Access-Control-Allow-Credentials', 'true');

    if (method === 'OPTIONS') {
      // Return allow all methods for now
      let routes = this.getRouteMethodsFromUrl(resourcePath);
      if (routes.length == 0) {
        ctx.statusCode = 404;
        return this.handleLambdaReturn(ctx, callback);
      }
      routes.push('OPTIONS');
      ctx.setHeader('Access-Control-Allow-Methods', routes.join(','));
      await ctx.end();
      return this.handleLambdaReturn(ctx, callback);
    }

    var executor = this.getExecutor(ctx, vhost, method, resourcePath, protocol, port, headers);

    if (executor == null) {
      this.emit('Webda.404', vhost, method, resourcePath, ctx.getCurrentUserId(), body);
      ctx.statusCode = 404;
      return this.handleLambdaReturn(ctx, callback);
    }
    ctx.init();
    try {
      await executor.execute(ctx);
      if (!ctx._ended) {
        await ctx.end();
      }
      return this.handleLambdaReturn(ctx, callback);
    } catch (err) {
      if (typeof(err) === "number") {
        ctx.statusCode = err;
        this.flushHeaders(ctx);
      } else {
        this.log('ERROR', err);
        ctx.statusCode = 500;
      }
      return this.handleLambdaReturn(ctx, callback);
    }
  }

  async handleLambdaReturn(ctx, callback) {
    // Override when it comes for express component
    if (ctx.statusCode) {
      this._result.code = ctx.statusCode;
    }
    await this.emitSync('Webda.Result', ctx, this._result);
    callback(null, {
      statusCode: ctx.statusCode,
      headers: this._result.headers,
      body: this._result.body
    });
  }
}

export {
  LambdaServer
}
