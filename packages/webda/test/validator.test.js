"use strict";
const assert = require("assert");
const Webda = require("../" + (process.env["WEBDA_TEST_TARGET"] ? process.env["WEBDA_TEST_TARGET"] : "src") + "/index.js");
var config = require("./config.json");
var executor;
var session;
var task;
var failed = false;
var webda = new Webda.Core(config);
var ctx;

describe('Validator', function() {
  var taskStore;
  var userStore;
  describe('JSON Schema', function() {
    beforeEach(function() {
      taskStore = webda.getService("Tasks");
      userStore = webda.getService("Users");
      assert.notEqual(taskStore, undefined);
      assert.notEqual(userStore, undefined);
      taskStore.__clean();
      userStore.__clean();
    });
    it('Create', function() {
      ctx = webda.newContext();
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/tasks");
      assert.notEqual(executor, undefined);
      ctx.session.login("fake_user", "fake_ident");
      ctx.body = {
        "noname": "Task #1"
      };
      return executor.execute(ctx).catch((err) => {
        // Expect 400 as no name was provided
        failed = true;
        assert.equal(err, 400);
        ctx.body = {
          "name": "Task #1"
        };
        return executor.execute(ctx);
      }).then(() => {
        // Should be ok in that case
        assert.equal(failed, true);
        failed = false;
        ctx.body = {
          "name": "Task #1"
        };
        executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/tasks");
        return executor.execute(ctx);
      }).then(() => {
        let task = JSON.parse(ctx._body);
        // It is two because the Saved has been called two
        assert.notEqual(task.uuid, undefined);
        assert.equal(task._autoListener, 2);
        return taskStore.get(task.uuid);
      }).then((task) => {
        // It should only be 1 as the onSaved is not preserved
        assert.equal(task._autoListener, 1);
      });
    });
  });
});
