var assert = require("assert")
var Webda = require("../webda.js");
var config = require("./config.json");
var fs = require("fs");

cleanStore = function(store) {
  if (store === undefined) {
    return;
  }
  if (!fs.existsSync(store._params.folder)) {
    fs.mkdir(store._params.folder);  
  }
  files = fs.readdirSync(store._params.folder);
  for (file in files) {
    fs.unlink(store._params.folder + '/' + files[file]);
  }
}

cleanBinary = function(store) {
  if (store === undefined || store._params.folder === undefined) {
    return;
  }
  var ids = ["fba263b3801ca8c3a7eb7d83f8c16bb3e74cc5bb5b27465b07dc000b0ab2f751", "54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e8157980"]
  for (var i in ids) {
    var hash = ids[i];
    if (!fs.existsSync(store._params.folder + hash)) {
      continue;
    }
    files = fs.readdirSync(store._params.folder + hash);
    for (file in files) {
      fs.unlinkSync(store._params.folder + hash + '/' + files[file]);
    }
    fs.rmdirSync(store._params.folder + hash + '/');
  }
}
var webda;
var userStore;
var binary;

describe('Binary', function() {
  beforeEach( function() {
      webda = new Webda(config);
      webda.setHost("test.webda.io");
      webda.initAll();
      userStore = webda.getService("users");
      binary = webda.getService("binary");
      assert.notEqual(userStore, undefined);
      assert.notEqual(binary, undefined);
      cleanStore(userStore);
      cleanBinary(binary);
  })
  describe('store()', function () {

    it('normal', function () {
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
      var user1 = userStore.save({"test": "plop"});
      var user2 = userStore.save({"test": "plop"});
      return binary.store(userStore, user1, 'images', {'path': './test/Dockerfile'}, {}).then(function () {
        var user = userStore.get(user1.uuid);
        assert.notEqual(user.images, undefined);
        assert.equal(user.images.length, 1);
        hash = user.images[0].hash;
        assert.equal(binary.getUsageCount(hash), 1);
        return binary.store(userStore, user2, 'images', {'path': './test/Dockerfile'}, {});
      }).then(function() {
        var user = userStore.get(user2.uuid);
        assert.notEqual(user.images, undefined);
        assert.equal(user.images.length, 1);
        hash = user.images[0].hash;
        assert.equal(binary.getUsageCount(hash), 2);
        return binary.delete(userStore, user, 'images', 0);
      }).then(function() {
        var user = userStore.get(user2.uuid);
        assert.equal(binary.getUsageCount(hash), 1);
        assert.equal(user.images.length, 0);
        userStore.delete(user1.uuid);
        assert.equal(binary.getUsageCount(hash), 0);
      });      
    });
    it('not-mapped', function () {
      var exception = false;
      var user1 = userStore.save({"test": "plop"});
      return binary.store(userStore, user1, 'images2', {'path': './test/Dockerfile'}, {}).catch( function(err) {
        exception = true;
      }).then( function() {
        assert.equal(exception, true, 'Should have not succeed');
      });
    });
    it('update', function () {
      var user1 = userStore.save({"test": "plop"});
      return binary.store(userStore, user1, 'images', {'path': './test/Dockerfile'}, {}).then(function () {
        var user = userStore.get(user1.uuid);
        assert.notEqual(user.images, undefined);
        assert.equal(user.images.length, 1);
        hash = user.images[0].hash;
        assert.equal(binary.getUsageCount(hash), 1);
        return binary.update(userStore, user, 'images', 0, {'path': './test/Dockerfile.txt'}, {});
      }).then(function() {
        var user = userStore.get(user1.uuid);
        assert.notEqual(user.images, undefined);
        assert.equal(user.images.length, 1);
        assert.notEqual(hash, user.images[0].hash);
        assert.equal(user.images[0].mimetype, 'text/plain');
        assert.equal(user.images[0].name, 'Dockerfile.txt');
        assert.equal(binary.getUsageCount(hash), 0);
        assert.equal(binary.getUsageCount(user.images[0].hash), 1);
      }); 
    });  
  });
  describe('challenge()', function () {
    it('_isValidChallenge', function () {
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e8157980"), true);
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798G"), false);
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798"), false);
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798."), false);
    });
  });
});