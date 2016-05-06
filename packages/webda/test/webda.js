var assert = require("assert")
var Webda = require("../core.js");
var Executor = require("../executors/executor.js");
var config = require("./config.json");
var webda;

describe('Webda', function() {
  beforeEach( function() {
    webda = new Webda(config);
  });
  describe('getService()', function () {
    it('Illegal vhost', function () {
        assert.equal(null, webda.getService("Authentication"));
    });
    it('normal', function () {
        webda.setHost("test.webda.io");
        assert.notEqual(null, webda.getService("Authentication"));
    });
  })
  describe('getExecutor()', function () {
    it('Unknown vhost', function () {
      assert.equal(webda.getExecutor("localhost", "GET", "/"), undefined);
    })
    it('Known vhost - known page', function () {
      executor = webda.getExecutor("test.webda.io", "GET", "/");
      assert.notEqual(executor, undefined);
      assert.equal(executor['_route']['_http']["method"], "GET");
      assert.equal(executor['_route']['_http']["url"], "/");
      assert.equal(executor['_route']['_http']["host"], "test.webda.io");
      assert.equal(executor["_params"]["TEST_ADD"], undefined);
      assert.equal(executor["_params"]["accessKeyId"], "LOCAL_ACCESS_KEY");
      assert.equal(executor["_params"]["secretAccessKey"], "LOCAL_SECRET_KEY");
      // Debug is Executor
      assert(executor instanceof Executor);
    });
    it('Known vhost - known page - multiple method', function () {
      executor = webda.getExecutor("test.webda.io", "POST", "/");
      assert.notEqual(executor, undefined);
      assert.equal(executor['_route']['_http']["method"], "POST");
      assert.equal(executor['_route']['_http']["url"], "/");
      assert.equal(executor['_route']['_http']["host"], "test.webda.io");
      assert.equal(executor["_params"]["TEST_ADD"], undefined);
      assert.equal(executor["_params"]["accessKeyId"], "LOCAL_ACCESS_KEY");
      assert.equal(executor["_params"]["secretAccessKey"], "LOCAL_SECRET_KEY");
    });
    it('Known vhost - known page - unknown method', function () {
      assert.equal(webda.getExecutor("test.webda.io", "PUT", "/"), undefined);
    });
    it('Known vhost - unknown page', function () {
      assert.equal(webda.getExecutor("test.webda.io", "GET", "/test"), undefined);
    });
    it('Known vhost - known template page', function () {
      executor = webda.getExecutor("test.webda.io", "GET", "/urltemplate/666");
      assert.notEqual(executor, undefined);
      assert.equal(executor['_route']['_http']["method"], "GET");
      assert.equal(executor['_route']['_http']["url"], "/urltemplate/666");
      assert.equal(executor['_route']['_http']["host"], "test.webda.io");
      assert.equal(executor['_params']['id'], 666);
      assert.equal(executor["_params"]["TEST_ADD"], "Users");
      assert.equal(executor["_params"]["TEST"], "Global");
      // Default is Executor
      assert(executor instanceof Executor);
    });
    it('Known vhost - passport executor', function () {
      executor = webda.getExecutor("test.webda.io", "GET", "/auth/facebook");
      assert.notEqual(executor, undefined);
      assert.notEqual(executor._extended, true);
      executor = webda.getExecutor("test.webda.io", "GET", "/auth/facebook/callback");
      assert.notEqual(executor, undefined);
      executor = webda.getExecutor("test.webda.io", "GET", "/auth/google/callback");
      assert.notEqual(executor, undefined);
    });
  });
});