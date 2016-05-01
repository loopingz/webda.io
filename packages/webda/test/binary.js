var assert = require("assert")
var Webda = require("../webda.js");
var config = require("./config.json");
var fs = require("fs");

var webda;
var userStore;
var binary;

var normal = function (userStore, binary) {
  var eventFired = 0;
  var events = ['binaryGet','binaryUpdate','binaryCreate','binaryDelete'];
  for (evt in events) {
    binary.on(events[evt], function (evt) {
      eventFired++;
    });
  }
  // Check CREATE - READ
  var hash;
  var count = 1;
  var user1;
  var user2;
  userStore.save({"test": "plop"}).then( function(user) {
    user1 = user;
    return userStore.save({"test": "plop"});
  }).then( function(user) {
    user2 = user;
    return binary.store(userStore, user1, 'images', {'path': './test/Dockerfile'}, {});
  }).then(function () {
    return userStore.get(user1.uuid);
  }).then(function(user) {
    assert.notEqual(user.images, undefined);
    assert.equal(user.images.length, 1);
    hash = user.images[0].hash;
    return binary.getUsageCount(hash);
  }).then(function(value) {
    assert.equal(value, 1);
    return binary.store(userStore, user2, 'images', {'path': './test/Dockerfile'}, {});
  }).then(function() {
    return userStore.get(user2.uuid);
  }).then(function(user) {
    assert.notEqual(user.images, undefined);
    assert.equal(user.images.length, 1);
    hash = user.images[0].hash;
    return binary.getUsageCount(hash);
  }).then(function(value) {
    assert.equal(value, 2);
    return binary.delete(userStore, user, 'images', 0);
  }).then(function() {
    return userStore.get(user2.uuid);
  }).then(function(user) {
    assert.equal(user.images.length, 0);
    return binary.getUsageCount(hash);
  }).then(function(value) {
    assert.equal(value, 1);
    return userStore.delete(user1.uuid);
  }).then(function() {
    return binary.getUsageCount(hash);
  }).then(function (value) {
    assert.equal(value, 0);
  });      
}

var notMapped = function (userStore, binary) {
  var exception = false;
  userStore.save({"test": "plop"}).then (function (user1) {
    return binary.store(userStore, user1, 'images2', {'path': './test/Dockerfile'}, {});
  }).catch( function(err) {
    exception = true;
  }).then( function() {
    assert.equal(exception, true, 'Should have not succeed');
  });
}

var update = function (userStore, binary) {
  var user1;
  userStore.save({"test": "plop"}).then (function (user) {
    user1 = user;
    return binary.store(userStore, user1, 'images', {'path': './test/Dockerfile'}, {});
  }).then(function () {
    return userStore.get(user1.uuid);
  }).then(function (user) {
    assert.notEqual(user.images, undefined);
    assert.equal(user.images.length, 1);
    hash = user.images[0].hash;
    return binary.getUsageCount(hash);
  }).then(function(value) {
    assert.equal(value, 1);
    return binary.update(userStore, user, 'images', 0, {'path': './test/Dockerfile.txt'}, {});
  }).then(function() {
    return userStore.get(user1.uuid);
  }).then(function (user) {
    assert.notEqual(user.images, undefined);
    assert.equal(user.images.length, 1);
    assert.notEqual(hash, user.images[0].hash);
    assert.equal(user.images[0].mimetype, 'text/plain');
    assert.equal(user.images[0].name, 'Dockerfile.txt');
    return binary.getUsageCount(hash);
  }).then(function(value) {
    assert.equal(value, 0);
    return binary.getUsageCount(user.images[0].hash)
  }).then(function(value) {
    assert.equal(value, 1);
  }); 
}

describe('Binary', function() {
  var webda;
  var binary;
  var userStore;
  before (function () {
    skipS3 = process.env["WEBDA_AWS_KEY"] === undefined;
    if (skipS3) {
      console.log("Not running S3Binary test as no AWS env found");
    }
  });
  beforeEach(function () {
    webda = new Webda(config);
    webda.setHost("test.webda.io");
    webda.initAll();
  });
  describe('FileBinary', function () {
    beforeEach(function () {
      userStore = webda.getService("users");
      binary = webda.getService("binary");
      assert.notEqual(userStore, undefined);
      assert.notEqual(binary, undefined);
      return userStore.__clean().then ( function() {
        return binary.__clean();
      });
    });
    it('normal', function() { return normal(userStore, binary); });
    it('not-mapped', function() { return notMapped(userStore, binary); });
    it('update', function() { return update(userStore, binary); });
  });
  describe('S3Binary', function() {
    var uuids = {};
    beforeEach(function () {
      if (skipS3) {
        return;
      }
      userStore = webda.getService("users");
      binary = webda.getService("s3binary");
      assert.notEqual(userStore, undefined);
      assert.notEqual(binary, undefined);
      return userStore.__clean().then ( function() {
        return binary.__clean();
      });
    });
    it('normal', function() { if (skipS3) { this.skip(); return; } return normal(userStore, binary); });
    it('not-mapped', function() { if (skipS3) { this.skip(); return; } return notMapped(userStore, binary); });
    it('update', function() { if (skipS3) { this.skip(); return; } return update(userStore, binary); });
  });
  describe('challenge()', function () {
    it('_isValidChallenge', function () {
      binary = webda.getService("binary");
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e8157980"), true);
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798G"), false);
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798"), false);
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798."), false);
    });
  });
});