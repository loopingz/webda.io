"use strict";
var assert = require("assert")
var Webda = require("../core.js");
var Executor = require("../executors/executor.js");
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
    console.log(skip);
    for (var i in methods) {
      it(methods[i], function () {
        if (skip) {
          this.skip();
          return;
        }
        var resp = {};
        webda.flushHeaders = (executor) => {
          resp.httpCode = executor._returnCode;
          resp.httpHeader = executor._headers;
        }
        webda.flush = (executor) => {
          resp.data = executor._body;
        }
        var callable = webda.getExecutor("test.webda.io", methods[i], "/webda");
        callable.context({}, {});
        return callable.execute().then( function() {
          assert.notEqual(resp, undefined);
          assert.equal(resp.httpCode, 200);
          assert.equal(resp.httpHeader['Content-Type'], 'text/plain');
          assert.equal(resp.data, methods[i] + ' called');
        })
      });
    }
  })
});