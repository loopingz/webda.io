"use strict";
const assert = require("assert");
const Webda = require("../" + (process.env["WEBDA_TEST_TARGET"] ? process.env["WEBDA_TEST_TARGET"] : "src") + "/index.js");
const config = require("./config.json");
const fs = require('fs');

describe("RoutesHelper", function() {
  var webda;
  var ctx;
  var executor;
  beforeEach(function() {
    webda = new Webda.Core(config);
    ctx = webda.newContext();
  });
  it('String', function() {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/string");
    return executor.execute(ctx).then(() => {
      assert.equal(ctx._body, 'CodeCoverage');
    });
  })
  it('String - Mime', function() {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/string/json");
    return executor.execute(ctx).then(() => {
      assert.equal(ctx._body, '{"title":"CodeCoverage"}');
      assert.equal(ctx._headers['Content-Type'], 'application/json');
    });
  })
  it('Inline', function() {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/inline");
    return executor.execute(ctx).then(() => {
      assert.equal(ctx._body, 'CodeCoverage');
    });
  })
  it('Resource', function() {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/resource");
    return executor.execute(ctx).then(() => {
      assert.equal(ctx._headers['Content-Type'], 'text/plain');
      assert.equal(ctx._body, fs.readFileSync('./test/Dockerfile.txt'));
    });
  })
  it('Resource - Not found', function() {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/resource/notfound");
    let error;
    return executor.execute(ctx).catch((err) => {
      error = err;
    }).then(() => {
      assert.notEqual(error, undefined);
    });
  })
  it('File', function() {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/file");
    return executor.execute(ctx).then(() => {
      assert.equal(ctx._body, 'CodeCoverage');
    });
  })
});
