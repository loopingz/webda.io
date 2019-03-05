"use strict";
var assert = require("assert");
import { Store } from "../index";
import { WebdaTest } from "../test";
import { test } from "mocha-typescript";
import * as Idents from "../../test/models/ident";

abstract class StoreTest extends WebdaTest {
  abstract getIdentStore(): Store<any>;
  abstract getUserStore(): Store<any>;

  async before() {
    await super.before();
    await this.getIdentStore().__clean();
    await this.getUserStore().__clean();
  }

  getModelClass() {
    return Idents;
  }

  @test
  async mapper() {
    let identStore = this.getIdentStore();
    let userStore = this.getUserStore();
    let user1, ident1, ident2, user2;
    var eventFired = 0;
    var events = [
      "Store.Save",
      "Store.Saved",
      "Store.Get",
      "Store.Delete",
      "Store.Deleted",
      "Store.Update",
      "Store.Updated",
      "Store.Find",
      "Store.Found"
    ];
    for (let evt in events) {
      identStore.on(events[evt], function(evt) {
        eventFired++;
      });
    }
    assert.equal(await userStore.get(undefined), undefined);
    user1 = (await userStore.save({
      name: "test"
    })).uuid;
    let user = await userStore.get(user1);
    // Save a user and add an ident
    assert.notEqual(user, undefined);
    user1 = user.uuid;
    ident1 = await identStore.save({
      type: "facebook",
      _user: user.uuid
    });
    user = await userStore.get(user1);
    // Verify the ident is on the user
    assert.notEqual(user, undefined);
    assert.notEqual(user.idents, undefined);
    assert.equal(user.idents.length, 1);
    // Retrieve index to verify it is in it too
    let index = await identStore.get("index");
    assert.notEqual(index[ident1.uuid], undefined);
    assert.equal(index[ident1.uuid].type, "facebook");
    let lastUpdate = user.idents[0]._lastUpdate;
    await this.sleep(10);
    await identStore.incrementAttribute(ident1.uuid, "counter", 1);
    await user.refresh();
    assert.notEqual(user.idents[0]._lastUpdate, 0);
    this.assertLastUpdateNotEqual(
      user.idents[0]._lastUpdate,
      lastUpdate,
      "lastUpdate on a map after incrementAttribute"
    );
    lastUpdate = user.idents[0]._lastUpdate;
    await this.sleep(10);
    await identStore.upsertItemToCollection(ident1.uuid, "actions", {
      uuid: "action_1",
      type: "plop",
      date: new Date()
    });
    await user.refresh();
    assert.notEqual(user.idents[0]._lastUpdate.length, 0);
    this.assertLastUpdateNotEqual(
      user.idents[0]._lastUpdate,
      lastUpdate,
      "lastUpdate on a map after upsertItemToCollection"
    );
    lastUpdate = user.idents[0]._lastUpdate;
    await this.sleep(10);
    await identStore.deleteItemFromCollection(
      ident1.uuid,
      "actions",
      0,
      "plop",
      "type"
    );
    await user.refresh();
    assert.notEqual(user.idents[0]._lastUpdate.length, 0);
    this.assertLastUpdateNotEqual(
      user.idents[0]._lastUpdate,
      lastUpdate,
      "lastUpdate on a map after deleteItemFromCollection"
    );

    ident2 = await identStore.save({
      type: "google",
      _user: user.uuid
    });
    // Add a second ident and check it is on the user aswell
    user = await userStore.get(user1);
    assert.equal(user.idents.length, 2);

    // Check index
    await index.refresh();
    assert.notEqual(index[ident2.uuid], undefined);

    ident2.type = "google2";
    // Update ident2 to check mapper update
    let res = await identStore.patch({
      uuid: ident2.uuid,
      type: "google2"
    });
    assert.equal(res.type, "google2");
    assert.equal(res._user, user1);

    // Check index
    await index.refresh();
    assert.equal(index[ident2.uuid].type, "google2");

    user = await userStore.get(user1);
    assert.equal(user.idents.length, 2);
    assert.equal(user.idents[1].type, "google2");
    assert.equal(user.idents[1] instanceof this.getModelClass(), true);
    await identStore.delete(ident1.uuid);
    user = await userStore.get(user1);
    assert.equal(user.idents.length, 1);
    assert.equal(user.idents[0].type, "google2");
    // Add a second user to play
    user = await userStore.save({
      name: "test2"
    });
    user2 = user.uuid;
    // Move ident2 from user1 to user2
    await identStore.patch({
      _user: user.uuid,
      uuid: ident2.uuid
    });
    // Check user1 has no more ident
    user = await userStore.get(user1);
    assert.equal(user.idents.length, 0);
    // Check user2 has one ident
    user = await userStore.get(user2);
    assert.equal(user.idents.length, 1);
    assert.equal(user.idents[0].type, "google2");
    // Verify you cannot update a collection from update
    await userStore.update(
      {
        idents: []
      },
      user2
    );
    user = await userStore.get(user2);
    assert.equal(user.idents.length, 1);
    assert.equal(user.idents[0].type, "google2");
    // Verify delete cascade with empty collection
    await userStore.delete(user1);
    user = await userStore.get(user2);
    assert.equal(user.idents.length, 1);
    assert.equal(user.idents[0].type, "google2");
    // Verify delete cascade
    await userStore.delete(user2);
    let ident = await identStore.get(ident2.uuid);
    assert.equal(ident.__deleted, true);

    // Check index
    await index.refresh();
    assert.equal(index[ident2.uuid], undefined);
    assert.equal(index[ident1.uuid], undefined);

    assert.equal(eventFired, 17);
    await identStore.delete(ident2.uuid, true);
    ident = await identStore.get(ident2.uuid);
    assert.equal(ident, undefined);
    assert.equal(eventFired, 19);
  }

