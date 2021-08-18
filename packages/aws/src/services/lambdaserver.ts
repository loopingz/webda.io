"use strict";
import {
  ClientInfo,
  Context,
  Core as Webda,
  HttpContext,
  EventWebdaRequest,
  EventWebdaResult,
  EventWebda404
} from "@webda/core";
import { serialize as cookieSerialize } from "cookie";

/**
 * Handler for AWS Events definition
 */
export interface AWSEventsHandler {
  /**
   * Return true if event is handled
   * @param source
   * @param event
   */
  isAWSEventHandled(source: string, events: any): boolean;
  /**
   *
   * @param source
   * @param event
   */
  handleAWSEvent(source: string, events: any): Promise<void>;
}

/**
 * The Lambda entrypoint for Webda
 *
 * This take the input coming from the API Gateway to transform it and analyse it with Webda
 * Once execution is done, it will format the result in a way that the API Gateway will output the result
 * You need to use the Webda deployment so the API Gateway has all the right templates in place
 *
 * @class
 */
export default class LambdaServer extends Webda {
  _result: { headers?: any; statusCode?: number; multiValueHeaders?: any; body?: any };
  _awsEventsHandlers: AWSEventsHandler[] = [];

  /**
   * @ignore
   */
  flushHeaders(ctx: Context) {
    var headers = ctx.getResponseHeaders() || {};

    this._result = {
      headers,
      statusCode: ctx.statusCode
    };
    let cookies = ctx.getResponseCookies();
    this._result.multiValueHeaders = { "Set-Cookie": [] };
    for (let i in cookies) {
      this._result.multiValueHeaders["Set-Cookie"].push(
        cookieSerialize(cookies[i].name, cookies[i].value, cookies[i].options || {})
      );
    }
  }

  /**
   * @inheritdoc
   */
  flush(ctx: Context) {
    if (ctx.getResponseBody() !== undefined) {
      this._result.body = ctx.getResponseBody();
    }
  }

  /**
   * Retrieve client information from Lambda context
   *
   * @param reqCtx
   * @returns
   */
  getClientInfo(reqCtx: any) {
    let res = new ClientInfo();
    res.ip = reqCtx.identity.sourceIp;
    res.userAgent = reqCtx.identity.userAgent;
    res.set("lambdaRequestContext", reqCtx);
    return res;
  }

  /**
   * Register a service to handle AWS Events
   * @param service
   */
  registerAWSEventsHandler(service: AWSEventsHandler) {
    if (this._awsEventsHandlers.indexOf(service) < 0) {
      this._awsEventsHandlers.push(service);
    }
  }

  private async handleAWSEvent(source, events) {
    for (let i in this._awsEventsHandlers) {
      let handler = this._awsEventsHandlers[i];
      if (handler.isAWSEventHandled(source, events)) {
        await handler.handleAWSEvent(source, events);
      }
    }
  }

  /**
   * Analyse events to try to find its type
   * @param events
   * @returns
   */
  async handleAWSEvents(events) {
    let found = false;
    if (events.Records) {
      let source = events.Records[0].eventSource;
      await this.handleAWSEvent(source, events);
      found = true;
    } else if (events.invocationId && events.records) {
      await this.handleAWSEvent("aws:kinesis", events);
      found = true;
    } else if (events["detail-type"] && events.detail && events.resources) {
      await this.handleAWSEvent("aws:scheduled-event", events);
      found = true;
    } else if (events.awslogs) {
      await this.handleAWSEvent("aws:cloudwatch-logs", events);
      found = true;
    } else if (events["CodePipeline.job"]) {
      await this.handleAWSEvent("aws:codepipeline", events);
      found = true;
    } else if (events.identityPoolId) {
      await this.handleAWSEvent("aws:cognito", events);
      found = true;
    } else if (events.configRuleId) {
      await this.handleAWSEvent("aws:config", events);
      found = true;
    } else if (events.jobDefinition || events.jobId) {
      await this.handleAWSEvent("aws:batch", events);
      found = true;
    }
    return found;
  }

