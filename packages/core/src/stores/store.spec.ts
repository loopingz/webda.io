import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { stub } from "sinon";
import { v4 as uuidv4 } from "uuid";
import { Ident } from "../../test/models/ident";
import { OperationContext, Store, StoreParameters, User } from "../index";
import { CoreModel } from "../models/coremodel";
import { WebdaTest } from "../test";
import { HttpContext } from "../utils/httpcontext";
import { StoreEvents, StoreNotFoundError, UpdateConditionFailError } from "./store";

/**
 * Fake model that refuse the half of the items
 */
export class PermissionModel extends CoreModel {
  order: number;
  async canAct(ctx: OperationContext, _action: string): Promise<this> {
    if (this.order % 200 < 120) {
      throw 403;
    }
    return this;
  }
}
@suite
class StoreParametersTest {
  @test
  cov() {
    let params = new StoreParameters({ expose: "/plop", lastUpdateField: "bz", creationDateField: "c" }, undefined);
    assert.deepStrictEqual(params.expose, { queryMethod: "GET", url: "/plop", restrict: {} });
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
    return Ident;
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
      "team.id <= 14": 750,
      'state IN ["CA", "NY"]': 500,
      'state IN ["CA", "NY", "NV"]': 500,
      'state = "CA" AND team.id > 15': 50,
      "team.id < 5 OR team.id > 15": 450,
      "role < 5 AND team.id > 10 OR team.id > 15": 400,
      "role < 5 AND (team.id > 10 OR team.id > 15)": 200,
      'state LIKE "C_"': 250,
      'state LIKE "C__"': 0,
      'state LIKE "C%"': 250,
      'state != "CA"': 750,
      "": 1000
    };
    for (let i in queries) {
      assert.strictEqual(
        (await userStore.query(i)).results.length,
        queries[i],
        `Query: ${i} should return ${queries[i]}`
      );
    }
    // Verify pagination system
    let offset;
    let res;
    let i = 0;
    do {
      res = await userStore.query(`LIMIT 100 ${offset ? 'OFFSET "' + offset + '"' : ""}`);
      offset = res.continuationToken;

      if (i++ > 9) {
        assert.strictEqual(
          res.results.length,
          0,
          `Query: LIMIT 100 ${offset ? 'OFFSET "' + offset + '"' : ""} should return 0`
        );
        assert.strictEqual(offset, undefined);
      } else {
        assert.strictEqual(
          res.results.length,
          100,
          `Query: LIMIT 100 ${offset ? 'OFFSET "' + offset + '"' : ""} should return 0`
        );
      }
    } while (offset !== undefined);

