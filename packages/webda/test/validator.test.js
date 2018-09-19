"use strict";
const assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config.json");
var executor;
var webda = new Webda.Core(config);
var ctx;
const Utils = require("./utils");

describe('Validator', function() {
  var taskStore;
  var userStore;
  before(async () => {
    await webda.init();
  });
  describe('JSON Schema', function() {
    beforeEach(async () => {
      taskStore = webda.getService("Tasks");
      userStore = webda.getService("Users");
      assert.notEqual(taskStore, undefined);
      assert.notEqual(userStore, undefined);
      await taskStore.__clean();
      await userStore.__clean();
    });
    it('Create', async () => {
      ctx = webda.newContext();
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/tasks");
      assert.notEqual(executor, undefined);
      ctx.session.login("fake_user", "fake_ident");
      ctx.body = {
        "noname": "Task #1"
      };
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 400);
      ctx.body = {
        "name": "Task #1"
      };
      await executor.execute(ctx);
      ctx.body = {
        "name": "Task #1"
      };
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/tasks");
      await executor.execute(ctx);
      let task = JSON.parse(ctx._body);
      // It is two because the Saved has been called two
      assert.notEqual(task.uuid, undefined);
      assert.equal(task._autoListener, 2);
      task = await taskStore.get(task.uuid);
      assert.equal(task._autoListener, 1);
    });
  });
});
