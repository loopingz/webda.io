"use strict";
const assert = require("assert");
const Webda = require("../lib/index.js");
const config = require("./config.json");
const fs = require("fs");
const Utils = require("./utils");

describe("RoutesHelper", function() {
  var webda;
  var ctx;
  var executor;
  beforeEach(async function() {
    webda = new Webda.Core(config);
    await webda.init();
    ctx = webda.newContext();
  });
  it("String", async () => {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/string");
    await executor.execute(ctx);
    assert.equal(ctx.getResponseBody(), "CodeCoverage");
  });
  it("String - Mime", async () => {
    executor = webda.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/route/string/json"
    );
    await executor.execute(ctx);
    assert.equal(ctx.getResponseBody(), '{"title":"CodeCoverage"}');
    assert.equal(ctx.getResponseHeaders()["Content-Type"], "application/json");
  });
  it("Inline", async () => {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/inline");
    await executor.execute(ctx);
    assert.equal(ctx.getResponseBody(), "CodeCoverage");
  });
  it("Resource", async () => {
    executor = webda.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/route/resource"
    );
    await executor.execute(ctx);
    assert.equal(ctx.getResponseHeaders()["Content-Type"], "text/plain");
    assert.equal(
      ctx.getResponseBody(),
      fs.readFileSync("./test/Dockerfile.txt")
    );
  });
  it("Resource - Not found", async () => {
    executor = webda.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/route/resource/notfound"
    );
    await Utils.throws(executor.execute.bind(executor, ctx), err => true);
  });
  it("Resource - No mime", async () => {
    executor = webda.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/route/resource/nomime"
    );
    await executor.execute(ctx);
    assert.equal(
      ctx.getResponseHeaders()["Content-Type"],
      "application/octet-stream"
    );
    assert.equal(ctx.getResponseBody(), fs.readFileSync("./test/Dockerfile"));
  });
  it("File", async () => {
    executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/route/file");
    await executor.execute(ctx);
    assert.equal(ctx.getResponseBody(), "CodeCoverage");
  });
});
