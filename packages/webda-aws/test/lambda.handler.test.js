"use strict";
var assert = require("assert");
const Webda = require("../lib/index.js");
var handler;
var config = require("./config.json");
const fs = require("fs");
var evt;
var context;
var callback;
var res;

describe("Lambda Handler", function() {
  beforeEach(function() {
    handler = new Webda.LambdaServer(config);
    evt = {
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
    context = {};
    callback = (err, result) => {
      res = result;
    };
  });

  it("handleRequest custom launch", function() {
    return handler
      .handleRequest(
        {
          command: "launch",
          service: "DefinedMailer",
          method: "send",
          args: ["test"]
        },
        context,
        callback
      )
      .then(() => {
        assert.equal(handler.getService("DefinedMailer").sent[0], "test");
      });
  });
  it("handleRequest custom launch - bad service", async function() {
    await handler.handleRequest({
      command: "launch",
      service: "DefinedMailers",
      method: "send",
      args: ["test"]
    });
    assert.equal(handler.getService("DefinedMailer").sent.length, 0);
  });
  it("handleRequest custom launch - bad method", async function() {
    await handler.handleRequest({
      command: "launch",
      service: "DefinedMailer",
      method: "sends"
    });
    assert.equal(handler.getService("DefinedMailer").sent.length, 0);
  });
  it("handleRequest known route", async function() {
    let res = await handler.handleRequest(evt, context);
    assert.equal(res.body, "CodeCoverage");
  });
  it("handleRequest unknown route", async function() {
    evt.path = "/route/unknown";
    delete evt.headers.Cookie;
    let res = await handler.handleRequest(evt, context);
    assert.equal(res.statusCode, 404);
  });

  it("handleRequest service throw 401", async function() {
    evt.path = "/broken/401";
    let res = await handler.handleRequest(evt, context);
    assert.equal(res.statusCode, 401);
  });

  it("handleRequest service throw Error", async function() {
    evt.path = "/broken/Error";
    let res = await handler.handleRequest(evt, context);
    assert.equal(res.statusCode, 500);
  });

  it("handleRequest OPTIONS", async function() {
    evt.httpMethod = "OPTIONS";
    let res = await handler.handleRequest(evt, context);
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["Access-Control-Allow-Methods"], "GET,OPTIONS");
  });
  it("handleRequest OPTIONS with 404", async function() {
    evt.path = "/route/unknown";
    evt.httpMethod = "OPTIONS";
    let res = await handler.handleRequest(evt, context);
    assert.equal(res.statusCode, 404);
  });
  it("handleRequest query param", async function() {
    // TODO Check parameter retrieval
    evt.queryStringParameters = {
      test: "plop"
    };
    await handler.handleRequest(evt, context);
  });
  it("handleRequest origin", async function() {
    evt.headers.Origin = "https://test.webda.io";
    evt.headers.Host = "test.webda.io";
    let wait = false;
    handler.on("Webda.Result", () => {
      return new Promise((resolve, reject) => {
        // Delay 100ms to ensure it waited
        setTimeout(() => {
          wait = true;
          resolve();
        }, 100);
      });
    });
    let res = await handler.handleRequest(evt, context);
    assert.equal(
      res.headers["Access-Control-Allow-Origin"],
      evt.headers.Origin
    );
    assert.equal(wait, true);
  });
  it("handleRequest origin - csrf", async function() {
    evt.headers.Origin = "https://test3.webda.io";
    evt.headers.Host = "test3.webda.io";
    let res = await handler.handleRequest(evt, context);
    assert.equal(res.statusCode, 401);
  });
  it("handleRequest referer - csrf", async function() {
    evt.headers.Referer = "https://test3.webda.io";
    evt.headers.Host = "test3.webda.io";
    let res = await handler.handleRequest(evt, context);
    assert.equal(res.statusCode, 401);
  });
  it("handleRequest referer - good cors", async function() {
    evt.headers.Referer = "https://test.webda.io";
    evt.headers.Host = "test.webda.io";
    let res = await handler.handleRequest(evt, context);
    assert.equal(
      res.headers["Access-Control-Allow-Origin"],
      evt.headers.Referer
    );
  });

  describe("aws events", function() {
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
  });
});
