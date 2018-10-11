"use strict";
const assert = require("assert");
const Webda = require("../lib/index.js");
const Utils = require("./utils");
var config = require("./config.json");
var executor;
var session;
var task;
var failed = false;
var webda;
var ctx;

describe('Policy', () => {
  var taskStore;
  var userStore;
  before(async () => {
    webda = new Webda.Core(config);
    await webda.init();
  });
  describe('OwnerPolicy', () => {
    beforeEach(async function() {
      taskStore = webda.getService("Tasks");
      userStore = webda.getService("Users");
      assert.notEqual(taskStore, undefined);
      assert.notEqual(userStore, undefined);
      await taskStore.__clean();
      await userStore.__clean();
      ctx = webda.newContext({});
      await taskStore.save({
        _user: "fake_user",
        uuid: "task_user1",
        name: "for_schema"
      });
      await taskStore.save({
        _user: "fake_user2",
        uuid: "task_user2"
      });
      await taskStore.save({
        _user: "fake_user3",
        uuid: "task_public",
        public: true
      });
    });
    it('POST - not logged', async () => {
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/tasks");
      assert.notEqual(executor, undefined);
      ctx.body = {
        "name": "Task #1"
      };
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
    });
    it('POST', async () => {
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/tasks");
      ctx.session.login("fake_user", "fake_ident");
      ctx.body = {
        "name": "Task #1"
      };
      await executor.execute(ctx);
      task = ctx.body;
      assert.equal(task.name, "Task #1");
    });
    it('GET - wrong owner', async () => {
      ctx.session.login("fake_user2", "fake_ident");
      ctx.body = {};
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/tasks/task_user1");
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
    });
    it('PUT - wrong owner', async () => {
      ctx.session.login("fake_user2", "fake_ident");
      ctx.body = {};
      executor = webda.getExecutor(ctx, "test.webda.io", "PUT", "/tasks/task_user1");
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
    });
    it('PUT', async () => {
      ctx.session.login("fake_user", "fake_ident");
      ctx.body = {
        'public': true
      };
      executor = webda.getExecutor(ctx, "test.webda.io", "PUT", "/tasks/task_user1");
      await executor.execute(ctx);
      let result = JSON.parse(ctx._body);
      assert.equal(result.uuid, "task_user1");
      assert.equal(result.public, true);
    });
    it('GET - public', async () => {
      ctx.session.login("fake_user2", "fake_ident");
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/tasks/task_public");
      await executor.execute(ctx);
      let result = JSON.parse(ctx._body);
      assert.equal(result.uuid, 'task_public');
    });
    it('Actions', async () => {
      ctx.session.login("fake_user2", "fake_ident");
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", '/tasks/task_user1/actionable');
      await executor.execute(ctx);
      executor = webda.getExecutor(ctx, "test.webda.io", "PUT", '/tasks/task_user1/impossible');
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
    });
    it('DELETE', async () => {
      ctx.session.login("fake_user2", "fake_ident");
      executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/tasks/task_user2");
      await executor.execute(ctx);
    });
    it('DELETE - wrong owner', async () => {
      ctx.session.login("fake_user2", "fake_ident");
      executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/tasks/task_user1");
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
    });
    it('DELETE - wrong owner - public', async () => {
      ctx.session.login("fake_user2", "fake_ident");
      executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/tasks/task_public");
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
    });
    it('DELETE - unknown', async () => {
      ctx.session.login("fake_user2", "fake_ident");
      executor = webda.getExecutor(ctx, "test.webda.io", "DELETE", "/tasks/task_unknown");
      await Utils.throws(executor.execute.bind(executor, ctx), res => res == 404);
    });
  });
});
