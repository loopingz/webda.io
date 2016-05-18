"use strict";
var assert = require("assert")
var Webda = require("../core")
var config = require("./config.json");
var Ident = require("../models/ident");
var webda;
var identStore;
var userStore;
var mailer;
var events;
var executor;

const validationUrl = /.*\/auth\/email\/callback\?email=([^&]+)&token=([^ ]+)/

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
    mailer = webda.getService("DefinedMailer");
  	authentication.on("Login", function() {
  		events++;
  	});
    authentication.on("Register", function(evt) {
      events++;
      evt.user.test = "TESTOR";
    });
  });
  beforeEach( function() {
    mailer.sent = [];
  });
  describe('Email', function () {
  	it('register', function() {
  		//getExecutor(vhost, method, url, protocol, port, headers)
  		executor = webda.getExecutor("test.webda.io", "POST", "/auth/email", "http");
  		var params = {'email':'test@webda.io', 'password': 'test'};
  		events = 0;
  		executor.setContext(params, {});
  		return executor.execute().catch( (err) => {
        // Wrong parameters in the request
        assert.equal(err, 400);
  		  params.login = params.email;
  		  executor.setContext(params, {});
  		  return executor.execute();
      }).catch ((err) => {
        // Unknown user without the register option
  			assert.equal(err, 404);
  			params.register = true;
  			executor.setContext(params, webda.getNewSession());
  			return executor.execute();
  		}).then ( () => {
        // 
  			assert.equal(executor.session.identId, undefined);
        assert.equal(mailer.sent.length, 1);
  			return identStore.get('test@webda.io_email');
  		}).then ( (ident) => {
  			assert.equal(ident, undefined);
  			params.login = "test2@webda.io";
  			executor._params.providers.email.postValidation = true;
  			executor.setContext(params, webda.getNewSession());
  			return executor.execute();
  		}).then ( () => {
  			assert.equal(events, 2); // Register + Login
  			assert.notEqual(executor.session.getUserId(), undefined);
        assert.equal(mailer.sent.length, 2);
  			return userStore.get(executor.session.getUserId());
  		}).then ( (user) => {
  			assert.notEqual(user, undefined);
        assert.notEqual(user._password, undefined);
        assert.equal(user.test, "TESTOR"); // Verify that the listener on Register has done something
        // Now logout
        executor = webda.getExecutor("test.webda.io", "DELETE", "/auth", "http");
        return executor.execute();
      }).then ( () => {
        // Now validate first user
        executor._params.providers.email.postValidation = false;
        assert.equal(executor.session.getUserId(), undefined);
        var match = mailer.sent[0].text.match(validationUrl);
        assert.notEqual(match, undefined);
        assert.equal(match[1], 'test@webda.io');
        executor.setContext({'token': match[2], 'password': 'test', 'login': match[1], 'register': true, 'add': 'plop'}, executor.session);
        executor = webda.getExecutor("test.webda.io", "POST", "/auth/email", "http");
        return executor.execute();
  		}).then ( () => {
        // Should create it with the dat provided
        assert.notEqual(executor.session.getUserId(), undefined);
        return identStore.get(executor.session.getIdentUsed());
      }).then ( (ident) => {
        // Email should be already validate
        assert.notEqual(ident.validation, undefined);
        assert.equal(mailer.sent.length, 2);
        // Validate email for test2 now
        var match = mailer.sent[1].text.match(validationUrl);
        assert.notEqual(match, undefined);
        assert.equal(match[1], 'test2@webda.io');
        executor.setContext(undefined, webda.getNewSession());
        executor = webda.getExecutor("test.webda.io", "GET", "/auth/email/callback?email=" + match[1] + "&token=" + match[2], "http");
        return executor.execute();
      }).then ( () => {
        assert.equal(executor._returnCode, 302);
        // Verify the skipEmailValidation parameter
        events = 0;
        params = {'login':'test4@webda.io', 'password': 'test', register: true};
        executor = webda.getExecutor("test.webda.io", "POST", "/auth/email", "http");
        executor._params.providers.email.postValidation = true;
        executor._params.providers.email.skipEmailValidation = true;
        executor.setContext(params, webda.getNewSession());
        return executor.execute();
      }).then ( () => {
        // No new email has been sent
        assert.equal(mailer.sent.length, 2);
        assert.equal(events, 2); // Register + Login
        assert.notEqual(executor.session.getUserId(), undefined);
      });
  	});

  	it('login', function() {
  		var params = {'login':'test3@webda.io', 'password': 'test'};
  		events = 0;
      executor = webda.getExecutor("test.webda.io", "POST", "/auth/email", "http");
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
        // Verify ident type
        return identStore.get(executor.session.getIdentUsed());
      }).then( (ident) => {
        assert.equal(ident.type, "email");
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
  });
  describe("OAuth", function () {
  	it('AWS Compatibility', function() {
  		executor = webda.getExecutor("test.webda.io", "GET", "/auth/github");
      assert.equal(executor._route.aws.defaultCode, 302);
  	});
    it('Callback', function() {
      var done = function() {};
      var lastUsed = null;
      events = 0;
      let ident = new Ident("github","test");
      let profile = {'displayName': 'Georges Abitbol'};
      executor = webda.getExecutor("test.webda.io", "GET", "/auth/github/callback?code=blahblah");
      return executor.handleOAuthReturn(profile, ident, done).then ( () => {
        assert.equal(executor._returnCode, 302);
        assert.equal(executor._params.code, "blahblah");  
        assert.equal(executor._headers.Location, "https://shootandprove.loopingz.com/user.html?validation=github");
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
        assert.equal(executor._headers.Location, "https://shootandprove.loopingz.com/user.html?validation=github");
        return userStore.get(ident.user);
      }).then ( (user) => {
        assert.equal(user.idents.length, 2); // Two github login
        assert.equal(user.idents[1].uuid, "retest_github");
      });
    });
  });
});