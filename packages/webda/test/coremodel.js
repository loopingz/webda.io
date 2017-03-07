"use strict";
const assert = require("assert");
const CoreModel = require('../models/coremodel');
const Task = require('./models/task');
const Webda = require("../core.js");
const config = require("./config.json");
var webda = new Webda(config);
var ctx = webda.newContext();

describe('CoreModel', function() {
	it('Verify unsecure constructor', function() {
		let object = new CoreModel({_test: 'plop', test:'plop'});
		assert.equal(object._test, undefined);
		assert.equal(object.test, 'plop');
	});

	it('Verify secure constructor', function() {
		let object = new CoreModel({_test: 'plop', test:'plop', __serverOnly: 'server'}, true);
		assert.equal(object._test, 'plop');
		assert.equal(object.test, 'plop');
		describe('JSON support and fields protection', function() {
			it('Verify JSON export', function() {
				let exported = JSON.parse(JSON.stringify(object));
				assert.equal(exported.__serverOnly, undefined);
				assert.equal(exported._test, 'plop');
				assert.equal(exported.test, 'plop');
			});

			it('Verify JSON stored export', function() {
				let exported = JSON.parse(object.toStoredJSON());
				assert.equal(exported.__serverOnly, 'server');
				assert.equal(exported._test, 'plop');
				assert.equal(exported.test, 'plop');
			});
		});
	});

	describe('JSON Schema validation', function() {
		it('Verify bad schema object', function() {
			let webda = new Webda(config);
	    	let ctx = webda.newContext();
	    	let failed = false;
	    	let object = new Task({"noname": "Task #1"});
	    	return object.validate(ctx).catch( () => {
	    		failed = true;
	    	}).then( () => {
	    		assert.equal(failed, true);
	    	});
		});

		it('Verify good schema object', function() {
			let webda = new Webda(config);
	    	let ctx = webda.newContext();
	    	let failed = false;
	    	let object = new Task({"name": "Task #1"});
	    	return object.validate(ctx).catch( () => {
	    		failed = true;
	    	}).then( () => {
	    		assert.notEqual(failed, true);
	    	});
		});
	});
});