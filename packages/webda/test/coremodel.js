"use strict";
const assert = require("assert");
const CoreModel = require('../models/coremodel');
const Task = require('./models/task');
const Webda = require("../core.js");
const config = require("./config.json");
var webda = new Webda(config);
var ctx = webda.newContext();
webda = new Webda(config);
webda.setHost("test.webda.io");
webda.initAll();

describe('CoreModel', function () {
  it('Verify unsecure constructor', function () {
    let object = new CoreModel({_test: 'plop', test: 'plop'});
    assert.equal(object._test, undefined);
    assert.equal(object.test, 'plop');
  });

  it('Verify secure constructor', function () {
    let object = new CoreModel({_test: 'plop', test: 'plop', __serverOnly: 'server'}, true);
    assert.equal(object._test, 'plop');
    assert.equal(object.test, 'plop');
    describe('JSON support and fields protection', function () {
      it('Verify JSON export', function () {
        let exported = JSON.parse(JSON.stringify(object));
        assert.equal(exported.__serverOnly, undefined);
        assert.equal(exported._test, 'plop');
        assert.equal(exported.test, 'plop');
      });

      it('Verify JSON stored export', function () {
        let exported = object.toStoredJSON();
        assert.equal(exported.__serverOnly, 'server');
        assert.equal(exported._test, 'plop');
        assert.equal(exported.test, 'plop');
      });

      it('Verify JSON stored export - stringify', function () {
        let exported = JSON.parse(object.toStoredJSON(true));
        assert.equal(exported.__serverOnly, 'server');
        assert.equal(exported._test, 'plop');
        assert.equal(exported.test, 'plop');
      });
    });
  });

  describe('JSON Schema validation', function () {
    it('Verify bad schema object', function () {
      let failed = false;
      let object = new Task({"noname": "Task #1"});
      return object.validate(ctx).catch(() => {
        failed = true;
      }).then(() => {
        assert.equal(failed, true);
      });
    });

    it('Verify good schema object', function () {
      let failed = false;
      let object = new Task({"name": "Task #1"});
      return object.validate(ctx).catch(() => {
        failed = true;
      }).then(() => {
        assert.notEqual(failed, true);
      });
    });
  });

  describe('Test (C)RUD', function () {
    var ident;
    var identStore = webda.getService("Idents");
    beforeEach(function () {
      assert.notEqual(identStore, undefined);
      identStore.__clean();
      ident = {uuid: 'test', property: 'plop'};
      return identStore.save(ident).then((obj) => {
        ident = obj;
      });
    });

    it('Verify Retrieve', function () {
      return identStore.update({property: 'plop2'}, 'test').then(() => {
        return ident.refresh();
      }).then((res) => {
        assert.equal(res.property, 'plop2');
        assert.equal(ident.property, 'plop2');
      });
    });

    it('Verify Update', function () {
      ident.property = 'plop2';
      ident.newOne = 'yes';
      return ident.save().then(() => {
        return identStore.get('test');
      }).then((retieved) => {
        assert.equal(retieved.property, 'plop2');
        assert.equal(retieved.newOne, 'yes');
      });
    });

    it('Verify Delete', function () {
      return ident.delete().then(() => {
        return identStore.get('test');
      }).then((retrieved) => {
        assert.equal(retrieved.__deleted, true);
      });
    });
  });
});