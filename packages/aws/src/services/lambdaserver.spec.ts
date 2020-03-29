import { Application, Bean, Route, Service } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import * as fs from "fs";
import { suite, test } from "mocha-typescript";
import { LambdaServer } from "./lambdaserver";

@Bean
class ExceptionExecutor extends Service {
  initRoutes() {
    this._addRoute("/broken/{type}", ["GET"], this._brokenRoute);
    this._addRoute("/route/string", ["GET"], this.onString);
  }

  @Route("/route/broken/{type}")
  async _brokenRoute(ctx) {
    if (ctx._params.type === "401") {
      throw 401;
    } else if (ctx._params.type === "Error") {
      throw new Error();
    }
  }

  @Route("/route/string")
  async onString(ctx) {
    ctx.write("CodeCoverage");
  }
}

@suite
class LambdaHandlerTest extends WebdaTest {
  evt: any;
  handler: LambdaServer;
  debugMailer: any;
  context: any = {};

  async before() {
    let app = new Application(this.getTestConfiguration());
    app.loadLocalModule();
    this.webda = this.handler = new LambdaServer(app);
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
      path: "/route/string",
      body: JSON.stringify({})
    };
    this.debugMailer = this.handler.getService("DebugMailer");
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
      {}
    );
    assert.equal(this.debugMailer.sent[0], "test");
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
      {}
    );
    assert.equal(this.debugMailer.sent.length, 0);
  }

  @test
  async handleRequestCustomLaunchBadMethod() {
    await this.handler.handleRequest(
      {
        command: "launch",
        service: "DebugMailer",
        method: "sends"
      },
      {}
    );
    assert.equal(this.debugMailer.sent.length, 0);
  }

  @test
  async handleRequestKnownRoute() {
    this.ensureGoodCSRF();
    let res = await this.handler.handleRequest(this.evt, this.context);
    assert.equal(res.body, "CodeCoverage");
  }

  @test
  async handleRequestUnknownRoute() {
    this.ensureGoodCSRF();
    this.evt.path = "/route/unknown";
    delete this.evt.headers.Cookie;
    let res = await this.handler.handleRequest(this.evt, this.context);
    assert.equal(res.statusCode, 404);
  }

  @test
  async handleRequestThrow401() {
    this.ensureGoodCSRF();
    this.evt.path = "/route/broken/401";
    let res = await this.handler.handleRequest(this.evt, this.context);
    assert.equal(res.statusCode, 401);
  }

  @test
  async handleRequestThrowError() {
    this.ensureGoodCSRF();
    this.evt.path = "/route/broken/Error";
    let res = await this.handler.handleRequest(this.evt, this.context);
    assert.equal(res.statusCode, 500);
  }

  @test
  async handleRequestOPTIONS() {
    this.ensureGoodCSRF();
    this.evt.httpMethod = "OPTIONS";
    let res = await this.handler.handleRequest(this.evt, this.context);
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["Access-Control-Allow-Methods"], "GET,OPTIONS");
  }

  @test
  async handleRequestOPTIONSWith404() {
    this.ensureGoodCSRF();
    this.evt.path = "/route/unknown";
    this.evt.httpMethod = "OPTIONS";
    let res = await this.handler.handleRequest(this.evt, this.context);
    assert.equal(res.statusCode, 404);
  }

  @test
  async handleRequestQueryParams() {
    // TODO Check parameter retrieval
    this.evt.queryStringParameters = {
      test: "plop"
    };
    await this.handler.handleRequest(this.evt, this.context);
  }

  @test
  async handleRequestOrigin() {
    this.evt.headers.Origin = "https://test.webda.io";
    this.evt.headers.Host = "test.webda.io";
    let wait = false;
    this.handler.on("Webda.Result", () => {
      return new Promise((resolve, reject) => {
        // Delay 100ms to ensure it waited
        setTimeout(() => {
          wait = true;
          resolve();
        }, 100);
      });
    });
    let res = await this.handler.handleRequest(this.evt, this.context);
    assert.equal(res.headers["Access-Control-Allow-Origin"], this.evt.headers.Origin);
    assert.equal(wait, true);
  }

  @test
  async handleRequestOriginCSRF() {
    this.evt.headers.Origin = "https://test3.webda.io";
    this.evt.headers.Host = "test3.webda.io";
    let res = await this.handler.handleRequest(this.evt, context);
    assert.equal(res.statusCode, 401);
  }

  @test
  async handleRequestRefererCSRF() {
    this.evt.headers.Referer = "https://test3.webda.io";
    this.evt.headers.Host = "test3.webda.io";
    let res = await this.handler.handleRequest(this.evt, context);
    assert.equal(res.statusCode, 401);
  }

  @test
  async handleRequestRefererGoodCORS() {
    this.evt.headers.Referer = "https://test.webda.io";
    this.evt.headers.Host = "test.webda.io";
    let res = await this.handler.handleRequest(this.evt, context);
    assert.equal(res.headers["Access-Control-Allow-Origin"], this.evt.headers.Referer);
  }

  ensureGoodCSRF() {
    this.evt.headers.Referer = "https://test.webda.io";
    this.evt.headers.Host = "test.webda.io";
  }

  @test
  consumeAllModdas() {
    super.consumeAllModdas();
  }

  @test
  async awsEvents() {
    let service: any = this.handler.getService("awsEvents");
    let files = fs.readdirSync(__dirname + "/../test/aws-events");
    for (let f in files) {
      let file = files[f];
      let event = JSON.parse(fs.readFileSync(__dirname + "/../test/aws-events/" + file).toString());
      await this.handler.handleRequest(event, context);
      if (file === "api-gateway-aws-proxy.json") {
        assert.equal(service.getEvents().length, 0, "API Gateway should go throught the normal request handling");
      } else {
        assert.notEqual(service.getEvents().length, 0, "Should have get some events:" + JSON.stringify(event));
      }
    }
  }
}