  @test
  async collection() {
    let identStore = this.getIdentStore();
    var ident;
    ident = await identStore.save({
      test: "plop"
    });
    await identStore.upsertItemToCollection(ident.uuid, "actions", {
      uuid: "action_1",
      type: "plop",
      date: new Date()
    });
    await ident.refresh();
    assert.notEqual(ident.actions, undefined);
    assert.equal(ident.actions.length, 1);
    await identStore.upsertItemToCollection(ident.uuid, "actions", {
      uuid: "action_2",
      type: "plop",
      date: new Date()
    });
    await ident.refresh();
    assert.notEqual(ident.actions, undefined);
    assert.equal(ident.actions.length, 2);
    await identStore.upsertItemToCollection(
      ident.uuid,
      "actions",
      {
        uuid: "action_1",
        type: "plop2",
        date: new Date()
      },
      0
    );
    await ident.refresh();
    assert.notEqual(ident.actions, undefined);
    assert.equal(ident.actions.length, 2);
    assert.equal(ident.actions[0].type, "plop2");
    assert.equal(ident.actions[0].uuid, "action_1");
    await this.assertThrowsAsync(
      identStore.upsertItemToCollection.bind(
        identStore,
        ident.uuid,
        "actions",
        {
          uuid: "action_1",
          type: "plop2",
          date: new Date()
        },
        0,
        "plop",
        "type"
      ),
      err => true
    );
    await this.assertThrowsAsync(
      identStore.deleteItemFromCollection.bind(
        identStore,
        ident.uuid,
        "actions",
        0,
        "action_2"
      ),
      err => true
    );
    await ident.refresh();
    assert.equal(ident.actions.length, 2);
    assert.equal(ident.actions[0].type, "plop2");
    let lastUpdate = ident._lastUpdate;
    await this.sleep(10);
    await identStore.upsertItemToCollection(
      ident.uuid,
      "actions",
      {
        uuid: "action_1",
        type: "plop",
        date: new Date()
      },
      0,
      "plop2",
      "type"
    );
    await ident.refresh();
    this.assertLastUpdateNotEqual(
      ident._lastUpdate,
      lastUpdate,
      "lastUpdate after upsertItemToColletion failed"
    );
    lastUpdate = ident._lastUpdate;
    await this.sleep(10);
    await identStore.deleteItemFromCollection(
      ident.uuid,
      "actions",
      0,
      "plop",
      "type"
    );
    ident = await identStore.get(ident.uuid);
    this.assertLastUpdateNotEqual(
      ident._lastUpdate,
      lastUpdate,
      "lastUpdate after deleteItemToColletion failed"
    );
    assert.notEqual(ident.actions, undefined);
    assert.equal(ident.actions.length, 1);
    assert.equal(ident.actions[0].type, "plop");
    assert.equal(ident.actions[0].uuid, "action_2");
  }

