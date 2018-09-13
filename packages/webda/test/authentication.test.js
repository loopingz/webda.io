"use strict";
var assert = require("assert")
const Webda = require("../lib/index.js");
var config = require("./config.json");
var Ident = require("./models/ident");
var identStore;
var userStore;
var mailer;
var events;
var executor;
var found = false;
var webda;
var ctx;
var userId;
const Utils = require("./utils");

const validationUrl = /.*\/auth\/email\/callback\?email=([^&]+)&token=([^ ]+)/

describe('Passport', function() {
  before(async function() {
    webda = new Webda.Core(config);
    await webda.init();
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
  beforeEach(function() {
    mailer.sent = [];
  });
  describe('Email', function() {
    it('register', async () => {
      var params = {
        'email': 'test@Webda.io',
        'password': 'testtest'
      };
      ctx = webda.newContext(params);
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http", 80, {
        'Accept-Language': 'en-GB'
      });
      events = 0;
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 400);
      params.login = params.email;
      ctx.body = params;
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 404);
      params.register = true;
      ctx.body = params;
      ctx.session = webda.getNewSession();
      await executor.execute(ctx);
      assert.equal(ctx.session.identId, undefined);
      assert.equal(mailer.sent.length, 1);
      let ident = await identStore.get('test@webda.io_email');
      assert.equal(ident, undefined);
      executor._params.providers.email.postValidation = true;
      ctx.body.login = "Test2@webda.io";
      ctx.session = webda.getNewSession();
      await executor.execute(ctx);
      assert.equal(events, 2); // Register + Login
      userId = ctx.session.getUserId();
      assert.notEqual(ctx.session.getUserId(), undefined);
      assert.equal(mailer.sent.length, 2);
      let user = await userStore.get(ctx.session.getUserId());
      assert.notEqual(user, undefined);
      assert.notEqual(user.__password, undefined);
      assert.equal(user.locale, 'en-GB');
      assert.equal(user.test, "TESTOR"); // Verify that the listener on Register has done something
      // Now logout
      executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/auth", "http");
      await executor.execute(ctx);
      // Now validate first user
      executor._params.providers.email.postValidation = false;
      assert.equal(ctx.session.getUserId(), undefined);
      var match = mailer.sent[0].replacements.url.match(validationUrl);
      assert.notEqual(match, undefined);
      assert.equal(match[1], 'test@webda.io');
      ctx.body = {
        'token': match[2],
        'password': 'testtest',
        'login': match[1],
        'register': true,
        'add': 'plop'
      };
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http");
      await executor.execute(ctx);
      // Should create it with the dat provided
      assert.notEqual(ctx.session.getUserId(), undefined);
      ident = await identStore.get(ctx.session.getIdentUsed());
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
      await executor.execute(ctx);
      assert.equal(ctx.statusCode, 302);
      // Verify the skipEmailValidation parameter
      events = 0;
      ctx.body = {
        'login': 'test4@webda.io',
        'password': 'testtest',
        register: true
      };
      ctx.session = webda.getNewSession();
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http");
      executor._params.providers.email.postValidation = true;
      executor._params.providers.email.skipEmailValidation = true;
      await executor.execute(ctx);
      // No new email has been sent
      assert.equal(mailer.sent.length, 2);
      assert.equal(events, 2); // Register + Login
      assert.notEqual(ctx.session.getUserId(), undefined);
    });

    it('register - bad password', async function() {
      // By default a password of 8 is needed
      var params = {
        'login': 'testBad@Webda.io',
        'password': 'test',
        register: true
      };
      ctx = webda.newContext(params);
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http", 80, {
        'Accept-Language': 'en-GB'
      });
      // Activate post validation
      executor._params.providers.email.postValidation = true;
      var error = false;
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 400);
    });

    it('/me', async function() {
      ctx = webda.newContext({}, webda.getNewSession());
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/me", "http");
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 404);
      ctx.body = {
        'login': 'test5@webda.io',
        'password': 'testtest',
        register: true,
        'plop': 'yep'
      };
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http");
      await executor.execute(ctx);
      // Get me on known user
      ctx.body = {};
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/me", "http");
      await executor.execute(ctx);
      let user = JSON.parse(ctx._body);
      assert.equal(user.plop, 'yep');
      assert.equal(user.register, undefined);
      assert.equal(user.locale, 'es-ES');
      assert.notEqual(user, undefined);
    });

    it('login', async function() {
      var params = {
        'login': 'test3@webda.io',
        'password': 'testtest'
      };
      events = 0;
      ctx = webda.newContext(params, webda.getNewSession());
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http");
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 404);
      assert.equal(ctx.session.getUserId(), undefined);
      // As it has not been validate
      params.login = "test2@webda.io";
      ctx.body = params;
      ctx.session = webda.getNewSession();
      await executor.execute(ctx);
      assert.equal(events, 1); // Login
      assert.notEqual(ctx.session.getUserId(), undefined);
      // Verify ident type
      let ident = await identStore.get(ctx.session.getIdentUsed());
      assert.equal(ident.type, "email");
      params.login = "test2@webda.io";
      params.password = "bouzouf";
      ctx.body = params;
      ctx.session = webda.getNewSession();
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
      assert.equal(ctx.session.getUserId(), undefined);
      assert.equal(events, 1);
    });

    it('passwordRecovery', async function() {
      var params = {
        'login': userId,
        'password': 'retesttest'
      };
      let tokenInfo = {};
      events = 0;
      ctx = webda.newContext(params, webda.getNewSession());
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email/passwordRecovery", "http");
      tokenInfo = await webda.getService('Authentication').getPasswordRecoveryInfos(userId, -10);
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 400);
      // Missing the body
      ctx.body.token = tokenInfo.token;
      ctx.body.expire = 123;
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
      // Missing the body
      ctx.body.token = tokenInfo.token;
      ctx.body.expire = tokenInfo.expire;
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 410);
      tokenInfo = await webda.getService('Authentication').getPasswordRecoveryInfos(userId);
      // Missing the body
      ctx.body.token = tokenInfo.token;
      ctx.body.expire = tokenInfo.expire;
      await executor.execute(ctx);
      // Should be update with password retest now
      ctx.body = {
        'login': 'test2@webda.io',
        'password': 'retesttest'
      };
      ctx.session = webda.getNewSession();
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", "http");
      await executor.execute(ctx);
      assert.notEqual(ctx.session.getUserId(), undefined);
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/email/test2@webda.io/recover", "http");
      await executor.execute(ctx);
      assert.equal(mailer.sent.length, 1);
      assert.notEqual(mailer.sent[0].replacements.infos, undefined);
      assert.notEqual(mailer.sent[0].replacements.infos.expire, undefined);
      assert.notEqual(mailer.sent[0].replacements.infos.token, undefined);
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 429);
    });
  });
  describe("OAuth", function() {
    it('AWS Compatibility', function() {
      ctx = webda.newContext();
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/github");
    });
    it('Callback', async function() {
      var done = function() {};
      var lastUsed = null;
      events = 0;
      let ident = Ident.init("github", "test");
      ctx = webda.newContext({}, webda.getNewSession());
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/github/callback?code=blahblah");
      await executor.handleOAuthReturn(ctx, ident, done);
      assert.equal(ctx.statusCode, 302);
      assert.equal(ctx._params.code, "blahblah");
      assert.equal(ctx._headers.Location, "https://webda.io/user.html?validation=github");
      ident = await identStore.get(ident.uuid);
      // The ident must have been created and have a last used
      assert.notEqual(ident.lastUsed, lastUsed);
      lastUsed = ident;
      // Set by the store
      assert.notEqual(ident.lastUpdate, undefined);
      // Login + Register
      assert.equal(events, 2);
      events = 0;
      assert.equal(ctx.session.isLogged(), true);
      await executor.handleOAuthReturn(ctx, ident, done);
      assert.equal(events, 1); // Only Login
      assert.notEqual(ident.lastUsed, lastUsed);
      let user = await userStore.get(ident.user);
      events = 0;
      assert.equal(user.idents.length, 1); // Only one github login
      assert.equal(user.idents[0].uuid, "test_github"); // Only one github login
      assert.equal(user.test, "TESTOR"); // Verify that the listener on Register has done something
      await executor.handleOAuthReturn(ctx, Ident.init("github", "retest"), done);
      assert.equal(events, 1); // Only Login
      assert.equal(ctx.statusCode, 302);
      assert.equal(ctx._headers.Location, "https://webda.io/user.html?validation=github");
      user = await userStore.get(ident.user);
      assert.equal(user.idents.length, 2); // Two github login
      assert.equal(user.idents[1].uuid, "retest_github");
    });
  });
});
