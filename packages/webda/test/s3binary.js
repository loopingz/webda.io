var assert = require("assert")
var Webda = require("../webda.js");
var config = require("./config.json");
var webda;
var userStore;
var binary;
var skip = false;

describe('S3Binary', function() {
  before (function() {
    skip = process.env.AWS === undefined;
    if (skip) {
      console.log("Not running as no AWS env found");
    }
  })
  beforeEach( function() {
      if (skip) {
        return;
      }
      webda = new Webda(config);
      webda.setHost("test.webda.io");
      webda.initAll();
      userStore = webda.getService("users");
      binary = webda.getService("s3");
      assert.notEqual(userStore, undefined);
      assert.notEqual(binary, undefined);
      return binary.__clean().then( function() {
        return userStore.__clean();
      });
  })
  describe('store()', function () {

    it('normal', function () {
      if (skip) {
        this.skip();
        return;
      }
      this.timeout(10000);
      // Check CREATE - READ
      var hash;
      var count = 1;
      var user;
      var user1 = userStore.save({"test": "plop"});
      var user2 = userStore.save({"test": "plop"});
      return binary.store(userStore, user1, 's3images', {'path': './test/Dockerfile'}, {}).then(function () {
        user = userStore.get(user1.uuid);
        assert.notEqual(user.s3images, undefined);
        assert.equal(user.s3images.length, 1);
        hash = user.s3images[0].hash;
        return binary.getUsageCount(hash);
      }).then(function(value) {
        assert.equal(value, 1);
        return binary.store(userStore, user2, 's3images', {'path': './test/Dockerfile'}, {});
      }).then(function() {
        user = userStore.get(user2.uuid);
        assert.notEqual(user.s3images, undefined);
        assert.equal(user.s3images.length, 1);
        hash = user.s3images[0].hash;
        return binary.getUsageCount(hash);
      }).then(function(value) {
        assert.equal(value, 2);
        return binary.delete(userStore, user, 's3images', 0);
      }).then(function() {
        user = userStore.get(user2.uuid);
        return binary.getUsageCount(hash);
      }).then(function(value) {
        assert.equal(value, 1);
        assert.equal(user.s3images.length, 0);
        userStore.delete(user1.uuid);
        return binary.getUsageCount(hash);
      }).then(function(value) {
        assert.equal(value, 0);
      });      
    });
    it('update', function () {
      if (skip) {
        this.skip();
        return;
      }
      this.timeout(10000);
      var user1 = userStore.save({"test": "plop"});
      var user;
      return binary.store(userStore, user1, 's3images', {'path': './test/Dockerfile'}, {}).then(function () {
        user = userStore.get(user1.uuid);
        assert.notEqual(user.s3images, undefined);
        assert.equal(user.s3images.length, 1);
        hash = user.s3images[0].hash;
        return binary.getUsageCount(hash);
      }).then(function(value) {
        assert.equal(value, 1);
        return binary.update(userStore, user, 's3images', 0, {'path': './test/Dockerfile.txt'}, {});
      }).then(function() {
        user = userStore.get(user1.uuid);
        assert.notEqual(user.s3images, undefined);
        assert.equal(user.s3images.length, 1);
        assert.notEqual(hash, user.s3images[0].hash);
        assert.equal(user.s3images[0].mimetype, 'text/plain');
        assert.equal(user.s3images[0].name, 'Dockerfile.txt');
        return binary.getUsageCount(hash);
      }).then(function(value) {
        assert.equal(value, 0);
        return binary.getUsageCount(user.s3images[0].hash);
      }).then(function(value) {
        assert.equal(value, 1);
      }); 
    });  
  });
});