var Webda = require("../core.js");
var Executor = require("../services/executor.js");
var old_config = require("./config.old.json");
var assert = require("assert");
var webda;
var ctx;

describe('Webda Configuration Migration', function () {
	it('From v0 to v1', function () {
		let webda = new Webda(old_config);
		// All services - DefinedMailer
		assert.equal(Object.keys(webda.getServices()).length, 17);
		// Check locales are moved correctly
		assert.equal(webda.getLocales().length, 3);
		// Check models - 2 from configuration files - 2 from Webda
		let count = 0;
		for (let key in webda.getModels()) {
			if (key.startsWith('webdatest')) {
				count++;
			}
		}
		assert.equal(count, 2);
		// Check params
		assert.equal(webda.getGlobalParams().TEST, 'Global');
		assert.equal(webda.getGlobalParams().region, 'us-east-1');
		// Check custom route migration
		ctx = webda.newContext();
		executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/urltemplate/666");
		assert.notEqual(executor, undefined);
	    assert.equal(ctx['_route']['_http']["method"], "GET");
	    assert.equal(ctx['_route']['_http']["url"], "/urltemplate/666");
	    assert.equal(ctx['_route']['_http']["host"], "test.webda.io");
	    assert.equal(ctx['_params']['id'], 666);
	    assert.equal(ctx["_params"]["TEST_ADD"], "Users");
	    assert.equal(ctx["_params"]["TEST"], "Global");
	});
});