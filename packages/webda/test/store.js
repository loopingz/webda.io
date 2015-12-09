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
      router = new Router(config);
      callable = router.getRoute("test.webda.io", "GET", "/");
      assert.notEqual(callable, undefined);
      store = stores.get("test.webda.io_idents");
      userStore = stores.get("test.webda.io_users");
      assert.notEqual(store, undefined);
      // Should remove folder
      // Create data folder in case
      cleanStore(store);
      cleanStore(userStore);
      // Check CREATE - READ
      object = store.save({"test": "plop"});
      getter = store.get(object.uuid);
      assert.notEqual(getter, undefined);
      assert.equal(getter.uuid, object.uuid);
      assert.equal(getter.test, object.test);
      // Check UPDATE
      getter.test = "plop2"
      object = store.update(getter);
      assert.equal(getter.test, "plop2");
      getter = store.get(object.uuid);
      assert.equal(getter.test, "plop2");
      // Check DELETE
      store.delete(object.uuid);
      getter = store.get(object.uuid);
      assert.equal(getter, undefined);
      // Check MAPPER
      // First save a user
      user = userStore.save({'name': 'test'});
      ident = {"type": "facebook", "user": user.uuid};
      store.save(ident);
      // Check the ident has been added to user according to mapping
      user = userStore.get(user.uuid);
      assert.notEqual(user, undefined);
      assert.notEqual(user.idents, undefined);
      assert.equal(user.idents.length, 1);
      ident2 = {"type": "google", "user": user.uuid};
      // Have to reload the store namespace issue ?
      store = stores.get("test.webda.io_idents");
      store.save(ident2);
      user = userStore.get(user.uuid);
      assert.equal(user.idents.length, 2);
      // Update the ident2
      ident2.type = "google2";
      store = stores.get("test.webda.io_idents");
      store.update(ident2);
      user = userStore.get(user.uuid);
      assert.equal(user.idents.length, 2);
      assert.equal(user.idents[1].type, "google2");
      store = stores.get("test.webda.io_idents");
      // Deletion
      store.delete(ident.uuid);
      user = userStore.get(user.uuid);
      assert.equal(user.idents.length, 1);
      assert.equal(user.idents[0].type, "google2");
      // CHange of target
      user2 = userStore.save({"name": "test2"});
      ident2.user = user2.uuid;
      store = stores.get("test.webda.io_idents");

      store.update(ident2);
      user = userStore.get(user.uuid);
      assert.equal(user.idents.length, 0);
      user2 = userStore.get(user2.uuid);
      assert.equal(user2.idents.length, 1);
      assert.equal(user2.idents[0].type, "google2");
    });
  });
});