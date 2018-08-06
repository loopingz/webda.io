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
  beforeEach(function() {
    handler = new Webda.LambdaServer(config);
    evt = {
      headers: {
        Cookie: 'webda=plop;'
      },
      requestContext: {
        identity: {

        }
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

  it('handleRequest custom launch', function() {
    return handler.handleRequest({
      command: 'launch',
      service: 'DefinedMailer',
      method: 'send',
      args: ['test']
    }, context, callback).then(() => {
      assert.equal(handler.getService('DefinedMailer').sent[0], 'test');
    });
  });
  it('handleRequest custom launch - bad service', function() {
    return handler.handleRequest({
      command: 'launch',
      service: 'DefinedMailers',
      method: 'send',
      args: ['test']
    }, context, callback).then(() => {
      assert.equal(handler.getService('DefinedMailer').sent.length, 0);
    });
  });
  it('handleRequest custom launch - bad method', function() {
    return handler.handleRequest({
      command: 'launch',
      service: 'DefinedMailer',
      method: 'sends'
    }, context, callback).then(() => {
      assert.equal(handler.getService('DefinedMailer').sent.length, 0);
    });
  });
  it('handleRequest known route', function() {
    return handler.handleRequest(evt, context, callback).then(() => {
      assert.equal(res.body, 'CodeCoverage');
    });
  });
  it('handleRequest unknown route', function() {
    evt.path = "/route/unknown";
    delete evt.headers.Cookie;
    return handler.handleRequest(evt, context, callback).then(() => {
      assert.equal(res.statusCode, 404);
    });
  });

  it('handleRequest service throw 401', function() {
    evt.path = "/broken/401";
    return handler.handleRequest(evt, context, callback).then(() => {
      assert.equal(res.statusCode, 401);
    });
  });

  it('handleRequest service throw Error', function() {
    evt.path = "/broken/Error";
    return handler.handleRequest(evt, context, callback).then(() => {
      assert.equal(res.statusCode, 500);
    });
  });

  it('handleRequest OPTIONS', function() {
    evt.httpMethod = "OPTIONS";
    return handler.handleRequest(evt, context, callback).then(() => {
      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['Access-Control-Allow-Methods'], 'GET,OPTIONS');
    });
  });
  it('handleRequest OPTIONS with 404', function() {
    evt.path = "/route/unknown";
    evt.httpMethod = "OPTIONS";
    return handler.handleRequest(evt, context, callback).then(() => {
      assert.equal(res.statusCode, 404);
    });
  });
  it('handleRequest query param', function() {
    // TODO Check parameter retrieval
    evt.queryStringParameters = {
      test: 'plop'
    };
    return handler.handleRequest(evt, context, callback).then(() => {

    });
  });
  it('handleRequest origin', function() {
    evt.headers.Origin = 'https://test.webda.io';
    let wait = false;
    handler.on('Webda.Result', () => {
      return new Promise((resolve, reject) => {
        // Delay 100ms to ensure it waited
        setTimeout(() => {
          wait = true;
          resolve();
        }, 100);
      });
    })
    return handler.handleRequest(evt, context, callback).then(() => {
      assert.equal(res.headers['Access-Control-Allow-Origin'], evt.headers.Origin);
      assert.equal(wait, true);
    });
  });
  it('handleRequest origin - csrf', function() {
    evt.headers.Origin = 'https://test3.webda.io';
    return handler.handleRequest(evt, context, callback).then(() => {
      assert.equal(res.statusCode, 401);
    });
  });
  it('handleRequest referer - csrf', function() {
    evt.headers.Referer = 'https://test3.webda.io';
    return handler.handleRequest(evt, context, callback).then(() => {
      assert.equal(res.statusCode, 401);
    });
  });
  it('handleRequest referer - good cors', function() {
    evt.headers.Referer = 'https://test.webda.io';
    return handler.handleRequest(evt, context, callback).then(() => {
      assert.equal(res.headers['Access-Control-Allow-Origin'], evt.headers.Referer);
    });
  });
});
