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

describe('Validator', function() {
    var taskStore;
    var userStore;
    describe('JSON Schema', function() {
      beforeEach(function () {
        taskStore = webda.getService("Tasks");
        userStore = webda.getService("Users");
        assert.notEqual(taskStore, undefined);
        assert.notEqual(userStore, undefined);
        taskStore.__clean();
        userStore.__clean();
      });
      it('Create', function() {
      	 executor = webda.getExecutor("test.webda.io", "POST", "/tasks");
      	 assert.notEqual(executor, undefined);
      	 session = webda.getNewSession();
         session.login("fake_user", "fake_ident");
      	 executor.setContext({"noname": "Task #1"}, session);
      	 return webda.execute(executor).catch ((err) => {
	      	// Expect 403 as no user is logged
          failed = true;
	      	assert.equal(err, 400);
	      	executor.setContext({"name": "Task #1"}, session);
	      	return webda.execute(executor);
      	}).then( () => {
      		// Should be ok in that case
      		assert.equal(failed, true);
      		failed = false;
      		executor = webda.getExecutor("test.webda.io", "POST", "/tasks");
      		executor.setContext({"name": "Task #1"}, session);
      		return webda.execute(executor);
      	});
      });
    });
});