"use strict";
var assert = require("assert")
var Webda = require("../webda.js");
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
    skip = process.env.AWS === undefined;
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
    for (var i in methods) {
      if (process.env.AWS === undefined) {
        it.skip(methods[i], undefined);
      } else {
        it(methods[i], function (method) {
          var callable = webda.getExecutor("test.webda.io", method, "/webda");
          callable.context(new FakeRequest(), resp);
          return callable.execute().then( function() {
            assert.equal(resp.httpCode, 200);
            assert.equal(resp.httpHeader['Content-Type'], 'text/plain');
            assert.equal(resp.data, method + ' called');
          })
        }.bind(this, methods[i]));
      }
    }
  })
});