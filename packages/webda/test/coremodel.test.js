"use strict";
const assert = require("assert");
const Webda = require("../lib/index.js");
const CoreModel = Webda.CoreModel;
const Utils = require('./utils')
const Task = require('./models/task');
const config = require("./config.json");
var webda = new Webda.Core(config);
var ctx = webda.newContext();

describe('CoreModel', () => {
  it('Verify unsecure constructor', () => {
    let object = new CoreModel({
      _test: 'plop',
      test: 'plop'
    });
    assert.equal(object._test, undefined);
    assert.equal(object.test, 'plop');
  });

  it('Verify secure constructor', () => {
    let object = new CoreModel({
      _test: 'plop',
      test: 'plop',
      __serverOnly: 'server'
    }, true);
    assert.equal(object._test, 'plop');
    assert.equal(object.test, 'plop');
    describe('JSON support and fields protection', () => {
      it('Verify JSON export', function() {
        let exported = JSON.parse(JSON.stringify(object));
        assert.equal(exported.__serverOnly, undefined);
        assert.equal(exported._test, 'plop');
        assert.equal(exported.test, 'plop');
      });

      it('Verify JSON stored export', () => {
        let exported = object.toStoredJSON();
        assert.equal(exported.__serverOnly, 'server');
        assert.equal(exported._test, 'plop');
        assert.equal(exported.test, 'plop');
      });

      it('Verify JSON stored export - stringify', () => {
        let exported = JSON.parse(object.toStoredJSON(true));
        assert.equal(exported.__serverOnly, 'server');
        assert.equal(exported._test, 'plop');
        assert.equal(exported.test, 'plop');
      });
    });
  });

  describe('JSON Schema validation', () => {
    it('Verify bad schema object', async () => {
      let failed = false;
      let object = new Task({
        "noname": "Task #1"
      });
      await Utils.throws(object.validate(ctx));
    });

    it('Verify good schema object', async () => {
      let object = new Task({
        "name": "Task #1"
      });
      await object.validate(ctx);
    });
  });

  describe('Test (C)RUD', () => {
    var ident;
    var identStore = webda.getService("Idents");
    beforeEach(async () => {
      assert.notEqual(identStore, undefined);
      identStore.__clean();
      ident = {
        property: 'plop'
      };
      ident = await identStore.save(ident);
    });

    it('Verify Retrieve', async () => {
      await ident.update({
        property: 'plop2'
      }, ident.uuid);
      let res = await ident.refresh();
      assert.equal(res.property, 'plop2');
      assert.equal(ident.property, 'plop2');
    });

    it('Verify Update', async () => {
      ident.property = 'plop2';
      ident.newOne = 'yes';
      await ident.save();
      let retrieved = await identStore.get(ident.uuid);
      assert.equal(retrieved.property, 'plop2');
      assert.equal(retrieved.newOne, 'yes');
    });

    it('Verify Delete', async () => {
      await ident.delete();
      let retrieved = await identStore.get(ident.uuid);
      assert.equal(retrieved.__deleted, true);
    });
  });
});