  /**
   * Need to unit test this part, with sample of data coming from the API Gateway
   *
   * @ignore
   */
  async handleRequest(event, context) {
    await this.init();
    // Handle AWS event
    if (await this.handleAWSEvents(event)) {
      this.log("INFO", "Handled AWS event", event);
      return;
    }
    // Manual launch of webda
    if (event.command === "launch" && event.service && event.method) {
      let args = event.args || [];
      this.log("INFO", "Executing", event.method, "on", event.service, "with", args);
      let service = this.getService(event.service);
      if (!service) {
        this.log("ERROR", "Cannot find", event.service);
        return;
      }
      if (typeof service[event.method] !== "function") {
        this.log("ERROR", "Cannot find method", event.method, "on", event.service);
        return;
      }
      service[event.method](...args);
      this.log("INFO", "Finished");
      return;
    }
    context.callbackWaitsForEmptyEventLoop =
      (this.getConfiguration().parameters && this.getConfiguration().parameters.waitForEmptyEventLoop) || false;
    this._result = {};
    var vhost: string;
    var i: any;

    var headers = event.headers || {};
    vhost = headers.Host;
    var method = event.httpMethod || "GET";
    var protocol = headers["CloudFront-Forwarded-Proto"] || "https";
    var port = headers["X-Forwarded-Port"] || 443;
    if (typeof port === "string") {
      try {
        port = Number(port);
      } catch (err) {
        port = 443;
      }
    }
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
    var body = event.body;
    try {
      // Try to interpret as JSON by default
      body = JSON.parse(event.body);
    } catch (err) {
      if (headers["Content-Type"] === "application/json") {
        throw err;
      }
    }
    this.log("INFO", event.httpMethod || "GET", event.path);
    let httpContext = new HttpContext(vhost, method, resourcePath, protocol, port, body, headers);
    if (event.path !== event.resource) {
      let relativeUri = event.resource;
      for (let j in event.pathParameters) {
        relativeUri = relativeUri.replace(`\{${j}\}`, event.pathParameters[j]);
      }
      if (relativeUri !== event.path) {
        httpContext.setPrefix(event.path.substr(0, event.path.length - relativeUri.length));
      }
    }
    var ctx = await this.newContext(httpContext);
    // TODO Get all client info
    // event['requestContext']['identity']['sourceIp']
    ctx.clientInfo = this.getClientInfo(event.requestContext);
    ctx.clientInfo.locale = headers["Accept-Language"];
    ctx.clientInfo.referer = headers["Referer"] || headers.referer;

    // Debug mode
    await this.emitSync("Webda.Request", <EventWebdaRequest>{ context: ctx });
    if (this.getConfiguration().parameters.lambdaRequestHeader) {
      ctx.setHeader(this.getConfiguration().parameters.lambdaRequestHeader, context.awsRequestId);
    }
    // Fallback on reference as Origin is not always set by Edge
    let origin = headers.Origin || headers.origin || ctx.clientInfo.referer;
    // Set predefined headers for CORS
    if (await this.checkRequest(ctx)) {
      if (origin) {
        ctx.setHeader("Access-Control-Allow-Origin", origin);
      }
    } else {
      // Prevent CSRF
      this.log("INFO", "CSRF denied from", origin);
      ctx.statusCode = 401;
      return this.handleLambdaReturn(ctx);
    }
    if (protocol === "https") {
      // Add the HSTS header
      ctx.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    // Might want to customize this one
    ctx.setHeader("Access-Control-Max-Age", 3600);
    ctx.setHeader("Access-Control-Allow-Credentials", "true");
    ctx.setHeader("Access-Control-Allow-Headers", headers["access-control-request-headers"] || "content-type");
    if (method === "OPTIONS") {
      // Return allow all methods for now
      let routes = this.router.getRouteMethodsFromUrl(ctx.getHttpContext().getRelativeUri());
      if (routes.length == 0) {
        ctx.statusCode = 404;
        return this.handleLambdaReturn(ctx);
      }
      routes.push("OPTIONS");
      ctx.setHeader("Access-Control-Allow-Methods", routes.join(","));
      return this.handleLambdaReturn(ctx);
    }

    if (!this.updateContextWithRoute(ctx)) {
      this.emitSync("Webda.404", <EventWebda404>{ context: ctx });
      ctx.statusCode = 404;
      return this.handleLambdaReturn(ctx);
    }
    await ctx.init();
    try {
      await ctx.execute();
      return this.handleLambdaReturn(ctx);
    } catch (err) {
      if (typeof err === "number") {
        ctx.statusCode = err;
      } else {
        this.log("ERROR", err);
        ctx.statusCode = 500;
      }
      return this.handleLambdaReturn(ctx);
    }
  }

  /**
   * Collect result from Context to this._result and return it
   * @param ctx
   * @returns
   */
  async handleLambdaReturn(ctx: Context) {
    await this.emitSync("Webda.Result", <EventWebdaResult>{ context: ctx });
    await ctx.end();
    // TODO Clean to use ...this._result
    return this._result;
  }
}

export { LambdaServer };
