import { Core as Webda, HttpContext, HttpMethodType, WebContext, WebdaError } from "@webda/core";
import { APIGatewayProxyEvent, Context as LambdaContext, S3Event } from "aws-lambda";
import { serialize as cookieSerialize } from "cookie";
import { LambdaCommandEvent } from "./lambdacaller";

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
  _result: {
    headers?: any;
    statusCode?: number;
    multiValueHeaders?: any;
    body?: any;
  };
  _awsEventsHandlers: AWSEventsHandler[] = [];

  /**
   * @ignore
   */
  flushHeaders(ctx: WebContext) {
    const headers = ctx.getResponseHeaders() || {};

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
  flush(ctx: WebContext) {
    const body = ctx.getResponseBody();
    if (body !== undefined && body !== false) {
      this._result.body = body;
    }
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
    if (events.Records) {
      await this.handleAWSEvent(events.Records[0].eventSource, <S3Event>events);
      return true;
    } else if (events.invocationId && events.records) {
      await this.handleAWSEvent("aws:kinesis", events);
      return true;
    } else if (events["detail-type"] && events.detail && events.resources) {
      await this.handleAWSEvent("aws:scheduled-event", events);
      return true;
    } else if (events.awslogs) {
      await this.handleAWSEvent("aws:cloudwatch-logs", events);
      return true;
    } else if (events["CodePipeline.job"]) {
      await this.handleAWSEvent("aws:codepipeline", events);
      return true;
    } else if (events.identityPoolId) {
      await this.handleAWSEvent("aws:cognito", events);
      return true;
    } else if (events.configRuleId) {
      await this.handleAWSEvent("aws:config", events);
      return true;
    } else if (events.jobDefinition || events.jobId) {
      await this.handleAWSEvent("aws:batch", events);
      return true;
    }
    return false;
  }

  /**
   * Need to unit test this part, with sample of data coming from the API Gateway
   *
   * @ignore
   */
  async handleRequest(sourceEvent: any, context: LambdaContext) {
    await this.init();
    // Handle AWS event
    if (await this.handleAWSEvents(sourceEvent)) {
      this.log("INFO", "Handled AWS event", sourceEvent);
      return;
    }
    // Manual launch of webda
    if (sourceEvent.command === "launch" && sourceEvent.service && sourceEvent.method) {
      let commandEvent: LambdaCommandEvent = sourceEvent;
      let args = commandEvent.args || [];
      this.log("INFO", "Executing", commandEvent.method, "on", commandEvent.service, "with", args);
      let service = this.getService(commandEvent.service);
      if (!service) {
        this.log("ERROR", "Cannot find", commandEvent.service);
        return;
      }
      if (typeof service[commandEvent.method] !== "function") {
        this.log("ERROR", "Cannot find method", commandEvent.method, "on", commandEvent.service);
        return;
      }
      await service[commandEvent.method](...args);
      this.log("INFO", "Finished");
      return;
    }

    let event: APIGatewayProxyEvent = <APIGatewayProxyEvent>sourceEvent;
    context.callbackWaitsForEmptyEventLoop =
      (this.getConfiguration().parameters && this.getConfiguration().parameters.waitForEmptyEventLoop) || false;
    this._result = {};
    let vhost: string;
    let i: any;

    let headers = event.headers || {};
    vhost = headers.Host;
    let method = event.httpMethod || "GET";
    let protocol = headers["CloudFront-Forwarded-Proto"] || "https";
    let port = headers["X-Forwarded-Port"] || 443;
    if (typeof port === "string") {
      port = Number(port);
      if (isNaN(port)) {
        port = 443;
      }
    }
    let resourcePath = event.path;
    // Rebuild query string
    if (event.queryStringParameters) {
      let sep = "?";
      for (i in event.queryStringParameters) {
        // If additional error code it will be contained so need to check for &
        // May need to add urlencode
        resourcePath += sep + i + "=" + event.queryStringParameters[i];
        sep = "&";
      }
    }
    this.log("INFO", event.httpMethod || "GET", event.path);
    let httpContext = new HttpContext(
      vhost,
      <HttpMethodType>method,
      resourcePath,
      <"http" | "https">protocol,
      port,
      headers
    ).setClientIp(headers["X-Real-Ip"]); // Might use identity.sourceIp
    if (["PUT", "PATCH", "POST", "DELETE"].includes(method)) {
      httpContext.setBody(event.body);
    }
    this.computePrefix(event, httpContext);
    let ctx = await this.newWebContext(httpContext);
    // TODO Get all client info
    // event['requestContext']['identity']['sourceIp']

    // Debug mode
    await this.emitSync("Webda.Request", { context: ctx });
    if (this.getConfiguration().parameters.lambdaRequestHeader) {
      ctx.setHeader(this.getConfiguration().parameters.lambdaRequestHeader, context.awsRequestId);
    }
    let origin = headers.Origin || headers.origin;
    try {
      // Set predefined headers for CORS
      if (!origin || (await this.checkCORSRequest(ctx))) {
        if (origin) {
          ctx.setHeader("Access-Control-Allow-Origin", origin);
        }
      } else {
        // Prevent CSRF
        this.log("INFO", "CSRF denied from", origin);
        ctx.statusCode = 401;
        return this.handleLambdaReturn(ctx);
      }
      // Check request overall
      if (!(await this.checkRequest(ctx))) {
        this.log("WARN", "Request refused");
        throw 403;
      }
    } catch (err) {
      if (typeof err === "number") {
        ctx.statusCode = err;
        return this.handleLambdaReturn(ctx);
      } else if (err instanceof WebdaError.HttpError) {
        ctx.statusCode = err.getResponseCode();
        this.log("TRACE", `${err.getResponseCode()}: ${err.message}`);
        return this.handleLambdaReturn(ctx);
      }
      throw err;
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
      this.emitSync("Webda.404", { context: ctx });
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
      } else if (err instanceof WebdaError.HttpError) {
        this.log("DEBUG", "Sending error", err.message);
        ctx.statusCode = err.getResponseCode();
      } else {
        this.log("ERROR", err);
        ctx.statusCode = 500;
      }
      return this.handleLambdaReturn(ctx);
    }
  }

  /**
   * Based on API Gateway event compute the prefix if any
   * @param event
   * @param httpContext
   */
  computePrefix(event: any, httpContext: HttpContext) {
    if (event.path !== event.resource) {
      let relativeUri = event.resource;
      for (let j in event.pathParameters) {
        relativeUri = relativeUri.replace(new RegExp(`\\{${j}\\+?\\}`), event.pathParameters[j]);
      }
      if (relativeUri !== event.path) {
        httpContext.setPrefix(event.path.substr(0, event.path.length - relativeUri.length));
      }
    }
  }

  /**
   * Collect result from Context to this._result and return it
   * @param context
   * @returns
   */
  async handleLambdaReturn(context: WebContext) {
    await this.emitSync("Webda.Result", { context });
    await context.end();
    return this._result;
  }
}

export { LambdaServer };
