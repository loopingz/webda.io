"use strict";
var assert = require("assert");
const Webda = require("../lib/index.js");
var handler;
var config = require("./config.json");
var evt;
var context;
var callback;
var res;

describe('Lambda Handler', function() {
  beforeEach( function () {
    handler = new Webda.LambdaServer(config);
    evt = {
      headers: {
        Cookie: 'webda=plop;'
      },
      path: "/route/string",
      body: JSON.stringify({

      })
    };
    context = {};
    callback = (err, result) => {
      res = result;
    };
  });

  it('handleRequest known route', function() {
    return handler.handleRequest(evt, context, callback).then( () => {
      assert.equal(res.body, 'CodeCoverage');
    });
  });
  it('handleRequest unknown route', function() {
    evt.path = "/route/unknown";
    delete evt.headers.Cookie;
    return handler.handleRequest(evt, context, callback).then( () => {
      assert.equal(res.statusCode, 404);
    });
  });

  it('handleRequest service throw 401', function() {
    evt.path = "/broken/401";
    return handler.handleRequest(evt, context, callback).then( () => {
      assert.equal(res.statusCode, 401);
    });
  });

  it('handleRequest service throw Error', function() {
    evt.path = "/broken/Error";
    return handler.handleRequest(evt, context, callback).then( () => {
      assert.equal(res.statusCode, 500);
    });
  });

  it('handleRequest OPTIONS', function() {
    evt.httpMethod = "OPTIONS";
    return handler.handleRequest(evt, context, callback).then( () => {
      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['Access-Control-Allow-Methods'], 'GET,OPTIONS');
    });
  });
  it('handleRequest OPTIONS with 404', function() {
    evt.path = "/route/unknown";
    evt.httpMethod = "OPTIONS";
    return handler.handleRequest(evt, context, callback).then( () => {
      assert.equal(res.statusCode, 404);
    });
  });
  it('handleRequest query param', function() {
    // TODO Check parameter retrieval
    evt.queryStringParameters = {test: 'plop'};
    return handler.handleRequest(evt, context, callback).then( () => {

    });
  });
  it('handleRequest origin', function() {
    evt.headers.Origin = 'test.webda.io';
    return handler.handleRequest(evt, context, callback).then( () => {
      assert.equal(res.headers['Access-Control-Allow-Origin'], evt.headers.Origin);
    });
  });
});