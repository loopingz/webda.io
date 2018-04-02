"use strict";
const assert = require("assert");
const Webda = require("../" + (process.env["WEBDA_TEST_TARGET"] ? process.env["WEBDA_TEST_TARGET"] : "src") + "/index.js");
const config = require("./config.json");
const fs = require('fs');
const Utils = require("./utils");

describe("RoutesHelper", function() {
  var webda;
  var ctx;
  var executor;
  beforeEach(function() {
    webda = new Webda.Core(config);
    ctx = webda.newContext();
  });
  it('String', async () => {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/string");
    await executor.execute(ctx);
    assert.equal(ctx._body, 'CodeCoverage');
  })
  it('String - Mime', async () => {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/string/json");
    await executor.execute(ctx);
    assert.equal(ctx._body, '{"title":"CodeCoverage"}');
    assert.equal(ctx._headers['Content-Type'], 'application/json');
  })
  it('Inline', async () => {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/inline");
    await executor.execute(ctx);
    assert.equal(ctx._body, 'CodeCoverage');
  })
  it('Resource', async () => {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/resource");
    await executor.execute(ctx);
    assert.equal(ctx._headers['Content-Type'], 'text/plain');
    assert.equal(ctx._body, fs.readFileSync('./test/Dockerfile.txt'));
  })
  it('Resource - Not found', async () => {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/resource/notfound");
    await Utils.throws(executor.execute.bind(executor, ctx), err => true);
  })
  it('File', async () => {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/file");
    await executor.execute(ctx);
    assert.equal(ctx._body, 'CodeCoverage');
  })
});
