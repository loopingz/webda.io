var assert = require("assert")
var Webda = require("../webda.js");
var Executor = require("../executors/executor.js");
var config = require("./config.json");
var webda = new Webda(config);

describe('Webda', function() {
  describe('getService()', function () {
    it('Illegal vhost', function () {
        webda = new Webda(config);
        assert.equal(null, webda.getService("Authentication"));
    });
    it('normal', function () {
        webda = new Webda(config);
        webda.setHost("test.webda.io");
        assert.notEqual(null, webda.getService("Authentication"));
    });
  })
  describe('getExecutor()', function () {
    it('Unknown vhost', function () {
      webda = new Webda(config);
      assert.equal(webda.getExecutor("localhost", "GET", "/"), undefined);
    })
    it('Known vhost - known page', function () {
      webda = new Webda(config);
      callable = webda.getExecutor("test.webda.io", "GET", "/");
      assert.notEqual(callable, undefined);
      assert.equal(callable['_http']["method"], "GET");
      assert.equal(callable['_http']["url"], "/");
      assert.equal(callable['_http']["host"], "test.webda.io");
      assert.equal(callable["params"]["TEST_ADD"], undefined);
      assert.equal(callable["params"]["accessKeyId"], "LOCAL_ACCESS_KEY");
      assert.equal(callable["params"]["secretAccessKey"], "LOCAL_SECRET_KEY");
      // Debug is Executor
      assert(callable instanceof Executor);
    });
    it('Known vhost - known page - multiple method', function () {
      webda = new Webda(config);
      callable = webda.getExecutor("test.webda.io", "POST", "/");
      assert.notEqual(callable, undefined);
      assert.equal(callable['_http']["method"], "POST");
      assert.equal(callable['_http']["url"], "/");
      assert.equal(callable['_http']["host"], "test.webda.io");
      assert.equal(callable["params"]["TEST_ADD"], undefined);
      assert.equal(callable["params"]["accessKeyId"], "LOCAL_ACCESS_KEY");
      assert.equal(callable["params"]["secretAccessKey"], "LOCAL_SECRET_KEY");
    });
    it('Known vhost - known page - unknown method', function () {
      webda = new Webda(config);
      assert.equal(webda.getExecutor("test.webda.io", "PUT", "/"), undefined);
    });
    it('Known vhost - unknown page', function () {
      webda = new Webda(config);
      assert.equal(webda.getExecutor("test.webda.io", "GET", "/test"), undefined);
    });
    it('Known vhost - known template page', function () {
      webda = new Webda(config);
      callable = webda.getExecutor("test.webda.io", "GET", "/urltemplate/666");
      assert.notEqual(callable, undefined);
      assert.equal(callable['_http']["method"], "GET");
      assert.equal(callable['_http']["url"], "/urltemplate/666");
      assert.equal(callable['_http']["host"], "test.webda.io");
      assert.equal(callable['params']['id'], 666);
      assert.equal(callable["params"]["TEST_ADD"], "Users");
      assert.equal(callable["params"]["accessKeyId"], "YOUR_ACCESS_KEY");
      assert.equal(callable["params"]["secretAccessKey"], "YOUR_SECRET_KEY");
      // Default is Executor
      assert(callable instanceof Executor);
    });
    it('Known vhost - passport executor', function () {
      webda = new Webda(config);
      webda.setHost("test.webda.io");
      callable = webda.getExecutor("test.webda.io", "GET", "/auth/facebook");
      assert.notEqual(callable, undefined);
      assert.notEqual(callable._extended, true);
      callable = webda.getExecutor("test.webda.io", "GET", "/auth/facebook/callback");
      assert.notEqual(callable, undefined);
      callable = webda.getExecutor("test.webda.io", "GET", "/auth/google/return");
      assert.notEqual(callable, undefined);
    });
  });
});