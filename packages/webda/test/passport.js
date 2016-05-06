var assert = require("assert")
var Webda = require("../core.js");
var Executor = require("../executors/executor.js");
var config = require("./config.json");
var webda
var identStore;
var userStore;
var events;

describe('Passport', function() {
  before( function() {
    webda = new Webda(config);
    webda.setHost("test.webda.io");
    webda.initAll();
    userStore = webda.getService("Users")
    userStore.__clean();
    identStore = webda.getService("Idents");
    identStore.__clean();
  	authentication = webda.getService("Authentication");
  	authentication.on("login", function() {
  		events++;
  	});
  });
  describe('Email', function () {
  	it('register', function() {
  		//getExecutor(vhost, method, url, protocol, port, headers)
  		executor = webda.getExecutor("test.webda.io", "POST", "/auth/email");
  		var params = {'email':'test@webda.io', 'password': 'test'};
  		events = 0;
  		executor.setContext(params, {});
  		return executor.execute().catch( (err) => {
        assert.equal(err, 400);
  		  params.login = params.email;
  		  executor.setContext(params, {});
  		  return executor.execute();
      }).catch ((err) => {
  			assert.equal(err, 404);
  			params.register = true;
  			executor.setContext(params, webda.getSession());
  			return executor.execute();
  		}).then ( () => {
  			assert.equal(executor.session.identId, undefined);
  			return identStore.get('test@webda.io_email');
  		}).then ( (ident) => {
  			assert.equal(ident, undefined);
  			params.login = "test2@webda.io";
  			executor._params.providers.email.postValidation = false;
  			executor.setContext(params, webda.getSession());
  			return executor.execute();
  		}).then ( () => {
  			assert.equal(events, 1);
  			assert.notEqual(executor.session.getUserId(), undefined);
  			return userStore.get(executor.session.getUserId());
  		}).then ( (user) => {
  			assert.notEqual(user, undefined);
  		});
  	});
  	it('login', function() {
  		var params = {'login':'test@webda.io', 'password': 'test'};
  		events = 0;
  		executor.setContext(params, webda.getSession());
  		return executor.execute().catch ( (err) => {
  			assert.equal(executor.session.getUserId(), undefined);
  			// As it has not been validate
  			assert.equal(err, 404);
  			params.login="test2@webda.io";
  			executor.setContext(params, webda.getSession());
  			return executor.execute();
  		}).catch( (err) => {
  			assert.equal(err, 204);
  			assert.notEqual(executor.session.getUserId(), undefined);
  			params.login="test2@webda.io";
  			params.password="bouzouf";
  			executor.setContext(params, webda.getSession());
  			return executor.execute();
  		}).catch( (err) => {
  			assert.equal(err, 403);
  			assert.equal(executor.session.getUserId(), undefined);
  			assert.equal(events, 1);
  		});
  	});
  	it('aws compatibility', function() {
  		executor = webda.getExecutor("test.webda.io", "GET", "/auth/github");
      assert.equal(executor._route.aws.defaultCode, 302);
  	});
  });
});