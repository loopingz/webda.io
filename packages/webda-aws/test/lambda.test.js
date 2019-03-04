"use strict";
var assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config.json");
var webda;
var skip = false;

describe("Lambda", function() {
  before(function() {
    skip = process.env["WEBDA_AWS_TEST"] === undefined;
    if (skip) {
      console.log("Not running as no AWS env found");
    }
  });
  beforeEach(function() {
    webda = new Webda.Core(config);
  });
  describe("launch()", function() {
    var methods = ["GET", "PUT", "POST", "DELETE"];
    for (var i in methods) {
      it(methods[i], async function() {
        if (skip) {
          this.skip();
          return;
        }
        var ctx = webda.newContext();
        var executor = webda.getExecutor(
          ctx,
          "test.webda.io",
          methods[i],
          "/webda"
        );
        await executor.execute(ctx);
        assert.notEqual(ctx, undefined);
        assert.equal(ctx.statusCode, 200);
        assert.equal(ctx.getResponseHeaders()["Content-Type"], "text/plain");
        assert.equal(ctx.getResponseBody(), methods[i] + " called");
      });
    }
  });
});
