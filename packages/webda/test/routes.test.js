"use strict";
var assert = require("assert");
var Webda = require("../core.js");
var config = require("./config.json");
const fs = require('fs');

describe("RoutesHelper", function() {
  var webda;
  var ctx;
  var executor;
  beforeEach(function() {
    webda = new Webda(config);
    ctx = webda.newContext();
  });
  it('String', function() {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/string");
    return executor.execute(ctx).then( () => {
      assert.equal(ctx._body, 'CodeCoverage');
    });
  })
  it('String - Mime', function() {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/string/json");
    return executor.execute(ctx).then( () => {
      assert.equal(ctx._body, '{"title":"CodeCoverage"}');
      assert.equal(ctx._headers['Content-Type'], 'application/json');
    });
  })
  it('Inline', function() {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/inline");
    return executor.execute(ctx).then( () => {
      assert.equal(ctx._body, 'CodeCoverage');
    });
  })
  it('Resource', function() {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/resource");
    return executor.execute(ctx).then( () => {
      assert.equal(ctx._headers['Content-Type'], 'text/plain');
      assert.equal(ctx._body, fs.readFileSync('./test/Dockerfile.txt'));
    });
  })
});