var assert = require("assert")
var stores = require("../store.js");
var Router = require("../router.js");
var config = require("./config.json");
var fs = require("fs");

cleanStore = function(store) {
  if (!fs.existsSync(store.options.folder)) {
    fs.mkdir(store.options.folder);  
  }
  files = fs.readdirSync(store.options.folder);
  for (file in files) {
    fs.unlink(store.options.folder + '/' + files[file]);
  }
}

describe('Store', function() {
  describe('getStore()', function () {

    it('Ident Store', function () {
      var eventFired = 0;
      var router = new Router(config);
      var callable = router.getRoute("test.webda.io", "GET", "/");
      assert.notEqual(callable, undefined);
      var store = stores.get("test.webda.io_idents");
      var userStore = stores.get("test.webda.io_users");
      assert.notEqual(store, undefined);
      // Should remove folder
      // Create data folder in case
      cleanStore(store);
      cleanStore(userStore);
      var events = ['storeSave','storeSaved','storeGet','storeDelete','storeDeleted','storeUpdate','storeUpdated','storeFind','storeFound'];
      for (evt in events) {
        store.on(events[evt], function (evt) {
          eventFired++;
        });
      }
      // Check CREATE - READ
      var object = store.save({"test": "plop"});
      assert.equal(eventFired, 2);
      eventFired = 0;
      var getter = store.get(object.uuid);
      assert.equal(eventFired, 1);
      eventFired = 0;
      assert.notEqual(getter, undefined);
      assert.equal(getter.uuid, object.uuid);
      assert.equal(getter.test, object.test);
      
      // Check UPDATE
      getter.test = "plop2"
      object = store.update(getter);
      assert.equal(eventFired, 2);
      eventFired = 0;
      assert.equal(getter.test, "plop2");
      getter = store.get(object.uuid);
      assert.equal(eventFired, 1);
      eventFired = 0;
      assert.equal(getter.test, "plop2");
      // Check DELETE
      store.delete(object.uuid);
      assert.equal(eventFired, 2);
      eventFired = 0;
      getter = store.get(object.uuid);
      assert.equal(eventFired, 1);
      eventFired = 0;
      assert.equal(getter, undefined);
      // Check MAPPER
      // First save a user
      var user = userStore.save({'name': 'test'});
      var ident = {"type": "facebook", "user": user.uuid};
      store.save(ident);
      // Check the ident has been added to user according to mapping
      user = userStore.get(user.uuid);
      assert.notEqual(user, undefined);
      assert.notEqual(user.idents, undefined);
      assert.equal(user.idents.length, 1);
      var ident2 = {"type": "google", "user": user.uuid};
      store.save(ident2);
      user = userStore.get(user.uuid);
      assert.equal(user.idents.length, 2);
      // Update the ident2
      ident2.type = "google2";
      store.update(ident2);
      user = userStore.get(user.uuid);
      assert.equal(user.idents.length, 2);
      assert.equal(user.idents[1].type, "google2");
      // Deletion
      store.delete(ident.uuid);
      user = userStore.get(user.uuid);
      assert.equal(user.idents.length, 1);
      assert.equal(user.idents[0].type, "google2");
      // CHange of target
      var user2 = userStore.save({"name": "test2"});
      ident2.user = user2.uuid;

      store.update(ident2);
      user = userStore.get(user.uuid);
      assert.equal(user.idents.length, 0);
      user2 = userStore.get(user2.uuid);
      assert.equal(user2.idents.length, 1);
      assert.equal(user2.idents[0].type, "google2");
      // Test update cannot update the collection
      userStore.update({"idents": []}, user2.uuid);
      user2 = userStore.get(user2.uuid);
      assert.equal(user2.idents.length, 1);
      // Test delete cascade
      userStore.delete(user.uuid);
      user2 = userStore.get(user2.uuid);
      assert.equal(user2.idents.length, 1);
      assert.equal(user2.idents[0].type, "google2");
      userStore.delete(user2.uuid);
      assert.equal(store.get(ident2.uuid), undefined);
      assert.equal(eventFired, 13);
    });
  });
});