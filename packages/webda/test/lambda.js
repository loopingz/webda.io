"use strict";
var assert = require("assert")
var Webda = require("../core/webda.js");
var Executor = require("../executors/executor.js");
var config = require("./config.json");
var webda;
var resp;
var skip = false;

class FakeResponse {
  constructor () {

  }
  writeHead(number, options) {
    this.httpCode = number;
    this.httpHeader = options;
  }
  write(data) {
    this.data = data;
  }
  end() {

  }
}

class FakeRequest {
  constructor () {
    this.session = {};
    this.body = {};
  }
}

describe('Lambda', function() {
  before (function() {
    skip = process.env["WEBDA_AWS_KEY"] === undefined;
    if (skip) {
      console.log("Not running as no AWS env found");
    }
  })
  beforeEach( function() {
    webda = new Webda(config);
    resp = new FakeResponse();
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
        var callable = webda.getExecutor("test.webda.io", methods[i], "/webda");
        callable.context(new FakeRequest(), resp);
        return callable.execute().then( function() {
          assert.equal(resp.httpCode, 200);
          assert.equal(resp.httpHeader['Content-Type'], 'text/plain');
          assert.equal(resp.data, methods[i] + ' called');
        })
      });
    }
  })
});