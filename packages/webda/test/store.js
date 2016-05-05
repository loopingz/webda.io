var assert = require("assert")
var Webda = require("../core.js");
var config = require("./config.json");

mapper = function (identStore, userStore) {
  var eventFired = 0;
  var events = ['storeSave','storeSaved','storeGet','storeDelete','storeDeleted','storeUpdate','storeUpdated','storeFind','storeFound'];
  for (evt in events) {
    identStore.on(events[evt], function (evt) {
      eventFired++;
    });
  }
  var user1;
  var user2;
  var ident1;
  var ident2;
  return userStore.save({'name': 'test'}).then( function (user) {
    user1 = user.uuid;
    return userStore.get(user1);
  }).then( function(user) {
    // Save a user and add an ident
    assert.notEqual(user, undefined);
    user1 = user.uuid;
    return identStore.save({"type": "facebook", "user": user.uuid});
  }).then( function(ident) {
    ident1 = ident;
    return userStore.get(user1);
  }).then( function(user) {
    // Verify the ident is on the user
    assert.notEqual(user, undefined);
    assert.notEqual(user.idents, undefined);
    assert.equal(user.idents.length, 1);    
    return identStore.save({"type": "google", "user": user.uuid});
  }).then( function(ident) {
    // Add a second ident and check it is on the user aswell
    ident2 = ident;
    return userStore.get(user1);
  }).then( function(user) {
    assert.equal(user.idents.length, 2);
    ident2.type = 'google2';
    // Update ident2 to check mapper update
    return identStore.update(ident2);
  }).then( function() {
    return userStore.get(user1);
  }).then( function(user) {
    assert.equal(user.idents.length, 2);
    assert.equal(user.idents[1].type, "google2");
    return identStore.delete(ident1.uuid);
  }).then( function() {
    return userStore.get(user1);
  }).then( function(user) {
    assert.equal(user.idents.length, 1);
    assert.equal(user.idents[0].type, "google2");
    // Add a second user to play
    return userStore.save({"name": "test2"});
  }).then ( function(user) {
    ident2.user = user2 = user.uuid;
    // Move ident2 from user1 to user2
    return identStore.update(ident2);
  }).then( function() {
    // Check user1 has no more ident
    return userStore.get(user1);
  }).then( function(user) {
    assert.equal(user.idents.length, 0);
    // Check user2 has one ident
    return userStore.get(user2);
  }).then( function(user) {
    assert.equal(user.idents.length, 1);
    assert.equal(user.idents[0].type, "google2");
    // Verify you cannot update a collection from update
    return userStore.update({"idents": []}, user2);
  }).then( function() {
    return userStore.get(user2);
  }).then( function(user) {
    assert.equal(user.idents.length, 1);
    assert.equal(user.idents[0].type, "google2");
    // Verify delete cascade with empty collection
    return userStore.delete(user1);
  }).then( function() {
    return userStore.get(user2);
  }).then( function(user) {
    assert.equal(user.idents.length, 1);
    assert.equal(user.idents[0].type, "google2");
    // Verify delete cascade
    return userStore.delete(user2);
  }).then( function() {
    return identStore.get(ident2.uuid);
  }).then( function(ident) {
    assert.equal(ident, undefined);
    assert.equal(eventFired, 13);
  });
}

crud = function (identStore,userStore) {
  var eventFired = 0;
  var events = ['storeSave','storeSaved','storeGet','storeDelete','storeDeleted','storeUpdate','storeUpdated','storeFind','storeFound'];
  for (evt in events) {
    identStore.on(events[evt], function (evt) {
      eventFired++;
    });
  }
  // Check CREATE - READ
  return identStore.save({"test": "plop", 'details': {'plop': 'plop1', 'yop': 'pouf'}}).then (function (object) {
    ident1 = object;
    assert.equal(eventFired, 2);
    assert.notEqual(object, undefined);
    eventFired = 0;
    return identStore.get(ident1.uuid);
  }).then (function (getter) {
    assert.equal(eventFired, 1);
    eventFired = 0;
    assert.notEqual(getter, undefined);
    assert.equal(getter.uuid, ident1.uuid);
    assert.equal(getter.test, ident1.test);
    
    // Check UPDATE
    getter.test = "plop2"
    getter.details.plop = "plop2";
    return identStore.update(getter);
  }).then (function (object) {
    assert.equal(eventFired, 2);
    eventFired = 0;
    return identStore.get(ident1.uuid);
  }).then (function (object) {
    assert.equal(object.test, "plop2");
    assert.equal(object.details.plop, "plop2");
    return identStore.get(object.uuid);
  }).then (function (getter) {
    assert.equal(eventFired, 2);
    eventFired = 0;
    assert.equal(getter.test, "plop2");
    // Check DELETE
    return identStore.delete(ident1.uuid);
  }).then (function () {
    assert.equal(eventFired, 2);
    eventFired = 0;
    return identStore.get(ident1.uuid);
  }).then (function (getter) {
    assert.equal(eventFired, 1);
    eventFired = 0;
    assert.equal(getter, undefined);
  });
};

var skipDynamo = true;
var skipMongo = true;
describe('Store', function() {
    var webda;
    var identStore;
    var userStore;
    before (function () {
      skipMongo = process.env["WEBDA_MONGO_URL"] === undefined;
      skipDynamo = process.env["WEBDA_AWS_KEY"] === undefined;
      if (skipDynamo) {
        console.log("Not running DynamoStore test as no AWS env found");
      }
      if (skipMongo) {
        console.log("Not running MongoStore test as no MONGO env found");
      }
    });
    beforeEach(function () {
      webda = new Webda(config);
      webda.setHost("test.webda.io");
      webda.initAll();
    });
    describe('FileStore', function() {
      beforeEach(function () {
        identStore = webda.getService("Idents");
        userStore = webda.getService("Users");
        assert.notEqual(identStore, undefined);
        assert.notEqual(userStore, undefined);
        identStore.__clean();
        userStore.__clean();
      });
      it('Basic CRUD', function() { return crud(identStore, userStore); });
      it('Mapper', function() { return mapper(identStore, userStore); });
    });
    describe('MongoStore', function() {
      beforeEach(function () {
        if (skipMongo) {
          return;
        }
        identStore = webda.getService("mongoidents");
        userStore = webda.getService("mongousers");
        assert.notEqual(identStore, undefined);
        assert.notEqual(userStore, undefined);
        return identStore.__clean().then (function() {
          return userStore.__clean();
        }).catch (function(err) {
          console.log(err);
          return Promise.reject(err);
        });
      });
      it('Basic CRUD', function() { if (skipMongo) { this.skip(); return; } return crud(identStore, userStore); });
      it('Mapper', function() { if (skipMongo) { this.skip(); return; } return mapper(identStore, userStore); });
    });
    describe('DynamoStore', function() {
      var uuids = {};
      beforeEach(function () {
        if (skipDynamo) {
          return;
        }
        identStore = webda.getService("dynamoidents");
        userStore = webda.getService("dynamousers");
        assert.notEqual(identStore, undefined);
        assert.notEqual(userStore, undefined);

        return identStore.__clean().then (function() {
          return userStore.__clean();
        });
      });
      it('Basic CRUD', function() { if (skipDynamo) { this.skip(); return; } return crud(identStore, userStore); });
      it('Mapper', function() { if (skipDynamo) { this.skip(); return; } return mapper(identStore, userStore); });
    });
});