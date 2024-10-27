import { Bean, HttpContext, Route, Service, WebdaError } from "@webda/core";
import { TestApplication } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import { getCommonJS } from "@webda/utils";
import * as assert from "assert";
import * as fs from "fs";
import { checkLocalStack, WebdaAwsTest } from "../index.spec";
import { LambdaServer } from "./lambdaserver";
const { __dirname } = getCommonJS(import.meta.url);

@Bean
class ExceptionExecutor extends Service {
  initRoutes() {
    super.initRoutes();
    this.addRoute("/broken/{type}", ["GET"], this._brokenRoute);
    this.addRoute("/route/string", ["GET"], this.onString);
  }

  @Route("/route/broken/{type}")
  async _brokenRoute(ctx) {
    if (ctx.parameters.type === "unauthorized") {
      throw new WebdaError.Unauthorized("OnPurpose");
    } else if (ctx.parameters.type === "401") {
      throw 401;
    } else if (ctx.parameters.type === "Error") {
      throw new Error();
    }
  }

  @Route("/route/string{?test}")
  async onString(ctx) {
    ctx.write(`CodeCoverage${ctx.getParameters().test || ""}`);
  }

  @Route("/route/param/{uuid}{?test?}")
  async onParamString(ctx) {
    ctx.write(`CodeCoverage${ctx.getParameters().uuid}${ctx.getParameters().test || ""}`);
  }
}

@suite
class LambdaHandlerTest extends WebdaAwsTest {
  evt: any;
  handler: LambdaServer;
  debugMailer: any;
  context: any = {};
  badCheck: boolean = false;
  newExcept: boolean;

  async before() {
    await checkLocalStack();
    const app = new TestApplication(this.getTestConfiguration());
    app.addService("Test/AWSEvents", (await import("../../test/moddas/awsevents.js")).AWSEventsHandler);
    await app.load();
    this.webda = this.handler = new LambdaServer(app);
    await this.webda.init();
    this.webda.registerRequestFilter({
      checkRequest: async () => true
    });
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
    this.debugMailer = this.handler.getService("DebugMailer");
  }

  @test
  async checkRequestNoRequestFilter() {
    await this.handler.init();
    // @ts-ignore
    this.handler._requestFilters = [];
    this.ensureGoodCSRF();
    this.evt.queryStringParameters = { test: "Plop" };
    const res = await this.handler.handleRequest(this.evt, this.context);
    // No filter return ok now
    assert.strictEqual(res.statusCode, 200);
  }

  @test
  async checkRequestRefusedRequest() {
    await this.handler.init();
    // @ts-ignore
    this.handler._requestFilters = [];
    this.ensureGoodCSRF();
    this.evt.queryStringParameters = { test: "Plop" };
    this.handler.registerRequestFilter({
      checkRequest: async () => false
    });
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 403);
  }

  @test
  async checkRequestRedirect() {
    await this.handler.init();
    // @ts-ignore
    this.handler._requestFilters = [];
    this.ensureGoodCSRF();
    this.evt.queryStringParameters = { test: "Plop" };
    this.handler.registerRequestFilter({
      checkRequest: async () => {
        throw new WebdaError.Redirect("Need Auth", "https://google.com");
      }
    });
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 302);
    console.log(res);
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
    assert.strictEqual(this.debugMailer.sent[0], "test");
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
    assert.strictEqual(this.debugMailer.sent.length, 0);
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
    assert.strictEqual(this.debugMailer.sent.length, 0);
  }

  @test
  async handleRequestKnownRoute() {
    this.ensureGoodCSRF();
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.body, "CodeCoverage");
  }

  @test
  async handleRequestIdHeader() {
    this.ensureGoodCSRF();
    this.handler.getConfiguration().parameters.lambdaRequestHeader = "x-webda-request-id";
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
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 500);
  }

  @test
  async handleRequestOPTIONS() {
    this.ensureGoodCSRF();
    this.evt.httpMethod = "OPTIONS";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.headers["Access-Control-Allow-Methods"], "GET,OPTIONS");
  }

  @test
  async handleRequestOPTIONSWith404() {
    this.ensureGoodCSRF();
    this.evt.path = "/route/unknown";
    this.evt.httpMethod = "OPTIONS";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 404);
  }

  @test
  async cov() {
    this.ensureGoodCSRF();
    this.evt.headers["X-Forwarded-Port"] = "wew";
    this.evt.headers["Content-Type"] = "text/plain";
    this.evt.body = "{wew''";
    // Should fallback on port 443
    await this.handler.handleRequest(this.evt, this.context);
  }

  @test
  async handleRequestQueryParams() {
    // TODO Check parameter retrieval
    this.evt.queryStringParameters = {
      test: "plop"
    };
    this.evt.headers.Origin = "https://test.webda.io";
    this.evt.headers.Host = "test.webda.io";
    await this.handler.handleRequest(this.evt, this.context);
  }

  @test
  async handleRequestOrigin() {
    this.evt.headers.Origin = "https://test.webda.io";
    this.evt.headers.Host = "test.webda.io";
    let wait = false;
    this.handler.on("Webda.Result", () => {
      return new Promise<void>((resolve, reject) => {
        // Delay 100ms to ensure it waited
        setTimeout(() => {
          wait = true;
          resolve();
        }, 100);
      });
    });
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.headers["Access-Control-Allow-Origin"], this.evt.headers.Origin);
    assert.strictEqual(wait, true);
  }

  @test
  async handleRequestOriginCSRF() {
    this.evt.headers.Origin = "https://test3.webda.io";
    this.evt.headers.Host = "test3.webda.io";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 401);
  }

  @test
  async handleRequestRefererCSRF() {
    this.evt.headers.Referer = "https://test3.webda.io";
    this.evt.headers.Host = "test3.webda.io";
    this.evt.headers.origin = "test3.webda.io";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.statusCode, 401);
  }

  @test
  async handleRequestRefererNoCORS() {
    // No more fallback on referer for CORS
    // BUt request should be served as no CORS is requested (lack of Origin)
    this.evt.headers.Referer = "https://test.webda.io";
    this.evt.headers.Host = "test.webda.io";
    const res = await this.handler.handleRequest(this.evt, this.context);
    assert.strictEqual(res.headers["Access-Control-Allow-Origin"], undefined);
    assert.strictEqual(res.statusCode, 200);
  }

  @test
  async handleRequestHardStopCheckRequest() {
    this.evt.headers.Referer = "https://test.webda.io";
    this.evt.headers.Host = "test.webda.io";
    this.handler.registerRequestFilter(this);
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
    const service: any = this.handler.getService("awsEvents");
    const files = fs.readdirSync(__dirname + "/../../test/aws-events");
    for (const f in files) {
      const file = files[f];
      const event = JSON.parse(fs.readFileSync(__dirname + "/../../test/aws-events/" + file).toString());
      await this.handler.handleRequest(event, this.context);
      if (file === "api-gateway-aws-proxy.json") {
        assert.strictEqual(service.getEvents().length, 0, "API Gateway should go through the normal request handling");
      } else {
        assert.notStrictEqual(service.getEvents().length, 0, "Should have get some events:" + JSON.stringify(event));
      }
    }
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
}
