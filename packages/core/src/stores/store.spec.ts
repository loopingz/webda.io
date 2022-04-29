import { WebdaTest } from "../test";
import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as Idents from "../../test/models/ident";
import { Store, StoreParameters } from "../index";
import { StoreEvents, StoreNotFoundError, UpdateConditionFailError } from "./store";
import { v4 as uuidv4 } from "uuid";
import { CoreModel } from "../models/coremodel";

@suite
class StoreParametersTest {
  @test
  cov() {
    let params = new StoreParameters({ expose: "/plop", lastUpdateField: "bz", creationDateField: "c" }, undefined);
    assert.deepStrictEqual(params.expose, { url: "/plop", restrict: {} });
    assert.throws(() => new StoreParameters({ map: {} }, undefined), Error);
    assert.throws(() => new StoreParameters({ index: [] }, undefined), Error);
  }
}
abstract class StoreTest extends WebdaTest {
  abstract getIdentStore(): Store<any>;
  abstract getUserStore(): Store<any>;

  /**
   * By default no testing index
   * @returns
   */
  async getIndex(): Promise<CoreModel> {
    return undefined;
  }

  /**
   * Recreate index if needed
   */
  async recreateIndex(): Promise<void> {}

  async before() {
    await super.before();
    await this.getUserStore().__clean();
    await this.getIdentStore().__clean();
    await this.recreateIndex();
  }

  getModelClass() {
    return Idents;
  }

  /**
   * Get the base of documents to query
   */
  getQueryDocuments(): any[] {
    let docs = [];
    for (let i = 0; i < 1000; i++) {
      docs.push({
        state: ["CA", "OR", "NY", "FL"][i % 4],
        order: i,
        team: {
          id: i % 20
        },
        role: i % 10
      });
    }
    return docs;
  }

  /**
   * Fill the Store with data to be queried
   */
  async fillForQuery(): Promise<Store> {
    let userStore = this.getUserStore();
    await Promise.all(this.getQueryDocuments().map(d => userStore.save(d)));
    return userStore;
  }

  @test
  async query() {
    let userStore = await this.fillForQuery();
    const queries = {
      'state = "CA"': 250,
      "team.id > 15": 200,
      "team.id >= 15": 250,
      'state IN ["CA", "NY"]': 500,
      'state IN ["CA", "NY", "NV"]': 500,
      'state = "CA" AND team.id > 15': 50,
      "team.id < 5 OR team.id > 15": 450,
      "role < 5 AND team.id > 10 OR team.id > 15": 400,
      "role < 5 AND (team.id > 10 OR team.id > 15)": 200
    };
    for (let i in queries) {
      assert.strictEqual(
        (await userStore.query(i)).results.length,
        queries[i],
        `Query: ${i} should return ${queries[i]}`
      );
    }
    return userStore;
  }

