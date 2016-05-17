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

describe('Policy', function() {
    var taskStore;
    var userStore;
    describe('OwnerPolicy', function() {
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
      	 executor.setContext({"name": "Task #1"}, session);
      	 return webda.execute(executor).catch ((err) => {
	      	// Expect 403 as no user is logged
	      	failed = true;
	      	assert.equal(err, 403);
	      	session.login("fake_user", "fake_ident");
	      	executor.setContext({"name": "Task #1"}, session);
	      	return webda.execute(executor);
      	}).then( () => {
      		// Should be ok in that case
      		assert.equal(failed, true);
      		failed = false;
      		assert.equal(executor.body.user, "fake_user");
      		task = executor.body;
      		session.login("fake_user2", "fake_ident");
      		executor = webda.getExecutor("test.webda.io", "GET", "/tasks/" + task.uuid);
      		executor.setContext({}, session);
      		return webda.execute(executor);
      	}).catch ((err) => {
      		// The user is not the right user and no publci flag is set
      		assert.equal(err, 403);
      		failed = true;
      		session.login("fake_user", "fake_ident");
      		executor.setContext({}, session);
      		return webda.execute(executor);
      	}).then( () => {
      		assert.equal(failed, true);
      		failed = false;
      		let result = JSON.parse(executor._body);
      		assert.equal(result.uuid, task.uuid);
      		executor.setContext({'public': true}, session);
      		executor = webda.getExecutor("test.webda.io", "PUT", "/tasks/" + task.uuid);
      		return webda.execute(executor);
      	}).then ( () => {
      		session.login("fake_user2", "fake_ident");
      		executor = webda.getExecutor("test.webda.io", "GET", "/tasks/" + task.uuid);
      		executor.setContext({}, session);
      		return webda.execute(executor);
      	}).then ( () => {
      		// We should be able to get the object now
      		let result = JSON.parse(executor._body);
      		assert.equal(result.uuid, task.uuid);
      		executor = webda.getExecutor("test.webda.io", "PUT", "/tasks/" + task.uuid);
      		executor.setContext({'public': false}, session);
      		return webda.execute(executor);
      	}).catch ((err) => {
      		failed = true;
      		assert.equal(err, 403);
      	}).then( () => {
      		assert.equal(failed, true);
      		failed = false;
      		executor = webda.getExecutor("test.webda.io", "DELETE", "/tasks/" + task.uuid);
      		executor.setContext({'public': false}, session);
      		return webda.execute(executor);
      	}).catch ((err) => {
      		failed = true;
      		assert.equal(err, 403);
      	}).then( () => {
      		assert.equal(failed, true);
      		failed = false;
      		executor = webda.getExecutor("test.webda.io", "DELETE", "/tasks/" + task.uuid);
      		session.login("fake_user", "fake_ident");
      		executor.setContext({'public': false}, session);
      		return webda.execute(executor);
      	});
      });
    });
});