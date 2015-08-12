var assert = require("assert")
var Router = require("../router.js");
var Executors = require("../executor.js");
var config = require("./config.json");

describe('Router', function() {
  describe('getRoute()', function () {
    it('Unknown vhost', function () {
      router = new Router(config);
      assert.equal(router.getRoute("localhost", "GET", "/"), undefined);
    })
    it('Known vhost - known page', function () {
      router = new Router(config);
      callable = router.getRoute("test.webda.io", "GET", "/");
      assert.notEqual(callable, undefined);
      assert.equal(callable['_http']["method"], "GET");
      assert.equal(callable['_http']["url"], "/");
      assert.equal(callable['_http']["host"], "test.webda.io");
      assert.equal(callable["params"]["TEST_ADD"], undefined);
      assert.equal(callable["params"]["accessKeyId"], "LOCAL_ACCESS_KEY");
      assert.equal(callable["params"]["secretAccessKey"], "LOCAL_SECRET_KEY");
      // Debug is Executor
      assert(callable instanceof Executors["debug"]);
    });
    it('Known vhost - known page - multiple method', function () {
      router = new Router(config);
      callable = router.getRoute("test.webda.io", "POST", "/");
      assert.notEqual(callable, undefined);
      assert.equal(callable['_http']["method"], "POST");
      assert.equal(callable['_http']["url"], "/");
      assert.equal(callable['_http']["host"], "test.webda.io");
      assert.equal(callable["params"]["TEST_ADD"], undefined);
      assert.equal(callable["params"]["accessKeyId"], "LOCAL_ACCESS_KEY");
      assert.equal(callable["params"]["secretAccessKey"], "LOCAL_SECRET_KEY");
    });
    it('Known vhost - known page - unknown method', function () {
      router = new Router(config);
      assert.equal(router.getRoute("test.webda.io", "PUT", "/"), undefined);
    });
    it('Known vhost - unknown page', function () {
      router = new Router(config);
      assert.equal(router.getRoute("test.webda.io", "GET", "/test"), undefined);
    });
    it('Known vhost - known template page', function () {
      router = new Router(config);
      callable = router.getRoute("test.webda.io", "GET", "/users/666");
      assert.notEqual(callable, undefined);
      assert.equal(callable['_http']["method"], "GET");
      assert.equal(callable['_http']["url"], "/users/666");
      assert.equal(callable['_http']["host"], "test.webda.io");
      assert.equal(callable['params']['id'], 666);
      assert.equal(callable["params"]["TEST_ADD"], "Users");
      assert.equal(callable["params"]["accessKeyId"], "YOUR_ACCESS_KEY");
      assert.equal(callable["params"]["secretAccessKey"], "YOUR_SECRET_KEY");
      // Default is LambdaExecutor
      assert(callable instanceof Executors["lambda"]);
    });
    it('Known vhost - passport executor', function () {
      router = new Router(config);
      callable = router.getRoute("test.webda.io", "GET", "/auth/facebook");
      assert.notEqual(callable, undefined);
      assert.notEqual(callable._extended, true);
      callable = router.getRoute("test.webda.io", "GET", "/auth/facebook/callback");
      assert.notEqual(callable, undefined);
      assert.equal(callable.callable._extended, true);
      callable = router.getRoute("test.webda.io", "GET", "/auth/google/return");
      assert.notEqual(callable, undefined);
      assert.equal(callable.callable._extended, true);
    });
  });
});