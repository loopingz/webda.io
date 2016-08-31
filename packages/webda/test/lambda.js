"use strict";
var assert = require("assert")
var Webda = require("../core.js");
var Executor = require("../services/executor.js");
var config = require("./config.json");
var webda;
var resp;
var skip = false;

describe('Lambda', function() {
  before (function() {
    skip = process.env["WEBDA_AWS_KEY"] === undefined;
    if (skip) {
      console.log("Not running as no AWS env found");
    }
  })
  beforeEach( function() {
    webda = new Webda(config);
    webda.setHost("test.webda.io");
  });
  describe('launch()', function () {

    var methods = ["GET", "PUT", "POST", "DELETE"];
    for (var i in methods) {
      it(methods[i], function () {
        if (skip) {
          this.skip();
          return;
        }
        var resp = {};
        var ctx = webda.newContext();
        var executor = webda.getExecutor(ctx, "test.webda.io", methods[i], "/webda");
        return executor.execute(ctx).then( function() {
          assert.notEqual(ctx, undefined);
          assert.equal(ctx.statusCode, 200);
          assert.equal(ctx._headers['Content-Type'], 'text/plain');
          assert.equal(ctx._body, methods[i] + ' called');
        })
      });
    }
  })
});