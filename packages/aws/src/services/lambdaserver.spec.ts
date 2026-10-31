import {
  HttpContext,
  registerRequestTracer,
  Route,
  Service,
  useRouter,
  WebContext,
  WebdaError,
  type RequestTracer,
  type TracedRequest
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/index.js";
import { suite, test } from "@webda/test";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { AWSEventsHandler } from "../../test/fixture.js";
import { LambdaServer, LambdaServerParameters } from "./lambdaserver.service.js";

/**
 * Service exposing routes used by the tests
 */
class ExceptionExecutor extends Service {
  /**
   * @param ctx - the context
   */
  @Route("/route/broken/{type}")
  async _brokenRoute(ctx: WebContext) {
    const type = ctx.getParameters().type;
    if (type === "unauthorized") {
      throw new WebdaError.Unauthorized("OnPurpose");
    } else if (type === "401") {
      throw 401;
    } else if (type === "Error") {
      throw new Error();
    }
  }

  /**
   * @param ctx - the context
   */
  @Route("/route/string{?test?}")
  async onString(ctx: WebContext) {
    ctx.write(`CodeCoverage${ctx.getParameters().test || ""}`);
  }

  /**
   * @param ctx - the context
   */
  @Route("/route/absolute")
  async onAbsolute(ctx: WebContext) {
    ctx.write(
      JSON.stringify({
        relative: ctx.getHttpContext().getRelativeUri(),
        absolute: ctx.getHttpContext().getAbsoluteUrl("/target")
      })
    );
  }

  /**
   * @param ctx - the context
   */
  @Route("/route/param/{uuid}{?test?}")
  async onParamString(ctx: WebContext) {
    ctx.write(`CodeCoverage${ctx.getParameters().uuid}${ctx.getParameters().test || ""}`);
  }
}

@suite
class LambdaHandlerTest extends WebdaApplicationTest {
  evt: any;
  handler: LambdaServer;
  context: any = {};
  badCheck: boolean = false;
  newExcept: boolean = false;
  filters: any[] = [];

  getTestConfiguration() {
    return {
      version: 3,
      parameters: {},
      services: {
        ExceptionExecutor: { type: "Test/ExceptionExecutor" },
        DebugMailer: { type: "WebdaTest/Mailer" },
        awsEvents: { type: "Test/AWSEvents" }
      }
    } as any;
  }

  async tweakApp(app: any) {
    await super.tweakApp(app);
    app.addModda("Test/ExceptionExecutor", ExceptionExecutor);
    app.addModda("Test/AWSEvents", AWSEventsHandler);
  }

  async beforeEach() {
    await super.beforeEach();
    this.handler = this.registerService(
      new LambdaServer("LambdaServer", new LambdaServerParameters().load({}))
    ).resolve();
    await this.handler.init();
    // Accept test.webda.io origins
    const router: any = useRouter();
    router._requestFilters = [];
    router._requestCORSFilters = [
      {
        checkRequest: async ctx =>
          (ctx.getHttpContext().getUniqueHeader("origin") || "").match(/^https:\/\/test\.webda\.io$/) !== null
      }
    ];
    this.evt = {
      httpMethod: "GET",
      headers: {
        Cookie: "webda=plop;",
        "X-Forwarded-Port": "443",
        "X-Forwarded-Proto": "https"
      },
      requestContext: {
        identity: {}
      },
      path: "/prefix/route/string",
      resource: "/route/string",
      body: JSON.stringify({})
    };
    this.getMailer().sent = [];
    AWSEventsHandler.lastEvents = [];
  }

  getMailer(): any {
    return this.webda.getService("DebugMailer");
  }

  @test
  async checkRequestNoRequestFilter() {
    this.ensureGoodCSRF();
    this.evt.queryStringParameters = { test: "Plop" };
    const res = await this.handler.handleRequest(this.evt, this.context);
    // No filter return ok now
    assert.strictEqual(res.statusCode, 200);
  }

  @test
  async checkRequestRefusedRequest() {
    this.ensureGoodCSRF();
    this.evt.queryStringParameters = { test: "Plop" };
    useRouter().registerRequestFilter({
      checkRequest: async () => false
    });
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 403);
  }

  @test
  async checkRequestRedirect() {
    this.ensureGoodCSRF();
    this.evt.queryStringParameters = { test: "Plop" };
    useRouter().registerRequestFilter({
      checkRequest: async () => {
        throw new WebdaError.Redirect("Need Auth", "https://google.com");
      }
    });
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.Location, "https://google.com");
  }

  @test
  async handleRequestCustomLaunch() {
    await this.handler.handleRequest(
      {
        command: "launch",
        service: "DebugMailer",
        method: "send",
        args: ["test"]
      },
      undefined
    );
    assert.strictEqual(this.getMailer().sent[0], "test");
  }

  @test
  async handleRequestCustomLaunchBadService() {
    await this.handler.handleRequest(
      {
        command: "launch",
        service: "DebugMailers",
        method: "send",
        args: ["test"]
      },
      undefined
    );
    assert.strictEqual(this.getMailer().sent.length, 0);
  }

  @test
  async handleRequestCustomLaunchBadMethod() {
    await this.handler.handleRequest(
      {
        command: "launch",
        service: "DebugMailer",
        method: "sends"
      },
      undefined
    );
    assert.strictEqual(this.getMailer().sent.length, 0);
  }

  @test
  async handleRequestKnownRoute() {
    this.ensureGoodCSRF();
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.body, "CodeCoverage");
    assert.strictEqual(res.headers["Access-Control-Allow-Origin"], "https://test.webda.io");
    assert.strictEqual(res.headers["Strict-Transport-Security"], "max-age=31536000; includeSubDomains; preload");
  }

  @test
  async preflightEchoesRequestedHeadersAndRouterOnes() {
    this.ensureGoodCSRF();
    useRouter().addCorsAllowedHeaders("traceparent", "X-Webda-Trace");
    this.evt.httpMethod = "OPTIONS";
    this.evt.headers["Access-Control-Request-Headers"] = "X-Api-Key, traceparent";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 204);
    const allowed = String(res.headers["Access-Control-Allow-Headers"])
      .split(",")
      .map(h => h.trim().toLowerCase());
    for (const h of ["x-api-key", "traceparent", "x-webda-trace", "content-type"]) assert.ok(allowed.includes(h), h);
    assert.strictEqual(allowed.filter(h => h === "traceparent").length, 1);
    assert.strictEqual(res.headers["Access-Control-Allow-Origin"], "https://test.webda.io");
  }

  @test
  async preflightDisallowedOriginHasNoCors() {
    this.evt.headers.Origin = "https://evil.webda.io";
    this.evt.httpMethod = "OPTIONS";
    this.evt.headers["Access-Control-Request-Headers"] = "X-Api-Key";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(
      Object.keys(res.headers).filter(h => h.toLowerCase().startsWith("access-control")),
      []
    );
    assert.strictEqual(res.headers["Vary"], "Origin");
  }

  @test
  async handleRequestIdHeader() {
    this.ensureGoodCSRF();
    this.handler.getParameters().lambdaRequestHeader = "x-webda-request-id";
    const res = await this.handler.handleRequest(this.evt, {
      ...this.context,
      awsRequestId: "toto"
    });
    assert.strictEqual(res.body, "CodeCoverage");
    assert.strictEqual(res.headers["x-webda-request-id"], "toto");
  }

  @test
  async handleRequestKnownRouteWithParamAndQuery() {
    this.ensureGoodCSRF();
    this.evt.queryStringParameters = { test: "Plop" };
    this.evt.path = "/prefix/route/param/myid";
    this.evt.resource = "/route/param/{uuid}";
    this.evt.pathParameters = { uuid: "myid" };
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.body, "CodeCoveragemyidPlop");
  }

  @test
  async handleRequestStagedKeepsPrefix() {
    this.ensureGoodCSRF();
    this.evt.headers.Host = "api.webda.io";
    this.evt.path = "/prod/route/absolute";
    this.evt.resource = "/route/absolute";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(res.body), {
      relative: "/route/absolute",
      absolute: "https://api.webda.io/prod/target"
    });
  }

  @test
  async handleRequestKnownRouteWithParam() {
    this.ensureGoodCSRF();
    this.evt.path = "/prefix/route/param/myid";
    this.evt.resource = "/route/param/{uuid}";
    this.evt.pathParameters = { uuid: "myid" };
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.body, "CodeCoveragemyid");
  }

  @test
  async handleRequestKnownRouteWithQuery() {
    this.ensureGoodCSRF();
    this.evt.queryStringParameters = { test: "Plop" };
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.body, "CodeCoveragePlop");
  }

  @test
  async handleRequestUnknownRoute() {
    this.ensureGoodCSRF();
    this.evt.path = "/route/unknown";
    this.evt.resource = "/route/unknown";
    delete this.evt.headers.Cookie;
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 404);
  }

  @test
  async handleRequestThrow401() {
    this.ensureGoodCSRF();
    this.evt.path = "/route/broken/401";
    this.evt.resource = "/route/broken/401";
    let res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 401);
    this.evt.path = "/route/broken/unauthorized";
    this.evt.resource = "/route/broken/unauthorized";
    res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 401);
  }

  @test
  async handleRequestThrowError() {
    this.ensureGoodCSRF();
    this.evt.path = "/route/broken/Error";
    this.evt.resource = "/route/broken/Error";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 500);
  }

  @test
  async handleRequestOPTIONS() {
    this.ensureGoodCSRF();
    this.evt.httpMethod = "OPTIONS";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.headers["Access-Control-Allow-Methods"], "GET");
    assert.strictEqual(res.headers["Access-Control-Max-Age"], 3600);
  }

  @test
  async handleRequestOPTIONSWith404() {
    this.ensureGoodCSRF();
    this.evt.path = "/route/unknown";
    this.evt.resource = "/route/unknown";
    this.evt.httpMethod = "OPTIONS";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 404);
  }

  @test
  async cov() {
    this.ensureGoodCSRF();
    this.evt.httpMethod = "POST";
    this.evt.headers["X-Forwarded-Port"] = "wew";
    this.evt.headers["Content-Type"] = "text/plain";
    this.evt.body = "{wew''";
    // Should fallback on port 443
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 404);
  }

  @test
  async handleRequestOriginCSRF() {
    this.evt.headers.Origin = "https://test3.webda.io";
    this.evt.headers.Host = "test3.webda.io";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 401);
  }

  @test
  async handleRequestRefererNoCORS() {
    // No more fallback on referer for CORS
    // But request should be served as no CORS is requested (lack of Origin)
    this.evt.headers.Referer = "https://test.webda.io";
    this.evt.headers.Host = "test.webda.io";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.headers["Access-Control-Allow-Origin"], undefined);
    assert.strictEqual(res.statusCode, 200);
  }

  @test
  async handleRequestHardStopCheckRequest() {
    this.evt.headers.Host = "test.webda.io";
    useRouter().registerRequestFilter(this);
    let res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 410);
    this.badCheck = true;
    res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 500);
    this.newExcept = true;
    res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 429);
  }

  async checkRequest(): Promise<boolean> {
    if (this.newExcept) {
      throw new WebdaError.TooManyRequests("Too many requests");
    }
    if (this.badCheck) {
      throw new Error("Unknown");
    }
    throw 410;
  }

  ensureGoodCSRF() {
    this.evt.headers.Origin = "https://test.webda.io";
    this.evt.headers.Host = "test.webda.io";
  }

  @test
  async awsEvents() {
    const service: AWSEventsHandler = this.webda.getService("awsEvents");
    const folder = path.join(process.cwd(), "test", "aws-events");
    for (const file of fs.readdirSync(folder)) {
      AWSEventsHandler.lastEvents = [];
      const event = JSON.parse(fs.readFileSync(path.join(folder, file)).toString());
      await this.handler.handleRequest(event, this.context);
      if (file === "api-gateway-aws-proxy.json") {
        assert.strictEqual(service.getEvents().length, 0, "API Gateway should go through the normal request handling");
      } else {
        assert.notStrictEqual(service.getEvents().length, 0, "Should have get some events:" + file);
      }
    }
    // Manual registration
    const manual = {
      isAWSEventHandled: () => true,
      handleAWSEvent: async () => {
        manualCount++;
      }
    };
    let manualCount = 0;
    this.handler.registerAWSEventsHandler(manual);
    this.handler.registerAWSEventsHandler(manual);
    await this.handler.handleRequest({ awslogs: {} }, this.context);
    assert.strictEqual(manualCount, 1);
  }

  /**
   * Wildcard path from API Gateway were missing the prefix
   *
   * @see https://github.com/loopingz/webda.io/issues/193
   */
  @test
  async computePrefix() {
    const httpContext = new HttpContext("test.webda.io", "GET", "/prefix/static1234/test/subfolder/index.html");
    this.handler.computePrefix(
      {
        path: "/prefix/static1234/test/subfolder/index.html",
        resource: "/static1234/{path+}",
        pathParameters: {
          path: "test/subfolder/index.html"
        }
      },
      httpContext
    );
    assert.strictEqual(httpContext.getRelativeUri(), "/static1234/test/subfolder/index.html");
    assert.strictEqual(httpContext.prefix, "/prefix");
  }

  /**
   * Register a recording tracer
   * @returns the recorded traces
   */
  recordTraces(): { request: TracedRequest; statuses: number[] }[] {
    const traced: { request: TracedRequest; statuses: number[] }[] = [];
    registerRequestTracer({
      trace: async (request, fn) => {
        const entry = { request, statuses: [] as number[] };
        traced.push(entry);
        return fn({ setStatus: code => entry.statuses.push(code) });
      }
    } as RequestTracer);
    return traced;
  }

  @test
  async traceRequestSourceIp() {
    const traced = this.recordTraces();
    try {
      this.evt.requestContext.identity.sourceIp = "198.51.100.7";
      this.evt.headers["X-Forwarded-For"] = "10.0.0.1, 203.0.113.9";
      this.evt.queryStringParameters = { test: "Plop" };
      const res = await this.handler.handleRequest(this.evt, this.context);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(traced.length, 1);
      assert.strictEqual(traced[0].request.protocol, "http");
      assert.strictEqual(traced[0].request.method, "GET");
      assert.strictEqual(traced[0].request.path, "/prefix/route/string");
      assert.strictEqual(traced[0].request.clientIp, "198.51.100.7");
      assert.strictEqual(traced[0].request.headers["x-forwarded-for"], "10.0.0.1, 203.0.113.9");
      assert.strictEqual(traced[0].request.headers["x-forwarded-port"], "443");
      assert.strictEqual(traced[0].request.headers["X-Forwarded-For"], undefined);
      assert.deepStrictEqual(traced[0].statuses, [200]);
    } finally {
      registerRequestTracer(undefined);
    }
  }

  @test
  async traceRequestForwardedFor() {
    const traced = this.recordTraces();
    try {
      this.evt.headers["X-Forwarded-For"] = "10.0.0.1, 203.0.113.9";
      await this.handler.handleRequest(this.evt, this.context);
      assert.strictEqual(traced[0].request.clientIp, "203.0.113.9");
      // Garbage never throws
      this.evt.headers["X-Forwarded-For"] = "not an ip";
      const res = await this.handler.handleRequest(this.evt, this.context);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(traced[1].request.clientIp, undefined);
    } finally {
      registerRequestTracer(undefined);
    }
  }

  @test
  async traceRequestRefusedOrigin() {
    const traced = this.recordTraces();
    try {
      this.evt.headers.Origin = "https://evil.example";
      const res = await this.handler.handleRequest(this.evt, this.context);
      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(traced[0].statuses, [401]);
    } finally {
      registerRequestTracer(undefined);
    }
  }

  @test
  async traceRequestSkipsNonHttpEvents() {
    const traced = this.recordTraces();
    try {
      await this.handler.handleRequest({ command: "launch", service: "unknown", method: "x" }, this.context);
      await this.handler.handleRequest({ awslogs: {} }, this.context);
      assert.strictEqual(traced.length, 0);
    } finally {
      registerRequestTracer(undefined);
    }
  }

  /**
   * Run fn capturing the WARN log messages
   * @param fn - the function to run
   * @returns the first argument of each WARN log
   */
  async warnings(fn: () => Promise<void>): Promise<string[]> {
    const memoryLogger = new MemoryLogger(useWorkerOutput());
    try {
      await fn();
    } finally {
      memoryLogger.close();
    }
    return memoryLogger
      .getLogs()
      .filter(m => m.log?.level === "WARN")
      .map(m => m.log!.args[0]);
  }

  @test
  async traceRequestDefaults() {
    const traced = this.recordTraces();
    try {
      // Plain http behind CloudFront, HTTP/1.1, no path
      this.evt.headers["CloudFront-Forwarded-Proto"] = "http";
      this.evt.requestContext.protocol = "HTTP/1.1";
      this.evt.path = undefined;
      this.evt.resource = undefined;
      const res = await this.handler.handleRequest(this.evt, this.context);
      assert.strictEqual(traced[0].request.path, "/");
      assert.strictEqual(traced[0].request.scheme, "http");
      assert.strictEqual(traced[0].request.protocolVersion, "1.1");
      // No HSTS over plain http
      assert.strictEqual(res.headers["Strict-Transport-Security"], undefined);
      // A protocol without version is unknown
      this.evt.requestContext.protocol = "HTTP/";
      await this.handler.handleRequest(this.evt, this.context);
      assert.strictEqual(traced[1].request.protocolVersion, undefined);
    } finally {
      registerRequestTracer(undefined);
    }
  }

  @test
  async traceRequestStatusFailure() {
    registerRequestTracer({
      trace: async (_request, fn) =>
        fn({
          setStatus: () => {
            throw new Error("tracer broken");
          }
        })
    });
    try {
      let res: any;
      const warnings = await this.warnings(async () => {
        res = await this.handler.handleRequest(this.evt, this.context);
      });
      // The response is not affected
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body, "CodeCoverage");
      assert.ok(warnings.includes("Request tracer failed to record the status"), warnings.join(", "));
    } finally {
      registerRequestTracer(undefined);
    }
  }

  @test
  async clientIpFromMalformedEvents() {
    const clientIp = (event: any): string | undefined => this.handler["getClientIp"](event);
    // No headers nor source ip
    assert.strictEqual(clientIp({}), undefined);
    // An invalid source ip falls back to the header, given as repeated values
    assert.strictEqual(
      clientIp({
        requestContext: { identity: { sourceIp: "garbage" } },
        headers: { "X-Forwarded-For": ["10.0.0.1", "203.0.113.9"] }
      }),
      "203.0.113.9"
    );
    // A header that is neither a string nor a list: unknown, never thrown
    let result: string | undefined = "unset";
    const warnings = await this.warnings(async () => {
      result = clientIp({ headers: { "X-Forwarded-For": 42 } });
    });
    assert.strictEqual(result, undefined);
    assert.deepStrictEqual(warnings, ["Cannot resolve the client address"]);
  }
}
