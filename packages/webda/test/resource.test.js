"use strict";
var assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config.json");
const fs = require('fs');
const Utils = require("./utils");

var executor;
var ctx;

describe('ResourceService', () => {
  var webda;
  var resource;
  var resourceModel;
  beforeEach(() => {
    webda = new Webda.Core(config);
    resource = webda.getService('ResourceService');
    resourceModel = webda.getService('ModelsResource');
    ctx = webda.newContext();
  });
  describe('ResourceService', () => {
    it('GET /resources/../config.json', async () => {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/resources/../config.json");
      assert.notEqual(executor, undefined);
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 401);
    });
    it('GET /resources/config.unknown.json', async () => {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/resources/config.unknown.json");
      assert.notEqual(executor, undefined);
      await Utils.throws(executor.execute.bind(executor, ctx), err => err == 404);
    });
    it('GET /resources/config.json', async () => {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/resources/config.json");
      assert.notEqual(executor, undefined);
      await executor.execute(ctx);
      assert.equal(ctx._body, fs.readFileSync('./test/config.json').toString());
      assert.equal(ctx._headers['Content-Type'], 'application/json');
    });
    it('GET /resources/policy.test.js', async () => {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/resources/policy.test.js");
      assert.notEqual(executor, undefined);
      await executor.execute(ctx);
      assert.equal(ctx._body, fs.readFileSync('./test/policy.test.js').toString());
      assert.equal(ctx._headers['Content-Type'], 'application/javascript');
    });
    it('GET /resources/data/test.txt', async () => {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/resources/data/test.txt");
      assert.notEqual(executor, undefined);
      await executor.execute(ctx);
      assert.equal(ctx._body, fs.readFileSync('./test/data/test.txt').toString());
      assert.equal(ctx._headers['Content-Type'], 'text/plain');
    });
  });
  describe('ModelsResource', () => {
    // Check Store HTTP mapping
    it('GET /templates/.../html.mustache', async () => {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/templates/PASSPORT_EMAIL_RECOVERY/html.mustache");
      assert.notEqual(executor, undefined);
      await executor.execute(ctx);
      assert.equal(ctx._body, fs.readFileSync('./templates/PASSPORT_EMAIL_RECOVERY/html.mustache').toString());
      assert.equal(ctx._headers['Content-Type'], 'application/octet-stream');
      ctx.body = undefined;
    });
  });
});
