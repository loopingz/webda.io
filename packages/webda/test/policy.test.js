"use strict";
const assert = require("assert");
const Webda = require("../" + (process.env["WEBDA_TEST_TARGET"] ? process.env["WEBDA_TEST_TARGET"] : "src") + "/index.js");
const Utils = require("./utils");
var config = require("./config.json");
var executor;
var session;
var task;
var failed = false;
var webda = new Webda.Core(config);
var ctx;

describe('Policy', () => {
  var taskStore;
  var userStore;
  describe('OwnerPolicy', () => {
    beforeEach(function() {
      taskStore = webda.getService("Tasks");
      userStore = webda.getService("Users");
      assert.notEqual(taskStore, undefined);
      assert.notEqual(userStore, undefined);
      taskStore.__clean();
      userStore.__clean();
    });
    it('Create', async () => {
      ctx = webda.newContext({});
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/tasks");
      assert.notEqual(executor, undefined);
      ctx.body = {
        "name": "Task #1"
      };
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
      ctx.session.login("fake_user", "fake_ident");
      ctx.body = {
        "name": "Task #1"
      };
      await executor.execute(ctx);
      task = ctx.body;
      ctx.session.login("fake_user2", "fake_ident");
      ctx.body = {};
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/tasks/" + task.uuid);
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
      ctx.session.login("fake_user", "fake_ident");
      await executor.execute(ctx);
      let result = JSON.parse(ctx._body);
      assert.equal(result.uuid, task.uuid);
      ctx.body = {
        'public': true
      };
      executor = webda.getExecutor(ctx, "test.webda.io", "PUT", "/tasks/" + task.uuid);
      await executor.execute(ctx);
      ctx.session.login("fake_user2", "fake_ident");
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/tasks/" + task.uuid);
      await executor.execute(ctx);
      result = JSON.parse(ctx._body);
      assert.equal(result.uuid, task.uuid);
      executor = webda.getExecutor(ctx, "test.webda.io", "PUT", "/tasks/" + task.uuid);
      ctx.body = {
        'public': false
      };
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
      executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/tasks/" + task.uuid);
      ctx.body = {
        'public': false
      };
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
      executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/tasks/" + task.uuid);
      ctx.session.login("fake_user", "fake_ident");
      ctx.body = {
        'public': false
      };
      await executor.execute(ctx);
    });
  });
});