    // Verify permission issue and half pagination
    userStore.setModel(PermissionModel);
    userStore.getParameters().forceModel = true;
    if (userStore._cacheStore) {
      userStore._cacheStore.getParameters().forceModel = true;
    }
    let context = await this.newContext();
    // Verify pagination system
    i = 0;
    let total = 0;
    let q;
    // To ensure we trigger slowQuery
    userStore.getParameters().slowQueryThreshold = 0;
    do {
      q = `LIMIT 100 ${offset ? 'OFFSET "' + offset + '"' : ""}`;
      context.setHttpContext(
        new HttpContext(
          "test.webda.io",
          i++ % 2 ? "GET" : "PUT",
          userStore.getParameters().expose.url + "?q=" + encodeURI(q),
          "https",
          443
        )
      );
      context.getHttpContext().setBody({ q });
      context.getParameters().q = q;
      // @ts-ignore
      await userStore.httpQuery(context);
      res = JSON.parse(<string>context.getResponseBody());
      offset = res.continuationToken;
      total += res.results.length;
    } while (offset !== undefined);
    assert.strictEqual(total, 400);
    q = "BAD QUERY !";
    context.setHttpContext(new HttpContext("test.webda.io", "PUT", userStore.getParameters().expose.url, "https", 443));
    context.getHttpContext().setBody({ q });
    // @ts-ignore
    await assert.rejects(() => userStore.httpQuery(context), /400/);
    let mock = stub(userStore, "query").callsFake(() => {
      throw new Error("Plop");
    });
    try {
      // @ts-ignore
      await assert.rejects(() => userStore.httpQuery(context), /Plop/);
    } finally {
      mock.restore();
    }
    return userStore;
  }

  /**
   * Simplify model
   * @param model
   * @returns
   */
  mapQueryModel(model: any) {
    return {
      order: model.order,
      teamId: model.team.id,
      state: model.state
    };
  }

  @test
  async queryOrder() {
    let userStore = await this.fillForQuery();
    let model = await userStore.save({
      order: 996,
      state: "CA",
      team: { id: 16 }
    });
    try {
      let res = await userStore.query('state = "CA" ORDER BY order DESC LIMIT 10');
      assert.deepStrictEqual(
        res.results.map((c: any) => ({ state: c.state, order: c.order, teamId: c.team.id })),
        [
          { state: "CA", order: 996, teamId: 16 },
          { state: "CA", order: 996, teamId: 16 },
          { state: "CA", order: 992, teamId: 12 },
          { state: "CA", order: 988, teamId: 8 },
          { state: "CA", order: 984, teamId: 4 },
          { state: "CA", order: 980, teamId: 0 },
          { state: "CA", order: 976, teamId: 16 },
          { state: "CA", order: 972, teamId: 12 },
          { state: "CA", order: 968, teamId: 8 },
          { state: "CA", order: 964, teamId: 4 }
        ]
      );
      res = await userStore.query("order > 980 ORDER BY state ASC, order DESC LIMIT 10");
      assert.deepStrictEqual(
        res.results.map((c: any) => ({ state: c.state, order: c.order, teamId: c.team.id })),
        [
          { state: "CA", order: 996, teamId: 16 },
          { state: "CA", order: 996, teamId: 16 },
          { state: "CA", order: 992, teamId: 12 },
          { state: "CA", order: 988, teamId: 8 },
          { state: "CA", order: 984, teamId: 4 },
          { state: "FL", order: 999, teamId: 19 },
          { state: "FL", order: 995, teamId: 15 },
          { state: "FL", order: 991, teamId: 11 },
          { state: "FL", order: 987, teamId: 7 },
          { state: "FL", order: 983, teamId: 3 }
        ]
      );
    } finally {
      await model.delete();
    }
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
    // Ensure Date is returned
    assert.ok(ident2._creationDate instanceof Date);
    assert.ok(ident2._lastUpdate instanceof Date);

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
    let res = await identStore.patch(
      {
        uuid: ident2.uuid,
        type: "google2"
      },
      true,
      null
    );
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
    await identStore.incrementAttributes(ident1.uuid, [
      { property: "counter", value: -6 },
      { property: "counter2", value: 10 }
    ]);
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
      model._lastUpdate = new Date(100);
      // @ts-ignore
      await store._update(model, model.getUuid());
    });
    await assert.rejects(() => store.setAttribute(model.getUuid(), "counter", 4), UpdateConditionFailError);
    store.removeAllListeners("Store.PatchUpdate");
    store.on("Store.PatchUpdate", async () => {
      // @ts-ignore
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
  async conditionUpdate() {
    let store = this.getIdentStore();
    let model = await store.save({ counter: 1 });
    assert.ok(
      await store.conditionalPatch(
        model.getUuid(),
        {
          plop: 12,
          counter: 2
        },
        "counter",
        1
      )
    );
    assert.strictEqual((await store.get(model.getUuid())).plop, 12);
    assert.ok(
      !(await store.conditionalPatch(
        model.getUuid(),
        {
          plop: 13
        },
        "counter",
        1
      ))
    );
    assert.strictEqual((await store.get(model.getUuid())).plop, 12);
    // @ts-ignore
    stub(store, "_patch").callsFake(() => {
      throw new Error("Fake Error");
    });
    await assert.rejects(
      () =>
        store.conditionalPatch(
          model.getUuid(),
          {
            plop: 12,
            counter: 2
          },
          "counter",
          1
        ),
      /Fake Error/
    );
  }

  @test
  async update(delay: number = 1) {
    let store = this.getIdentStore();
    let model = await store.save({ counter: 1 });
    model.saveUpdateCompat = true;
    await store.save(model, await this.newContext());
    model.saveInnerMethod = true;
    model.setContext(await this.newContext());
    await model.save();
    let model2 = await store.get(model.getUuid());
    store.on("Store.Update", async () => {
      model2._lastUpdate = new Date(100);
      // @ts-ignore
      await store._update(model2, model2.getUuid());
    });
    model.plop = "yop";
    // Delete with condition
    await assert.rejects(() => store.update(model), UpdateConditionFailError);
    store.removeAllListeners("Store.Update");
    store.on("Store.Update", async () => {
      // @ts-ignore
      await store._delete(model.getUuid());
      await this.sleep(delay);
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

  @test
  async put() {
    const store = this.getIdentStore();
    const uuid = store.getWebda().getUuid();
    if (await store.exists(uuid)) {
      await store.delete(uuid);
    }
    await store.put(uuid, { test: true });
    // Verify put acts like a upsert
    await store.put(uuid, { test: false });
  }

  async httpCRUD(url: string = "/users") {
    let eventFired;
    let userStore: Store<User> = this.getUserStore();
    let ctx, executor;
    await userStore.__clean();
    ctx = await this.newContext({});
    ctx.session.login("fake_user", "fake_ident");
    executor = this.getExecutor(ctx, "test.webda.io", "POST", url, {
      type: "CRUD",
      uuid: "PLOP",
      displayName: "Coucou"
    });
    assert.notStrictEqual(executor, undefined);
    await executor.execute(ctx);
    ctx.body = undefined;
    assert.strictEqual((await userStore.getAll()).length, 1);
    await this.getExecutor(ctx, "test.webda.io", "GET", `${url}/PLOP`).execute(ctx);
    assert.notStrictEqual(ctx.getResponseBody(), undefined);
    assert.strictEqual(ctx.getResponseBody().indexOf("_lastUpdate") >= 0, true);
    executor = this.getExecutor(ctx, "test.webda.io", "POST", url, {
      type: "CRUD2",
      uuid: "PLOP",
      displayName: "Coucou 2"
    });
    await assert.rejects(executor.execute(ctx), err => err == 409);
    // Verify the none overide of UUID
    await this.execute(ctx, "test.webda.io", "PUT", `${url}/PLOP`, {
      type: "CRUD2",
      additional: "field",
      uuid: "PLOP2",
      user: "fake_user",
      displayName: "Coucou 3"
    });
    let user: any = await userStore.get("PLOP");
    assert.strictEqual(user.uuid, "PLOP");
    assert.strictEqual(user.type, "CRUD2");
    assert.strictEqual(user.additional, "field");
    assert.strictEqual(user.user, "fake_user");
    assert.strictEqual(user._user, "fake_user");

    // Add a role to the user
    user.addRole("plop");
    await user.save();

    user = await userStore.get("PLOP");
    assert.deepStrictEqual(user.getRoles(), ["plop"]);

    ctx.resetResponse();
    // Check PATH
    await this.execute(ctx, "test.webda.io", "PATCH", `${url}/PLOP`, {
      type: "CRUD3",
      uuid: "PLOP2",
      _testor: "_ should not be update by client"
    });
    user = await userStore.get("PLOP");
    assert.strictEqual(user.uuid, "PLOP");
    assert.strictEqual(user.type, "CRUD3");
    assert.strictEqual(user.additional, "field");
    assert.strictEqual(user._testor, undefined);
    assert.strictEqual(user._user, "fake_user");
    assert.deepStrictEqual(user.getRoles(), ["plop"]);

    executor = this.getExecutor(ctx, "test.webda.io", "PUT", `${url}/PLOP`, {
      type: "CRUD3",
      uuid: "PLOP2",
      _testor: "_ should not be update by client",
      displayName: "yep"
    });
    await executor.execute(ctx);
    user = await userStore.get("PLOP");
    assert.strictEqual(user.uuid, "PLOP");
    assert.strictEqual(user.type, "CRUD3");
    assert.strictEqual(user.additional, undefined);
    assert.strictEqual(user._testor, undefined);
    assert.deepStrictEqual(user.getRoles(), ["plop"]);

    await this.getExecutor(ctx, "test.webda.io", "DELETE", `${url}/PLOP`).execute(ctx);
    eventFired = 0;
    executor = this.getExecutor(ctx, "test.webda.io", "GET", `${url}/PLOP`);
    await assert.rejects(
      () => executor.execute(ctx),
      err => err == 404
    );
    eventFired++;
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", `${url}/PLOP`);
    await assert.rejects(
      () => executor.execute(ctx),
      err => err == 404
    );
    eventFired++;
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", `${url}/PLOP`);
    await assert.rejects(
      () => executor.execute(ctx),
      err => err == 404
    );
    eventFired++;
    assert.strictEqual(eventFired, 3);
  }

  async modelActions(url = "/idents") {
    let identStore: Store<CoreModel> = this.getIdentStore();
    assert.notStrictEqual(identStore.getModel(), undefined);
    let eventFired = 0;
    let executor, ctx;
    identStore.on("Store.Action", evt => {
      eventFired++;
    });
    identStore.on("Store.Actioned", evt => {
      eventFired++;
    });
    ctx = await this.newContext({
      type: "CRUD",
      uuid: "PLOP"
    });
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", `${url}/coucou/plop`);
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(executor.execute(ctx), err => err == 404);
    await identStore.save({
      uuid: "coucou"
    });
    await executor.execute(ctx);
    // Our fake action is pushing true to _plop
    assert.strictEqual(JSON.parse(ctx.getResponseBody())._plop, true);
    assert.strictEqual(eventFired, 2);

    try {
      identStore._model.prototype.plop = identStore._model.prototype._plop;
      identStore._model.prototype._plop = undefined;
      await executor.execute(ctx);
    } finally {
      identStore._model.prototype._plop = identStore._model.prototype.plop;
    }

    assert.notStrictEqual(this.getExecutor(ctx, "test.webda.io", "POST", `${url}/coucou/yop`), null);
    executor = this.getExecutor(ctx, "test.webda.io", "GET", `${url}/coucou/yop`);
    assert.notStrictEqual(executor, null);

    // Test with action returning the result instead of writing it
    ctx.resetResponse();
    await executor.execute(ctx);
    assert.strictEqual(ctx.getResponseBody(), "youpi");
  }
}

export { StoreTest };