  @test
  async getAll() {
    let userStore = this.getUserStore();
    var user1;
    var user3;
    user1 = await userStore.save({
      name: "test1"
    });
    await userStore.save({
      name: "test2"
    });
    user3 = await userStore.save({
      name: "test3"
    });
    let users = await userStore.getAll();
    assert.equal(users.length, 3);
    assert.equal(users[0] instanceof userStore._model, true);
    assert.equal(users[1] instanceof userStore._model, true);
    assert.equal(users[2] instanceof userStore._model, true);
    users = await userStore.getAll([user1.uuid, user3.uuid]);
    assert.equal(users.length, 2);
    assert.equal(users[0] instanceof userStore._model, true);
    assert.equal(users[1] instanceof userStore._model, true);
  }

  @test
  async crud() {
    let identStore = this.getIdentStore();
    var eventFired = 0;
    var events = [
      "Store.Save",
      "Store.Saved",
      "Store.Get",
      "Store.Delete",
      "Store.Deleted",
      "Store.Update",
      "Store.Updated",
      "Store.Find",
      "Store.Found"
    ];
    for (let evt in events) {
      identStore.on(events[evt], function(evt) {
        eventFired++;
      });
    }
    // Check CREATE - READ
    let ident1 = await identStore.save({
      test: "plop",
      cool: "",
      lastUsed: new Date(),
      arr: [],
      details: {
        plop: "plop1",
        clean: undefined,
        yop: "pouf"
      }
    });
    assert.equal(eventFired, 2);
    assert.notEqual(ident1, undefined);
    eventFired = 0;
    let getter = await identStore.get(ident1.uuid);
    assert.equal(eventFired, 1);
    eventFired = 0;
    assert.notEqual(getter, undefined);
    assert.notEqual(getter.lastUsed, undefined);
    assert.notEqual(getter._lastUpdate, undefined);
    assert.equal(getter.uuid, ident1.uuid);
    assert.equal(getter.test, ident1.test);

    // Check UPDATE
    getter.test = "plop2";
    getter.details.plop = "plop2";
    getter.details.blank = "";
    getter.details.bouzouf = undefined;
    getter.empty = [];
    let object;
    await identStore.update(getter);
    assert.equal(eventFired, 2);
    eventFired = 0;
    object = await identStore.get(ident1.uuid);
    assert.equal(object.test, "plop2");
    assert.equal(object.details.plop, "plop2");
    getter = await identStore.get(object.uuid);
    assert.equal(eventFired, 2);
    assert.equal(getter.test, "plop2");
    await this.sleep(10);
    await identStore.incrementAttribute(ident1.uuid, "counter", 1);
    let ident = await identStore.get(ident1.uuid);
    // Verify lastUpdate is updated too
    this.assertLastUpdateNotEqual(
      ident._lastUpdate,
      ident1._lastUpdate,
      "lastUpdate after incrementAttribute failed"
    );
    assert.equal(ident.counter, 1);
    await identStore.incrementAttribute(ident1.uuid, "counter", 3);
    ident1 = await identStore.get(ident1.uuid);
    assert.equal(ident1.counter, 4);
    await identStore.incrementAttribute(ident1.uuid, "counter", -6);
    let res = await identStore.exists(ident1.uuid);
    assert.equal(res, true);
    ident1 = await identStore.get(ident1.uuid);
    assert.equal(ident1.counter, -2);
    // Check DELETE
    eventFired = 0;
    await identStore.delete(ident1.uuid, true);
    assert.equal(eventFired, 2);
    eventFired = 0;
    ident = await identStore.get(ident1.uuid);
    assert.equal(ident, undefined);
    res = await identStore.exists(ident1.uuid);
    assert.equal(res, false);
  }
  assertLastUpdateNotEqual(d1, d2, msg) {
    assert.notEqual(d1, d2, msg);
  }
}

export { StoreTest };