  @test
  async mapper() {
    let identStore = this.getIdentStore();
    let userStore = this.getUserStore();
    let user1, ident1, ident2, user2;
    var eventFired = 0;
    var events: (keyof StoreEvents)[] = [
      "Store.Save",
      "Store.Saved",
      "Store.Get",
      "Store.Delete",
      "Store.Deleted",
      "Store.Update",
      "Store.Updated",
      "Store.Query",
      "Store.Queried"
    ];
    for (let evt in events) {
      identStore.on(events[evt], function (evt) {
        eventFired++;
      });
    }
    assert.strictEqual(await userStore.get(undefined), undefined);
    user1 = (
      await userStore.save({
        name: "test"
      })
    ).uuid;
    let user = await userStore.get(user1);
    // Save a user and add an ident
    assert.notStrictEqual(user, undefined);
    user1 = user.uuid;
    ident1 = await identStore.save({
      type: "facebook",
      _user: user.uuid
    });
    user = await userStore.get(user1);
    // Verify the ident is on the user
    assert.notStrictEqual(user, undefined);
    assert.notStrictEqual(user.idents, undefined);
    assert.strictEqual(user.idents.length, 1);
    // Retrieve index to verify it is in it too
    let index = await this.getIndex();
    // Do not force index test for store
    if (index) {
      assert.notStrictEqual(index[ident1.uuid], undefined);
      assert.strictEqual(index[ident1.uuid].type, "facebook");
    }
    let lastUpdate = user.idents[0]._lastUpdate;
    await this.sleep(10);
    await identStore.incrementAttribute(ident1.uuid, "counter", 1);
    await user.refresh();
    assert.notStrictEqual(user.idents[0]._lastUpdate, 0);
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
    assert.notStrictEqual(user.idents[0]._lastUpdate.length, 0);
    this.assertLastUpdateNotEqual(
      user.idents[0]._lastUpdate,
      lastUpdate,
      "lastUpdate on a map after upsertItemToCollection"
    );
    lastUpdate = user.idents[0]._lastUpdate;
    await this.sleep(10);
    await identStore.deleteItemFromCollection(ident1.uuid, "actions", 0, "plop", "type");
    await user.refresh();
    assert.notStrictEqual(user.idents[0]._lastUpdate.length, 0);
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
    assert.strictEqual(user.idents.length, 2);

    // Check index
    if (index) {
      await index.refresh();
      assert.notStrictEqual(index[ident2.uuid], undefined);
    }

    ident2.type = "google2";
    // Update ident2 to check mapper update
    let res = await identStore.patch({
      uuid: ident2.uuid,
      type: "google2"
    });
    assert.strictEqual(res.type, "google2");
    assert.strictEqual(res._user, user1);

    // Check index
    if (index) {
      await index.refresh();
      assert.strictEqual(index[ident2.uuid].type, "google2");
    }

    user = await userStore.get(user1);
    assert.strictEqual(user.idents.length, 2);
    assert.strictEqual(user.idents[1].type, "google2");
    assert.strictEqual(user.idents[1] instanceof this.getModelClass(), true);
    await identStore.delete(ident1.uuid);
    user = await userStore.get(user1);
    assert.strictEqual(user.idents.length, 1);
    assert.strictEqual(user.idents[0].type, "google2");
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
    assert.strictEqual(user.idents.length, 0);
    // Check user2 has one ident
    user = await userStore.get(user2);
    assert.strictEqual(user.idents.length, 1);
    assert.strictEqual(user.idents[0].type, "google2");
    // Verify you cannot update a collection from patch
    await userStore.patch(
      {
        idents: []
      },
      user2
    );
    user = await userStore.get(user2);
    assert.strictEqual(user.idents.length, 1);
    // Verify you cannot update a collection from update
    await userStore.update(
      {
        idents: []
      },
      user2
    );
    user = await userStore.get(user2);
    assert.strictEqual(user.idents.length, 1);
    assert.strictEqual(user.idents[0].type, "google2");
    // Verify delete cascade with empty collection
    await userStore.delete(user1);
    user = await userStore.get(user2);
    assert.strictEqual(user.idents.length, 1);
    assert.strictEqual(user.idents[0].type, "google2");
    // Verify delete cascade
    await userStore.delete(user2);
    let ident = await identStore.get(ident2.uuid);
    assert.strictEqual(ident.__deleted, true);

    // Check index
    if (index) {
      await index.refresh();
      assert.strictEqual(index[ident2.uuid], undefined);
      assert.strictEqual(index[ident1.uuid], undefined);
    }

    assert.strictEqual(eventFired, 9);
    // Force sync delete - overriding the asyncDelete parameter
    await identStore.forceDelete(ident2.uuid);
    ident = await identStore.get(ident2.uuid);
    assert.strictEqual(ident, undefined);
    assert.strictEqual(eventFired, 11);
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
    assert.notStrictEqual(ident.actions, undefined);
    assert.strictEqual(ident.actions.length, 1);
    await identStore.upsertItemToCollection(ident.uuid, "actions", {
      uuid: "action_2",
      type: "plop",
      date: new Date()
    });
    await ident.refresh();
    assert.notStrictEqual(ident.actions, undefined);
    assert.strictEqual(ident.actions.length, 2);
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
    this.log("DEBUG", "Action", ident.actions);
    assert.notStrictEqual(ident.actions, undefined);
    assert.strictEqual(ident.actions.length, 2);
    assert.strictEqual(ident.actions[0].type, "plop2");
    assert.strictEqual(ident.actions[0].uuid, "action_1");
    await assert.rejects(
      () =>
        identStore.upsertItemToCollection(
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
    await assert.rejects(
      () => identStore.deleteItemFromCollection(ident.uuid, "actions", 0, "action_2"),
      err => true
    );
    await ident.refresh();
    assert.strictEqual(ident.actions.length, 2);
    assert.strictEqual(ident.actions[0].type, "plop2");
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
    this.assertLastUpdateNotEqual(ident._lastUpdate, lastUpdate, "lastUpdate after upsertItemToColletion failed");
    lastUpdate = ident._lastUpdate;
    await this.sleep(10);
    await identStore.deleteItemFromCollection(ident.uuid, "actions", 0, "plop", "type");
    ident = await identStore.get(ident.uuid);
    this.assertLastUpdateNotEqual(ident._lastUpdate, lastUpdate, "lastUpdate after deleteItemToColletion failed");
    assert.notStrictEqual(ident.actions, undefined);
    assert.strictEqual(ident.actions.length, 1);
    assert.strictEqual(ident.actions[0].type, "plop");
    assert.strictEqual(ident.actions[0].uuid, "action_2");
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
    assert.strictEqual(users.length, 3);
    assert.strictEqual(users[0] instanceof userStore._model, true);
    assert.strictEqual(users[1] instanceof userStore._model, true);
    assert.strictEqual(users[2] instanceof userStore._model, true);
    users = await userStore.getAll([user1.uuid, user3.uuid, uuidv4()]);
    assert.strictEqual(users.length, 2);
    assert.strictEqual(users[0] instanceof userStore._model, true);
    assert.strictEqual(users[1] instanceof userStore._model, true);
  }

  @test
  async crud() {
    let identStore = this.getIdentStore();
    var eventFired = 0;
    var events: (keyof StoreEvents)[] = [
      "Store.Save",
      "Store.Saved",
      "Store.Get",
      "Store.Delete",
      "Store.Deleted",
      "Store.Update",
      "Store.Updated",
      "Store.PatchUpdate",
      "Store.PatchUpdated",
      "Store.PartialUpdated",
      "Store.Query",
      "Store.Queried"
    ];
    for (let evt in events) {
      identStore.on(events[evt], function (e) {
        eventFired++;
      });
    }
    this.log("DEBUG", "Save ident");
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
    assert.strictEqual(eventFired, 2);
    assert.notStrictEqual(ident1, undefined);
    eventFired = 0;
    this.log("DEBUG", "Get ident");
    let getter = await identStore.get(ident1.uuid);
    assert.strictEqual(eventFired, 1);
    eventFired = 0;
    assert.notStrictEqual(getter, undefined);
    assert.notStrictEqual(getter.lastUsed, undefined);
    assert.notStrictEqual(getter._lastUpdate, undefined);
    assert.strictEqual(getter.uuid, ident1.uuid);
    assert.strictEqual(getter.test, ident1.test);

    // Check UPDATE
    getter.test = "plop2";
    getter.details.plop = "plop2";
    getter.details.blank = "";
    getter.details.bouzouf = undefined;
    getter.empty = [];
    let object;
    this.log("DEBUG", "Update ident");
    await identStore.update(getter);
    assert.strictEqual(eventFired, 2);
    eventFired = 0;
    getter = {};
    getter.uuid = ident1.uuid;
    getter.bouzouf = "test";
    this.log("DEBUG", "Patch ident");
    await identStore.patch(getter);
    assert.strictEqual(eventFired, 2);
    eventFired = 0;
    this.log("DEBUG", "Get ident to check update");
    object = await identStore.get(ident1.uuid);
    this.log("DEBUG", "Retrieved object", object);
    assert.strictEqual(object.test, "plop2");
    assert.strictEqual(object.details.plop, "plop2");
    getter = await identStore.get(object.uuid);
    assert.strictEqual(eventFired, 2);
    assert.strictEqual(getter.test, "plop2");
    await this.sleep(10);
    this.log("DEBUG", "Increment attribute");
    await identStore.incrementAttribute(ident1.uuid, "counter", 1);
    let ident = await identStore.get(ident1.uuid);

    // Verify lastUpdate is updated too
    this.assertLastUpdateNotEqual(ident._lastUpdate, ident1._lastUpdate, "lastUpdate after incrementAttribute failed");
    assert.strictEqual(ident.counter, 1);
    await identStore.incrementAttribute(ident1.uuid, "counter", 3);
    ident1 = await identStore.get(ident1.uuid);
    assert.strictEqual(ident1.counter, 4);
    await identStore.incrementAttribute(ident1.uuid, "counter", -6);
    let res = await identStore.exists(ident1.uuid);
    assert.strictEqual(res, true);
    ident1 = await identStore.get(ident1.uuid);
    assert.strictEqual(ident1.counter, -2);

    // Check DELETE
    eventFired = 0;
    await identStore.forceDelete(ident1.uuid);
    assert.strictEqual(eventFired, 2);
    eventFired = 0;
    ident = await identStore.get(ident1.uuid);
    assert.strictEqual(ident, undefined);
    res = await identStore.exists(ident1.uuid);
    assert.strictEqual(res, false);
  }
  assertLastUpdateNotEqual(d1, d2, msg) {
    assert.notStrictEqual(d1, d2, msg);
  }

  @test
  async exists() {
    let store = this.getIdentStore();
    let model = await store.save({});
    assert.ok(await store.exists(model.getUuid()));
    assert.ok(!(await store.exists(uuidv4())));
  }

  @test
  async incrementAttribute() {
    let store = this.getIdentStore();
    let model = await store.save({ counter: 0 });
    await store.incrementAttribute(model.getUuid(), "counter", 3);
    await store.incrementAttribute(model.getUuid(), "counter2", 2);
    await model.refresh();
    assert.strictEqual(model.counter, 3);
    assert.strictEqual(model.counter2, 2);
    await assert.rejects(() => store.incrementAttribute(uuidv4(), "counter", 1), StoreNotFoundError);
  }

  @test
  async removeAttribute() {
    let store = this.getIdentStore();
    let model = await store.save({ counter: 0, counter2: 12, counter3: 13 });
    await store.removeAttribute(model.getUuid(), "counter");
    await model.refresh();
    assert.strictEqual(model.counter, undefined);
    await assert.rejects(() => store.removeAttribute(uuidv4(), "counter"), StoreNotFoundError);
    await assert.rejects(
      () => store.removeAttribute(model.getUuid(), "counter2", 10, "counter3"),
      UpdateConditionFailError
    );
    await model.refresh();
    assert.strictEqual(model.counter2, 12);
  }

  @test
  async setAttribute() {
    let store = this.getIdentStore();
    let model = await store.save({ counter: 0 });
    await store.setAttribute(model.getUuid(), "counter", 3);
    await store.setAttribute(model.getUuid(), "status", "TESTED");
    await model.refresh();
    assert.strictEqual(model.counter, 3);
    assert.strictEqual(model.status, "TESTED");
    await assert.rejects(() => store.setAttribute(uuidv4(), "counter", 4), StoreNotFoundError);
    store.on("Store.PatchUpdate", async () => {
      model._lastUpdate = new Date();
      await store._update(model, model.getUuid());
      await this.sleep(1);
    });
    await assert.rejects(() => store.setAttribute(model.getUuid(), "counter", 4), UpdateConditionFailError);
    store.removeAllListeners("Store.PatchUpdate");
    store.on("Store.PatchUpdate", async () => {
      await store._delete(model.getUuid());
      await this.sleep(1);
    });
    await assert.rejects(
      () => store.setAttribute(model.getUuid(), "counter", 4),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );
    await assert.rejects(
      () => store.setAttribute(uuidv4(), "counter", 4),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );
  }

  @test
  async deleteAsync() {
    let store = this.getIdentStore();
    let model = await store.save({ counter: 1 });
    // Delete with condition
    await assert.rejects(() => store.delete(model.getUuid(), 4, "counter"), UpdateConditionFailError);
    await store.delete(model.getUuid(), 1, "counter");
    // Test without condition
    model = await store.save({ counter: 2 });
    await store.delete(model);

    // Deleting a non-existing object should be ignored
    await store.forceDelete(uuidv4());
  }

  @test
  async delete() {
    // UserStore is not supposed to be async
    let store = this.getUserStore();
    let model = await store.save({ counter: 1 });
    // Delete with condition
    await assert.rejects(() => store.delete(model.getUuid(), 4, "counter"), UpdateConditionFailError);

    await store.delete(model.getUuid(), 1, "counter");
    // Test without condition
    model = await store.save({ counter: 2 });
    await store.delete(model);

    // Deleting a non-existing object should be ignored
    await store.forceDelete(uuidv4());
  }

  async deleteConcurrent() {
    let store = this.getUserStore();
    let model = await store.save({ counter: 1 });
    store.addListener("Store.Delete", async () => {
      await store.incrementAttribute(model.getUuid(), "counter", 1);
    });
    await assert.rejects(() => store.delete(model.getUuid(), 1, "counter"), UpdateConditionFailError);
    store.removeAllListeners();
    await store.delete(model.getUuid(), 2, "counter");
  }

  @test
  async update() {
    let store = this.getIdentStore();
    let model = await store.save({ counter: 1 });
    let model2 = await store.get(model.getUuid());
    store.on("Store.Update", async () => {
      model2._lastUpdate = new Date();
      await store._update(model2, model2.getUuid());
      await this.sleep(1);
    });
    model.plop = "yop";
    // Delete with condition
    await assert.rejects(() => store.update(model), UpdateConditionFailError);
    store.removeAllListeners("Store.Update");
    store.on("Store.Update", async () => {
      await store._delete(model.getUuid());
      await this.sleep(1);
    });
    await assert.rejects(
      () => store.update(model),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );
    await assert.rejects(
      () => store.update({ uuid: uuidv4(), test: true }),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );
  }

  @test
  async upsertItem() {
    let store = this.getIdentStore();
    this.log("DEBUG", "Save empty logs array");
    let model = await store.save({ logs: [] });
    let ps = [];
    this.log("DEBUG", "Upsert 10 lines");
    for (let i = 0; i < 10; i++) {
      ps.push(store.upsertItemToCollection(model.getUuid(), "logs", `line${i}`));
    }
    await Promise.all(ps);
    await model.refresh();
    assert.strictEqual(model.logs.length, 10);
    // Depending on the implementation it can be swallowed by the backend
    this.log("DEBUG", "Upsert on unknown doc");
    await assert.rejects(
      () => store.upsertItemToCollection(uuidv4(), "logs", `line`),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );

    this.log("DEBUG", "Delete on unknown doc");
    await assert.rejects(
      () => store.deleteItemFromCollection(uuidv4(), "logs", 0, undefined, undefined),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );
  }
}

export { StoreTest };
