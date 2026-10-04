import {
  emitCoreEvent,
  HttpContext,
  HttpMethodType,
  runWithContext,
  Service,
  ServiceParameters,
  useCore,
  useRouter,
  WebContext,
  WebdaError
} from "@webda/core";
import type { APIGatewayProxyEvent, Context as LambdaContext, S3Event } from "aws-lambda";
import { serialize as cookieSerialize } from "cookie";
import type { LambdaCommandEvent } from "./lambdacaller.service.js";

/**
 * Handler for AWS Events definition
 *
 * Any service implementing these two methods receives the AWS events
 * that are not API Gateway requests
 */
export interface AWSEventsHandler {
  /**
   * Return true if event is handled
   * @param source - the event source (aws:s3, aws:sqs, ...)
   * @param events - the raw event
   */
  isAWSEventHandled(source: string, events: any): boolean;
  /**
   * Process the event
   * @param source - the event source (aws:s3, aws:sqs, ...)
   * @param events - the raw event
   */
  handleAWSEvent(source: string, events: any): Promise<void>;
}

/**
 * Result returned to the API Gateway
 */
export interface LambdaServerResult {
  headers?: any;
  statusCode?: number;
  multiValueHeaders?: any;
  body?: any;
}

/**
 * LambdaServer parameters
 */
export class LambdaServerParameters extends ServiceParameters {
  /**
   * Header to add to the response with the Lambda request id
   */
  lambdaRequestHeader?: string;
  /**
   * Set the Lambda callbackWaitsForEmptyEventLoop
   * @default false
   */
  waitForEmptyEventLoop?: boolean;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.waitForEmptyEventLoop ??= false;
    return this;
  }
}

/**
 * The Lambda entrypoint for Webda
 *
 * This take the input coming from the API Gateway to transform it and analyse it with Webda
 * Once execution is done, it will format the result in a way that the API Gateway will output the result
 *
 * Other AWS events are dispatched to the services implementing {@link AWSEventsHandler}
 *
 * @WebdaModda
 */
export class LambdaServer<T extends LambdaServerParameters = LambdaServerParameters> extends Service<T> {
  /**
   * Handlers registered manually
   */
  _awsEventsHandlers: AWSEventsHandler[] = [];

  /**
   * Register a service to handle AWS Events
   *
   * Services implementing {@link AWSEventsHandler} are discovered automatically
   * @param service - the handler
   */
  registerAWSEventsHandler(service: AWSEventsHandler) {
    if (this._awsEventsHandlers.indexOf(service) < 0) {
      this._awsEventsHandlers.push(service);
    }
  }

  /**
   * Return all the AWS events handlers: the registered ones and the services implementing the interface
   * @returns the handlers
   */
  getAWSEventsHandlers(): AWSEventsHandler[] {
    const handlers = [...this._awsEventsHandlers];
    for (const service of Object.values(useCore()?.getServices() ?? {})) {
      const handler = service as unknown as AWSEventsHandler;
      if (
        typeof handler?.isAWSEventHandled === "function" &&
        typeof handler?.handleAWSEvent === "function" &&
        !handlers.includes(handler)
      ) {
        handlers.push(handler);
      }
    }
    return handlers;
  }

  /**
   * Dispatch an event to the handlers
   * @param source - the event source
   * @param events - the raw event
   */
  private async handleAWSEvent(source: string, events: any) {
    for (const handler of this.getAWSEventsHandlers()) {
      if (handler.isAWSEventHandled(source, events)) {
        await handler.handleAWSEvent(source, events);
      }
    }
  }

