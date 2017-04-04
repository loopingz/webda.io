"use strict";
var assert = require("assert")
var Webda = require("../core")
var config = require("./config.json");
var Ident = require("../models/ident");
var identStore;
var userStore;
var mailer;
var events;
var executor;
var found = false;
var webda = new Webda(config);
var ctx;
var userId;


const validationUrl = /.*\/auth\/email\/callback\?email=([^&]+)&token=([^ ]+)/

describe('Passport', function () {
  before(function () {
    webda = new Webda(config);
    webda.setHost("test.webda.io");
    webda.initAll();
    userStore = webda.getService("Users")
    userStore.__clean();
    identStore = webda.getService("Idents");
    identStore.__clean();
    let authentication = webda.getService("Authentication");
    mailer = webda.getService("DefinedMailer");
    authentication.on("Login", function () {
      events++;
    });
    authentication.on("Register", function (evt) {
      events++;
      evt.user.test = "TESTOR";
    });
  });
  beforeEach(function () {
    mailer.sent = [];
  });
  describe('Email', function () {
    it('register', function () {
      var params = {'email': 'test@webda.io', 'password': 'test'};
      ctx = webda.newContext(params);
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http", 80, {'Accept-Language': 'en-GB'});
      events = 0;
      return executor.execute(ctx).catch((err) => {
        // Wrong parameters in the request
        assert.equal(err, 400);
        params.login = params.email;
        ctx.body = params;
        return executor.execute(ctx);
      }).catch((err) => {
        // Unknown user without the register option
        assert.equal(err, 404);
        params.register = true;
        ctx.body = params;
        ctx.session = webda.getNewSession();
        return executor.execute(ctx);
      }).then(() => {
        // 
        assert.equal(ctx.session.identId, undefined);
        assert.equal(mailer.sent.length, 1);
        return identStore.get('test@webda.io_email');
      }).then((ident) => {
        assert.equal(ident, undefined);
        executor._params.providers.email.postValidation = true;
        ctx.body.login = "test2@webda.io";
        ctx.session = webda.getNewSession();
        return executor.execute(ctx);
      }).then(() => {
        assert.equal(events, 2); // Register + Login
        userId = ctx.session.getUserId();
        assert.notEqual(ctx.session.getUserId(), undefined);
        assert.equal(mailer.sent.length, 2);
        return userStore.get(ctx.session.getUserId());
      }).then((user) => {
        assert.notEqual(user, undefined);
        assert.notEqual(user.__password, undefined);
        assert.equal(user.locale, 'en-GB');
        assert.equal(user.test, "TESTOR"); // Verify that the listener on Register has done something
        // Now logout
        executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/auth", "http");
        return executor.execute(ctx);
      }).then(() => {
        // Now validate first user
        executor._params.providers.email.postValidation = false;
        assert.equal(ctx.session.getUserId(), undefined);
        var match = mailer.sent[0].replacements.url.match(validationUrl);
        assert.notEqual(match, undefined);
        assert.equal(match[1], 'test@webda.io');
        ctx.body = {'token': match[2], 'password': 'test', 'login': match[1], 'register': true, 'add': 'plop'};
        executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http");
        return executor.execute(ctx);
      }).then(() => {
        // Should create it with the dat provided
        assert.notEqual(ctx.session.getUserId(), undefined);
        return identStore.get(ctx.session.getIdentUsed());
      }).then((ident) => {
        // Email should be already validate
        assert.notEqual(ident.validation, undefined);
        assert.equal(mailer.sent.length, 2);
        // Validate email for test2 now
        var match = mailer.sent[1].replacements.url.match(validationUrl);
        assert.notEqual(match, undefined);
        assert.equal(match[1], 'test2@webda.io');
        ctx.body = undefined;
        ctx.session = webda.getNewSession();
        executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/email/callback?email=" + match[1] + "&token=" + match[2], "http");
        return executor.execute(ctx);
      }).then(() => {
        assert.equal(ctx.statusCode, 302);
        // Verify the skipEmailValidation parameter
        events = 0;
        ctx.body = {'login': 'test4@webda.io', 'password': 'test', register: true};
        ctx.session = webda.getNewSession();
        executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http");
        executor._params.providers.email.postValidation = true;
        executor._params.providers.email.skipEmailValidation = true;
        return executor.execute(ctx);
      }).then(() => {
        // No new email has been sent
        assert.equal(mailer.sent.length, 2);
        assert.equal(events, 2); // Register + Login
        assert.notEqual(ctx.session.getUserId(), undefined);
      });
    });

    it('/me', function () {
      ctx = webda.newContext({}, webda.getNewSession());
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/me", "http");
      found = false;
      return executor.execute(ctx).catch((err) => {
        found = true;
        // Session with empty user
        assert.equal(err, 404);
        ctx.body = {'login': 'test5@webda.io', 'password': 'test', register: true, 'plop': 'yep'};
        executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http");
        return executor.execute(ctx);
      }).then(() => {
        assert.equal(found, true);
        // Get me on known user
        ctx.body = {};
        executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/me", "http");
        return executor.execute(ctx);
      }).then(() => {
        let user = JSON.parse(ctx._body);
        assert.equal(user.plop, 'yep');
        assert.equal(user.register, undefined);
        assert.equal(user.locale, 'es-ES');
        assert.notEqual(user, undefined);
      });
    });

    it('login', function () {
      var params = {'login': 'test3@webda.io', 'password': 'test'};
      events = 0;
      ctx = webda.newContext(params, webda.getNewSession());
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http");
      return executor.execute(ctx).catch((err) => {
        assert.equal(ctx.session.getUserId(), undefined);
        // As it has not been validate
        assert.equal(err, 404);
        params.login = "test2@webda.io";
        ctx.body = params;
        ctx.session = webda.getNewSession();
        return executor.execute(ctx);
      }).then(() => {
        assert.equal(events, 1); // Login
        assert.notEqual(ctx.session.getUserId(), undefined);
        // Verify ident type
        return identStore.get(ctx.session.getIdentUsed());
      }).then((ident) => {
        assert.equal(ident.type, "email");
        params.login = "test2@webda.io";
        params.password = "bouzouf";
        ctx.body = params;
        ctx.session = webda.getNewSession();
        return executor.execute(ctx);
      }).catch((err) => {
        assert.equal(err, 403);
        assert.equal(ctx.session.getUserId(), undefined);
        assert.equal(events, 1);
      });
    });

    it('passwordRecovery', function () {
      var params = {'login': userId, 'password': 'retest'};
      var tokenInfo = {};
      var failed = false;
      events = 0;
      ctx = webda.newContext(params, webda.getNewSession());
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email/passwordRecovery", "http");
      return webda.getService('Authentication').getPasswordRecoveryInfos(userId, -10).then((infos) => {
        tokenInfo = infos;
        return executor.execute(ctx);
      }).catch((err) => {
        failed = true;
        assert.equal(err, 400);
        // Missing the body
        ctx.body.token = tokenInfo.token;
        ctx.body.expire = 123;
      }).then(() => {
        assert.equal(failed, true);
        failed = false;
        return executor.execute(ctx);
      }).catch((err) => {
        failed = true;
        assert.equal(err, 403);
        // Missing the body
        ctx.body.token = tokenInfo.token;
        ctx.body.expire = tokenInfo.expire;
        return executor.execute(ctx);
      }).then(() => {
        assert.equal(failed, true);
        failed = false;
        return executor.execute(ctx);
      }).catch((err) => {
        failed = true;
        assert.equal(err, 410);
        return webda.getService('Authentication').getPasswordRecoveryInfos(userId);
      }).then((tokenInfo) => {
        assert.equal(failed, true);
        failed = false;
        // Missing the body
        ctx.body.token = tokenInfo.token;
        ctx.body.expire = tokenInfo.expire;
        return executor.execute(ctx);
      }).then(() => {
        // Should be update with password retest now
        ctx.body = {'login': 'test2@webda.io', 'password': 'retest'};
        ctx.session = webda.getNewSession();
        executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http");
        return executor.execute(ctx);
      }).then(() => {
        assert.notEqual(ctx.session.getUserId(), undefined);
        executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/email/test2@webda.io/recover", "http");
        return executor.execute(ctx);
      }).then(() => {
        assert.equal(mailer.sent.length, 1);
        assert.notEqual(mailer.sent[0].replacements.infos, undefined);
        assert.notEqual(mailer.sent[0].replacements.infos.expire, undefined);
        assert.notEqual(mailer.sent[0].replacements.infos.token, undefined);
        return executor.execute(ctx);
      }).catch((err) => {
        failed = true;
        assert.equal(err, 429);
      }).then(() => {
        assert.equal(failed, true);
        failed = false;
      });
    });
  });
  describe("OAuth", function () {
    it('AWS Compatibility', function () {
      ctx = webda.newContext();
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/github");
      assert.equal(ctx._route.aws.defaultCode, 302);
    });
    it('Callback', function () {
      var done = function () {
      };
      var lastUsed = null;
      events = 0;
      let ident = new Ident("github", "test");
      let profile = {'displayName': 'Georges Abitbol'};
      ctx = webda.newContext({}, webda.getNewSession());
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/github/callback?code=blahblah");
      return executor.handleOAuthReturn(ctx, profile, ident, done).then(() => {
        assert.equal(ctx.statusCode, 302);
        assert.equal(ctx._params.code, "blahblah");
        assert.equal(ctx._headers.Location, "https://shootandprove.loopingz.com/user.html?validation=github");
        // The ident must have been created and have a last used
        assert.notEqual(ident.lastUsed, lastUsed);
        lastUsed = ident;
        // Set by the store
        assert.notEqual(ident.lastUpdate, undefined);
        // Login + Register
        assert.equal(events, 2);
        events = 0;
        assert.equal(ctx.session.isLogged(), true);
        return executor.handleOAuthReturn(ctx, profile, ident, done);
      }).then(() => {
        assert.equal(events, 1); // Only Login
        assert.notEqual(ident.lastUsed, lastUsed);
        return userStore.get(ident.user);
      }).then((user) => {
        events = 0;
        assert.equal(user.idents.length, 1); // Only one github login
        assert.equal(user.idents[0].uuid, "test_github"); // Only one github login
        assert.equal(user.test, "TESTOR"); // Verify that the listener on Register has done something
        return executor.handleOAuthReturn(ctx, profile, new Ident("github", "retest"), done);
      }).then(() => {
        assert.equal(events, 1); // Only Login
        assert.equal(ctx.statusCode, 302);
        assert.equal(ctx._headers.Location, "https://shootandprove.loopingz.com/user.html?validation=github");
        return userStore.get(ident.user);
      }).then((user) => {
        assert.equal(user.idents.length, 2); // Two github login
        assert.equal(user.idents[1].uuid, "retest_github");
      });
    });
  });
});