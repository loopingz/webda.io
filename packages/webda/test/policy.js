"use strict";
var assert = require("assert");
var Webda = require("../core.js");
var config = require("./config.json");
var executor;
var session;
var task;
var failed = false;
var webda = new Webda(config);
webda.setHost("test.webda.io");
webda.initAll();
var ctx;

describe('Policy', function () {
  var taskStore;
  var userStore;
  describe('OwnerPolicy', function () {
    beforeEach(function () {
      taskStore = webda.getService("Tasks");
      userStore = webda.getService("Users");
      assert.notEqual(taskStore, undefined);
      assert.notEqual(userStore, undefined);
      taskStore.__clean();
      userStore.__clean();
    });
    it('Create', function () {
      ctx = webda.newContext({});
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/tasks");
      assert.notEqual(executor, undefined);
      ctx.body = {"name": "Task #1"};
      return executor.execute(ctx).catch((err) => {
        // Expect 403 as no user is logged
        failed = true;
        assert.equal(err, 403);
        ctx.session.login("fake_user", "fake_ident");
        ctx.body = {"name": "Task #1"};
        return executor.execute(ctx);
      }).then(() => {
        // Should be ok in that case
        assert.equal(failed, true);
        failed = false;
        task = ctx.body;
        ctx.session.login("fake_user2", "fake_ident");
        ctx.body = {};
        executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/tasks/" + task.uuid);
        return executor.execute(ctx);
      }).catch((err) => {
        // The user is not the right user and no publci flag is set
        assert.equal(err, 403);
        failed = true;
        ctx.session.login("fake_user", "fake_ident");
        return executor.execute(ctx);
      }).then(() => {
        assert.equal(failed, true);
        failed = false;
        let result = JSON.parse(ctx._body);
        assert.equal(result.uuid, task.uuid);
        ctx.body = {'public': true};
        executor = webda.getExecutor(ctx, "test.webda.io", "PUT", "/tasks/" + task.uuid);
        return executor.execute(ctx);
      }).then(() => {
        ctx.session.login("fake_user2", "fake_ident");
        executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/tasks/" + task.uuid);
        return executor.execute(ctx);
      }).then(() => {
        // We should be able to get the object now
        let result = JSON.parse(ctx._body);
        assert.equal(result.uuid, task.uuid);
        executor = webda.getExecutor(ctx, "test.webda.io", "PUT", "/tasks/" + task.uuid);
        ctx.body = {'public': false};
        return executor.execute(ctx);
      }).catch((err) => {
        failed = true;
        assert.equal(err, 403);
      }).then(() => {
        assert.equal(failed, true);
        failed = false;
        executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/tasks/" + task.uuid);
        ctx.body = {'public': false};
        return executor.execute(ctx);
      }).catch((err) => {
        failed = true;
        assert.equal(err, 403);
      }).then(() => {
        assert.equal(failed, true);
        failed = false;
        executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/tasks/" + task.uuid);
        ctx.session.login("fake_user", "fake_ident");
        ctx.body = {'public': false};
        return executor.execute(ctx);
      });
    });
  });
});