  /**
   * Analyse events to try to find its type
   * @param events - the raw event
   * @returns true if the event was an AWS event
   */
  async handleAWSEvents(events: any): Promise<boolean> {
    if (events.Records) {
      await this.handleAWSEvent(events.Records[0].eventSource || events.Records[0].EventSource, <S3Event>events);
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
   * Execute a `launch` command: call a method on a service
   * @param commandEvent - the command
   */
  protected async handleLaunch(commandEvent: LambdaCommandEvent) {
    const args = commandEvent.args || [];
    this.log("INFO", "Executing", commandEvent.method, "on", commandEvent.service, "with", args);
    const service = useCore().getServices()[commandEvent.service];
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
  }

  /**
   * Handle a Lambda invocation
   *
   * Dispatch AWS events, `launch` commands or API Gateway requests
   *
   * @param sourceEvent - the Lambda event
   * @param context - the Lambda context
   * @returns the API Gateway result for HTTP requests
   */
  async handleRequest(sourceEvent: any, context: LambdaContext): Promise<LambdaServerResult | undefined> {
    // Handle AWS event
    if (await this.handleAWSEvents(sourceEvent)) {
      this.log("INFO", "Handled AWS event", sourceEvent);
      return;
    }
    // Manual launch of webda
    if (sourceEvent.command === "launch" && sourceEvent.service && sourceEvent.method) {
      await this.handleLaunch(sourceEvent);
      return;
    }

    const event: APIGatewayProxyEvent = <APIGatewayProxyEvent>sourceEvent;
    if (context) {
      context.callbackWaitsForEmptyEventLoop = this.parameters.waitForEmptyEventLoop;
    }

    const headers = event.headers || {};
    const vhost = headers.Host || headers.host;
    const method = event.httpMethod || "GET";
    const protocol = headers["CloudFront-Forwarded-Proto"] || "https";
    let port: number | string = headers["X-Forwarded-Port"] || 443;
    if (typeof port === "string") {
      port = Number(port);
      if (isNaN(port)) {
        port = 443;
      }
    }
    // The router matches on the full uri, remove the API Gateway prefix (stage, custom domain path)
    let resourcePath = event.path.substring(this.getPrefix(event).length) || "/";
    // Rebuild query string
    if (event.queryStringParameters) {
      let sep = "?";
      for (const i in event.queryStringParameters) {
        // If additional error code it will be contained so need to check for &
        // May need to add urlencode
        resourcePath += sep + i + "=" + event.queryStringParameters[i];
        sep = "&";
      }
    }
    this.log("INFO", method, event.path);
    const httpContext = new HttpContext(
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
    const ctx = new WebContext(httpContext);
    await ctx.init();
    await emitCoreEvent("Webda.NewContext", { context: ctx, info: { http: httpContext } });

    await runWithContext(ctx, async () => {
      emitCoreEvent("Webda.Request", { context: ctx });
      if (this.parameters.lambdaRequestHeader && context?.awsRequestId) {
        ctx.setHeader(this.parameters.lambdaRequestHeader, context.awsRequestId);
      }
      const origin = headers.Origin || headers.origin;
      try {
        // Set predefined headers for CORS
        if (origin) {
          if (!(await useRouter()["checkCORSRequest"](ctx))) {
            // Prevent CSRF
            this.log("INFO", "CSRF denied from", origin);
            ctx.statusCode = 401;
            return;
          }
          ctx.setHeader("Access-Control-Allow-Origin", origin);
          ctx.setHeader("Access-Control-Allow-Credentials", "true");
        }
        if (protocol === "https") {
          // Add the HSTS header
          ctx.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
        }
        if (method === "OPTIONS") {
          // Might want to customize this one
          ctx.setHeader("Access-Control-Max-Age", 3600);
          ctx.setHeader(
            "Access-Control-Allow-Headers",
            headers["access-control-request-headers"] || headers["Access-Control-Request-Headers"] || "content-type"
          );
        }
        await useRouter().execute(ctx);
      } catch (err) {
        if (typeof err === "number") {
          ctx.statusCode = err;
        } else if (err instanceof WebdaError.HttpError) {
          this.log("DEBUG", "Sending error", err.message);
          ctx.statusCode = err.getResponseCode();
          // Handle redirect
          if (err instanceof WebdaError.Redirect) {
            ctx.setHeader("Location", err.location);
          }
        } else {
          this.log("ERROR", err);
          ctx.statusCode = 500;
        }
      }
      emitCoreEvent("Webda.Result", { context: ctx });
    });
    return this.handleLambdaReturn(ctx);
  }

  /**
   * Based on API Gateway event compute the prefix if any
   * @param event - the API Gateway event
   * @returns the prefix or an empty string
   */
  getPrefix(event: any): string {
    if (event.resource && event.path !== event.resource) {
      let relativeUri = event.resource;
      for (const j in event.pathParameters) {
        relativeUri = relativeUri.replace(new RegExp(`\\{${j}\\+?\\}`), event.pathParameters[j]);
      }
      if (relativeUri !== event.path && event.path.endsWith(relativeUri)) {
        return event.path.substring(0, event.path.length - relativeUri.length);
      }
    }
    return "";
  }

  /**
   * Based on API Gateway event set the prefix on the http context if any
   * @param event - the API Gateway event
   * @param httpContext - the context to update
   */
  computePrefix(event: any, httpContext: HttpContext) {
    const prefix = this.getPrefix(event);
    if (prefix) {
      httpContext.setPrefix(prefix);
    }
  }

  /**
   * End the context and build the API Gateway result from it
   * @param context - the web context
   * @returns the API Gateway result
   */
  async handleLambdaReturn(context: WebContext): Promise<LambdaServerResult> {
    // Ending the context flushes (and resets) the headers
    const headers = { ...(context.getResponseHeaders() || {}) };
    await context.end();
    const result: LambdaServerResult = {
      headers: { ...headers, ...(context.getResponseHeaders() || {}) },
      statusCode: context.getResponseCode(),
      multiValueHeaders: { "Set-Cookie": [] }
    };
    const cookies = context.getResponseCookies();
    for (const i in cookies) {
      result.multiValueHeaders["Set-Cookie"].push(
        cookieSerialize(cookies[i].name, cookies[i].value, cookies[i].options || {})
      );
    }
    const body = context.getResponseBody();
    if (body !== undefined && body !== false && body !== "") {
      result.body = body.toString();
    }
    return result;
  }
}

export default LambdaServer;
