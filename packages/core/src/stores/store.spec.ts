import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { stub } from "sinon";
import { randomUUID } from "crypto";
import { Ident } from "../test";
import {
  AggregatorService,
  HttpContext,
  MapperService,
  OperationContext,
  Store,
  StoreParameters,
  User,
  WebdaError
} from "../index";
import { CoreModel, CoreModelDefinition } from "../models/coremodel";
import { WebdaSimpleTest, WebdaTest } from "../test";
import { StoreEvents, StoreNotFoundError, UpdateConditionFailError } from "./store";

/**
 * Fake model that refuse the half of the items
 */
export class PermissionModel extends CoreModel {
  order: number;
  async canAct(ctx: OperationContext, _action: string): Promise<string | boolean> {
    if (this.order % 200 < 120) {
      return false;
    }
    return true;
  }
}
abstract class StoreTest extends WebdaSimpleTest {
  abstract getIdentStore(): Store<any>;
  abstract getUserStore(): Store<any>;

  async before() {
    await super.before();
    const userStore = this.getUserStore();
    const identStore = this.getIdentStore();
    this.registerService(await userStore.resolve().init());
    this.registerService(await identStore.resolve().init());

    await this.getUserStore()?.__clean();
    await this.getIdentStore()?.__clean();
  }

  getModelClass(): CoreModelDefinition {
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
        states: [["CA", "OR", "NY", "FL"][i % 4], ["CA", "OR", "NY", "FL"][(i + 1) % 4]],
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
    this.webda.getApplication().getModel("Webda/User").prototype.canAct = async () => true;
    userStore._model.prototype.canAct = async () => true;
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
      'states CONTAINS "CA"': 500,
      "role = 4": 100,
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

    /*
    // Add a REST Service here
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
      q = `team.id > 10 LIMIT 100 ${offset ? 'OFFSET "' + offset + '"' : ""}`;
      context.setHttpContext(
        new HttpContext("test.webda.io", i++ % 2 ? "GET" : "PUT", "/users?q=" + encodeURI(q), "https", 443)
      );
      context.getHttpContext().setBody({ q });
      context.getParameters().q = q;
      // @ts-ignore
      await userStore.httpQuery(context);
      res = JSON.parse(<string>context.getResponseBody());
      offset = res.continuationToken;
      total += res.results.length;
    } while (offset !== undefined);
    assert.strictEqual(total, 180);
    q = "BAD QUERY !";
    context.setHttpContext(new HttpContext("test.webda.io", "PUT", "/users", "https", 443));
    context.getHttpContext().setBody({ q });
    await assert.rejects(
      () => userStore["httpQuery"](context),
      (err: WebdaError.HttpError) => err.getResponseCode() === 400
    );
    let mock = stub(userStore, "query").callsFake(() => {
      throw new Error("Plop");
    });
    try {
      await assert.rejects(() => userStore["httpQuery"](context), /Plop/);
    } finally {
      mock.restore();
    }
    */
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
        res.results.map((c: any) => ({
          state: c.state,
          order: c.order,
          teamId: c.team.id
        })),
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
        res.results.map((c: any) => ({
          state: c.state,
          order: c.order,
          teamId: c.team.id
        })),
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
    // Create a mapper - keep the test here as it is a good test for stores
    let identStore = this.getIdentStore();
    let userStore = this.getUserStore();
    const mapper = await this.addService(
      MapperService,
      {
        source: identStore.getName(),
        targetAttribute: "idents",
        target: userStore.getName(),
        attribute: "_user",
        fields: ["type", "_lastUpdate"],
        cascade: true
      },
      "Mapper"
    );
    const indexer = await this.addService(AggregatorService, {
      source: identStore.getName(),
      key: "idents-index",
      fields: ["type"]
    });
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
    ).getUuid();
    let user = await userStore.get(user1);
    // Save a user and add an ident
    assert.notStrictEqual(user, undefined);
    user1 = user.getUuid();
    ident1 = await identStore.save({
      type: "facebook",
      _user: user.getUuid()
    });
    user = await userStore.get(user1);
    // Verify the ident is on the user
    assert.notStrictEqual(user, undefined);
    assert.notStrictEqual(user.idents, undefined);
    assert.strictEqual(user.idents.length, 1);
    // Retrieve index to verify it is in it too
    let index = await this.webda.getRegistry().get("idents-index");
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
    assert.strictEqual(res._user.toString(), user1);

    // Check index
    if (index) {
      await index.refresh();
      assert.strictEqual(index[ident2.uuid].type, "google2");
    }

    user = await userStore.get(user1);
    assert.strictEqual(user.idents.length, 2);
    assert.strictEqual(user.idents[1].type, "google2");
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
    assert.strictEqual(ident, undefined);

    // Check index
    if (index) {
      await index.refresh();
      assert.strictEqual(index[ident2.uuid], undefined);
      assert.strictEqual(index[ident1.uuid], undefined);
    }

    assert.strictEqual(eventFired, 8);
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
    users = await userStore.getAll([user1.uuid, user3.uuid, randomUUID()]);
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
    // We should be able to verify with the full model
    await identStore.exists(ident1);
    assert.strictEqual(res, true);
    ident1 = await identStore.get(ident1.uuid);
    assert.strictEqual(ident1.counter, -2);

    // Check DELETE
    eventFired = 0;
    await identStore.delete(ident1.uuid);
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
    assert.ok(await store.exists(model));
    assert.ok(!(await store.exists(randomUUID())));
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
    await assert.rejects(() => store.incrementAttribute(randomUUID(), "counter", 1), StoreNotFoundError);
  }

  @test
  async removeAttribute() {
    let store = this.getIdentStore();
    let model = await store.save({ counter: 0, counter2: 12, counter3: 13 });
    await store.removeAttribute(model.getUuid(), "counter");
    await model.refresh();
    assert.strictEqual(model.counter, undefined);
    await assert.rejects(() => store.removeAttribute(randomUUID(), "counter"), StoreNotFoundError);
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
    await assert.rejects(() => store.setAttribute(randomUUID(), "counter", 4), StoreNotFoundError);
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
      () => store.setAttribute(randomUUID(), "counter", 4),
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
    await store.delete(randomUUID());
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
    await store.delete(randomUUID());
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
      () => store.update({ uuid: randomUUID(), test: true }),
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
      () => store.upsertItemToCollection(randomUUID(), "logs", `line`),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );

    this.log("DEBUG", "Delete on unknown doc");
    await assert.rejects(
      () => store.deleteItemFromCollection(randomUUID(), "logs", 0, undefined, undefined),
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
}

export { StoreTest };
