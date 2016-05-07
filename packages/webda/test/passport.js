"use strict";
var assert = require("assert")
var Webda = require("../core")
var config = require("./config.json");
var Ident = require("../models/ident");
var webda;
var identStore;
var userStore;
var events;
var executor;

describe('Passport', function() {
  before( function() {
    webda = new Webda(config);
    webda.setHost("test.webda.io");
    webda.initAll();
    userStore = webda.getService("Users")
    userStore.__clean();
    identStore = webda.getService("Idents");
    identStore.__clean();
  	let authentication = webda.getService("Authentication");
  	authentication.on("Login", function() {
  		events++;
  	});
    authentication.on("Register", function(evt) {
      events++;
      evt.user.test = "TESTOR";
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
  			executor.setContext(params, webda.getNewSession());
  			return executor.execute();
  		}).then ( () => {
  			assert.equal(executor.session.identId, undefined);
  			return identStore.get('test@webda.io_email');
  		}).then ( (ident) => {
  			assert.equal(ident, undefined);
  			params.login = "test2@webda.io";
  			executor._params.providers.email.postValidation = false;
  			executor.setContext(params, webda.getNewSession());
  			return executor.execute();
  		}).then ( () => {
  			assert.equal(events, 2); // Register + Login
  			assert.notEqual(executor.session.getUserId(), undefined);
  			return userStore.get(executor.session.getUserId());
  		}).then ( (user) => {
  			assert.notEqual(user, undefined);
        assert.equal(user.test, "TESTOR"); // Verify that the listener on Register has done something
  		});
  	});
  	it('login', function() {
  		var params = {'login':'test@webda.io', 'password': 'test'};
  		events = 0;
  		executor.setContext(params, webda.getNewSession());
  		return executor.execute().catch ( (err) => {
  			assert.equal(executor.session.getUserId(), undefined);
  			// As it has not been validate
  			assert.equal(err, 404);
  			params.login="test2@webda.io";
  			executor.setContext(params, webda.getNewSession());
  			return executor.execute();
  		}).catch( (err) => {
  			assert.equal(err, 204);
        assert.equal(events, 1); // Login
  			assert.notEqual(executor.session.getUserId(), undefined);
  			params.login="test2@webda.io";
  			params.password="bouzouf";
  			executor.setContext(params, webda.getNewSession());
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
    it('Oauth callback', function() {
      var done = function() {};
      var lastUsed = null;
      events = 0;
      let ident = new Ident("github","test");
      let profile = {'displayName': 'Georges Abitbol'};
      executor = webda.getExecutor("test.webda.io", "GET", "/auth/github/callback?code=blahblah");
      return executor.handleOAuthReturn(profile, ident, done).then ( () => {
        assert.equal(executor._returnCode, 302);
        assert.equal(executor._params.code, "blahblah");  
        assert.equal(executor._headers.Location, "https://shootandprove.loopingz.com/user.html");
        // The ident must have been created and have a last used
        assert.notEqual(ident.lastUsed, lastUsed);
        lastUsed = ident;
        // Set by the store
        assert.notEqual(ident.lastUpdate, undefined);
        // Login + Register
        assert.equal(events, 2);
        events = 0;
        assert.equal(executor.session.isLogged(), true);
        return executor.handleOAuthReturn(profile, ident, done);
      }).then ( () => {
        assert.equal(events, 1); // Only Login
        assert.notEqual(ident.lastUsed, lastUsed);
        return userStore.get(ident.user);
      }).then ( (user) => {
        events = 0;
        assert.equal(user.idents.length, 1); // Only one github login
        assert.equal(user.idents[0].uuid, "test_github"); // Only one github login
        assert.equal(user.test, "TESTOR"); // Verify that the listener on Register has done something
        return executor.handleOAuthReturn(profile, new Ident("github", "retest"), done);
      }).then ( () => {
        assert.equal(events, 1); // Only Login
        assert.equal(executor._returnCode, 302);  
        assert.equal(executor._headers.Location, "https://shootandprove.loopingz.com/user.html");
        return userStore.get(ident.user);
      }).then ( (user) => {
        assert.equal(user.idents.length, 2); // Two github login
        assert.equal(user.idents[1].uuid, "retest_github");
      });
    });
  });
});