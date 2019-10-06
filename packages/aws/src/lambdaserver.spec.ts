import { WebdaTest } from "@webda/core/lib/test";
import { test, suite } from "mocha-typescript";
import * as assert from "assert";
import { LambdaServer } from "./lambdaserver";
import { Executor, Service } from "@webda/core";

class ExceptionExecutor extends Executor {
  initRoutes() {
    this._addRoute("/broken/{type}", ["GET"], this._brokenRoute);
  }

  async _brokenRoute(ctx) {
    console.log("GOT _brokenRoute");
    if (ctx._params.type === "401") {
      throw 401;
    } else if (ctx._params.type === "Error") {
      throw new Error();
    }
  }
}

@suite
class LambdaHandlerTest extends WebdaTest {
  evt: any;
  handler: LambdaServer;
  debugMailer: any;
  context: any = {};

  async before() {
    this.handler = new LambdaServer(this.getTestConfiguration());
    this.handler.addRoute("/broken/401", {
      _method: this._brokenRoute.bind(this),
      method: ["GET"],
      executor: "inline",
      allowPath: false,
      swagger: {},
      callback: "function (ctx) { throw 401 }"
    });
    this.handler.addRoute("/broken/Error", {
      _method: this._brokenRoute.bind(this),
      method: ["GET"],
      executor: "inline",
      allowPath: false,
      swagger: {},
      callback: "function (ctx) { throw new Error() }"
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
      path: "/route/string",
      body: JSON.stringify({})
    };
    this.debugMailer = this.handler.getService("DebugMailer");
  }

  async _brokenRoute(ctx) {
    console.log("GOT _brokenRoute");
    if (ctx._params.type === "401") {
      throw 401;
    } else if (ctx._params.type === "Error") {
      throw new Error();
    }
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
    this.evt.path = "/broken/401";
    let res = await this.handler.handleRequest(this.evt, this.context);
    assert.equal(res.statusCode, 401);
  }

  @test
  async handleRequestThrowError() {
    this.ensureGoodCSRF();
    this.evt.path = "/broken/Error";
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
    assert.equal(
      res.headers["Access-Control-Allow-Origin"],
      this.evt.headers.Origin
    );
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
    assert.equal(
      res.headers["Access-Control-Allow-Origin"],
      this.evt.headers.Referer
    );
  }

  ensureGoodCSRF() {
    this.evt.headers.Referer = "https://test.webda.io";
    this.evt.headers.Host = "test.webda.io";
  }

  /*
  awsEvents() {
    let service;
    beforeEach(function() {
      handler = new Webda.LambdaServer(config);
      service = handler.getService("awsEvents");
      context = {};
      callback = (err, result) => {
        res = result;
      };
    });
    let files = fs.readdirSync(__dirname + "/aws-events");
    files.forEach(file => {
      it("check " + file, async function() {
        let event = JSON.parse(
          fs.readFileSync(__dirname + "/aws-events/" + file)
        );
        await handler.handleRequest(event, context, callback);
        if (file === "api-gateway-aws-proxy.json") {
          assert.equal(
            service.getEvents().length,
            0,
            "API Gateway should go throught the normal request handling"
          );
          return;
        }
        assert.notEqual(
          service.getEvents().length,
          0,
          "Should have get some events:" + JSON.stringify(event)
        );
      });
    });
  }
  */
}
