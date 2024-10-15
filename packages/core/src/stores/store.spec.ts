import { suite, test } from "@webda/test";
import * as assert from "assert";
import { stub } from "sinon";
import { randomUUID } from "crypto";
import { TestIdent } from "../test/objects";
import { getUuid, Ident, OperationContext, Store, User } from "../index";
import { CoreModel, CoreModelAny } from "../models/coremodel";
import { ModelDefinition } from "../application/iapplication";
import { WebdaApplicationTest } from "../test/test";
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

/**
 * Use a custom model for the test
 */
export class UserTest extends User {
  uuid: string;
  name: string;
  counter: number;
  idents: any[];
}

export class IdentTest extends Ident {
  counter: number;
  counter2: number;
  counter3: number;
  status: string;
  bouzouf: string;
  test: string;
  details: {
    plop: string;
    clean: string;
    yop: string;
    blank: string;
    bouzouf: string;
  };
  empty: any[];
  cool: string;
  lastUsed: Date;
  arr: any[];
  plop: number;
  logs: any[];
  saveUpdateCompat: boolean;
  saveInnerMethod: boolean;
}

class TypeTest extends CoreModel {
  type: "ATTR" | "COLLECTION";
  counter: number;
}

TypeTest.ref("").setAttribute("type", "ATTR");
const t = new TypeTest();
t.setAttribute("counter", 12);

abstract class StoreTest<T extends Store<any>> extends WebdaApplicationTest {
  abstract getIdentStore(): Promise<T>;
  abstract getUserStore(): Promise<T>;

  protected userStore: T;
  protected identStore: T;

  async beforeEach() {
    await super.beforeEach();
    this.userStore = await this.getUserStore();
    this.identStore = await this.getIdentStore();
    this.userStore["setModelDefinitionHelper"](UserTest);
    this.userStore["setModelDefinitionHelper"](IdentTest);
    // ensure service are registered
    this.registerService(this.userStore);
    this.registerService(this.identStore);
    await this.userStore?.__clean();
    await this.identStore?.__clean();

    this.getIdentStore = () => {
      throw new Error("Use this.identStore instead");
    };
    this.getUserStore = () => {
      throw new Error("Use this.userStore instead");
    };
  }

  getModelClass(): ModelDefinition {
    return TestIdent;
  }

  /**
   * Get the base of documents to query
   */
  getQueryDocuments(): any[] {
    const docs = [];
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
  async fillForQuery(): Promise<
    ModelDefinition<
      CoreModelAny<{
        state: string;
        team: {
          id: number;
        };
        role: number;
        order: number;
      }>
    >
  > {
    User.prototype.canAct = async () => true;
    //this.webda.getApplication().getModel("Webda/User").prototype.canAct = async () => true;
    //userStore._model.prototype.canAct = async () => true;
    await Promise.all(this.getQueryDocuments().map(d => User.create(d)));
    return User;
  }

  @test
  async query() {
    const userStore = await this.fillForQuery();

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
    for (const i in queries) {
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
    const userStore = await this.fillForQuery();
    const model = await userStore.create({
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
  async collection() {
    const Ident: ModelDefinition<CoreModelAny> = this.getModelClass();
    let ident = await Ident.create(<any>{
      test: "plop"
    });
    await ident.upsertItemToCollection(ident.uuid, "actions", {
      uuid: "action_1",
      type: "plop",
      date: new Date()
    });
    await ident.refresh();
    assert.notStrictEqual(ident.actions, undefined);
    assert.strictEqual(ident.actions.length, 1);
    await ident.upsertItemToCollection(ident.uuid, "actions", {
      uuid: "action_2",
      type: "plop",
      date: new Date()
    });
    await ident.refresh();
    assert.notStrictEqual(ident.actions, undefined);
    assert.strictEqual(ident.actions.length, 2);
    await ident.upsertItemToCollection(
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
        ident.upsertItemToCollection(
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
      () => ident.deleteItemFromCollection(ident.uuid, "actions", 0, "action_2"),
      err => true
    );
    await ident.refresh();
    assert.strictEqual(ident.actions.length, 2);
    assert.strictEqual(ident.actions[0].type, "plop2");
    let lastUpdate = ident._lastUpdate;
    await this.sleep(10);
    await ident.upsertItemToCollection(
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
    await ident.deleteItemFromCollection(ident.uuid, "actions", 0, "plop", "type");
    ident = await ident.get(ident.uuid);
    this.assertLastUpdateNotEqual(ident._lastUpdate, lastUpdate, "lastUpdate after deleteItemToColletion failed");
    assert.notStrictEqual(ident.actions, undefined);
    assert.strictEqual(ident.actions.length, 1);
    assert.strictEqual(ident.actions[0].type, "plop");
    assert.strictEqual(ident.actions[0].uuid, "action_2");
  }

  @test
  async getAll() {
    const userStore = this.userStore;
    const user1 = await UserTest.create({
      name: "test1"
    });
    await UserTest.create({
      name: "test2"
    });
    const user3 = await UserTest.create({
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
    const identStore = this.identStore;
    const Ident = this.getModelClass();
    let eventFired = 0;
    const events: (keyof StoreEvents)[] = [
      "Store.Created",
      "Store.Deleted",
      "Store.Updated",
      "Store.PatchUpdated",
      "Store.PartialUpdated"
    ];
    for (const evt in events) {
      identStore.on(events[evt], e => {
        eventFired++;
      });
    }
    this.log("DEBUG", "Save ident");
    // Check CREATE - READ
    let ident1 = await IdentTest.create(<any>{
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
    let getter = await IdentTest.ref(ident1.uuid).get();
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
    this.log("DEBUG", "Update ident");
    await getter.save();
    assert.strictEqual(eventFired, 2);
    eventFired = 0;
    this.log("DEBUG", "Patch ident");
    await ident1.patch({
      bouzouf: "test"
    });
    assert.strictEqual(eventFired, 2);
    eventFired = 0;
    this.log("DEBUG", "Get ident to check update");
    const object = await IdentTest.ref(ident1.uuid).get();
    this.log("DEBUG", "Retrieved object", object);
    assert.strictEqual(object.test, "plop2");
    assert.strictEqual(object.details.plop, "plop2");
    getter = await identStore.get(object.uuid);
    assert.strictEqual(eventFired, 2);
    assert.strictEqual(getter.test, "plop2");
    await this.sleep(10);
    this.log("DEBUG", "Increment attribute");
    await IdentTest.ref(ident1.uuid).incrementAttribute("counter", 1);
    let ident = await identStore.get(ident1.uuid);

    // Verify lastUpdate is updated too
    this.assertLastUpdateNotEqual(ident._lastUpdate, ident1._lastUpdate, "lastUpdate after incrementAttribute failed");
    assert.strictEqual(ident.counter, 1);
    await IdentTest.ref(ident1.uuid).incrementAttribute("counter", 3);
    ident1 = await identStore.get(ident1.uuid);
    assert.strictEqual(ident1.counter, 4);
    await identStore.incrementAttributes(ident1.uuid, [
      { property: "counter", value: -6 },
      { property: "counter2", value: 10 }
    ]);
    let res = await IdentTest.ref(ident1.uuid).exists();
    assert.strictEqual(res, true);
    ident1 = await IdentTest.ref(ident1.uuid).get();
    assert.strictEqual(ident1.counter, -2);

    // Check DELETE
    eventFired = 0;
    await ident1.delete();
    assert.strictEqual(eventFired, 2);
    eventFired = 0;
    ident = await IdentTest.ref(ident1.uuid).get();
    assert.strictEqual(ident, undefined);
    res = await IdentTest.ref(ident1.uuid).exists();
    assert.strictEqual(res, false);
  }
  assertLastUpdateNotEqual(d1, d2, msg) {
    assert.notStrictEqual(d1, d2, msg);
  }

  @test
  async exists() {
    const model = await IdentTest.create({});
    assert.ok(await IdentTest.ref(model.getUuid()).exists());
    assert.ok(!(await IdentTest.ref(randomUUID()).exists()));
  }

  @test
  async incrementAttribute() {
    const model = await IdentTest.create({ counter: 0 });
    await model.incrementAttribute("counter", 3);
    await model.incrementAttribute("counter2", 2);
    await model.refresh();
    assert.strictEqual(model.counter, 3);
    assert.strictEqual(model.counter2, 2);
    await assert.rejects(() => IdentTest.ref(randomUUID()).incrementAttribute("counter", 1), StoreNotFoundError);
  }

  @test
  async removeAttribute() {
    const uuid = "test";
    const model = await IdentTest.create({ uuid, counter: 0, counter2: 12, counter3: 13 });
    await model.removeAttribute("counter");
    await model.refresh();
    assert.strictEqual(model.counter, undefined);
    await assert.rejects(() => IdentTest.ref(randomUUID()).removeAttribute("counter"), StoreNotFoundError);
    await assert.rejects(() => model.removeAttribute("counter2", "counter3", 10), UpdateConditionFailError);
    await model.refresh();
    assert.strictEqual(model.counter2, 12);
  }

  @test
  async setAttribute() {
    const model = await IdentTest.create({ counter: 0 });
    await model.setAttribute("counter", 3);
    await model.setAttribute("status", "TESTED");
    await model.refresh();
    assert.strictEqual(model.counter, 3);
    assert.strictEqual(model.status, "TESTED");
    await assert.rejects(() => IdentTest.ref(randomUUID()).setAttribute("counter", 4), StoreNotFoundError);
    await IdentTest["Store"].patch(model.getUuid(), { _lastUpdate: new Date(100) });
    await assert.rejects(() => IdentTest.ref(model.getUuid()).setAttribute("counter", 4), UpdateConditionFailError);
    await IdentTest["Store"].delete(model.getUuid());
    await assert.rejects(
      () => model.setAttribute("counter", 4),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );
    await assert.rejects(
      () => IdentTest.ref(randomUUID()).setAttribute("counter", 4),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );
  }

  @test
  async deleteAsync() {
    const store = this.identStore;
    let model = await IdentTest.create({ counter: 1 });
    // Delete with condition
    await assert.rejects(() => IdentTest.ref(model.getUuid()).delete("counter", 4), UpdateConditionFailError);
    await model.delete("counter", 1);
    // Test without condition
    model = await IdentTest.create({ counter: 2 });
    await model.delete();

    // Deleting a non-existing object should be ignored
    await IdentTest.ref(randomUUID()).delete();
  }

  @test
  async delete() {
    // UserStore is not supposed to be async
    const store = this.userStore;
    let model = await UserTest.create({ counter: 1 });
    // Delete with condition
    await assert.rejects(() => store.delete(model.getUuid(), 4, "counter"), UpdateConditionFailError);

    await model.delete("counter", 1);
    // Test without condition
    model = await UserTest.create({ counter: 2 });
    await model.delete();

    // Deleting a non-existing object should be ignored
    await store.delete(randomUUID());
  }

  async deleteConcurrent() {
    const model = await UserTest.create({ counter: 1 });
    await model.incrementAttribute("counter");
    await assert.rejects(() => model.delete("counter", 1), UpdateConditionFailError);
    await model.delete("counter", 2);
  }

  @test
  async conditionUpdate() {
    const model = await IdentTest.create({ counter: 1 });
    const ref = model.getRef();
    assert.ok(
      await model.patch(
        {
          plop: 12,
          counter: 2
        },
        "counter",
        1
      )
    );
    assert.strictEqual((await ref.get()).plop, 12);
    // Might want to check exception
    await model.patch(
      {
        plop: 13
      },
      "counter",
      1
    );
    assert.strictEqual((await ref.get()).plop, 12);
    // @ts-ignore
    stub(UserTest.store(), "_patch").callsFake(() => {
      throw new Error("Fake Error");
    });
    await assert.rejects(
      () =>
        model.patch(
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
    const model = await IdentTest.create({ counter: 1 });
    model.saveUpdateCompat = true;

    await model.save();
    model.saveInnerMethod = true;
    await model.save();
    await IdentTest.ref(model.getUuid()).setAttribute("_lastUpdate", new Date(100));
    model.test = "yop";
    // Delete with condition
    await assert.rejects(() => model.save(), UpdateConditionFailError);
    await model.delete();
    await assert.rejects(
      () => model.save(),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );
    await assert.rejects(
      () => IdentTest.ref(randomUUID()).patch({ test: "plop" }),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );
  }

  @test
  async upsertItem() {
    this.log("DEBUG", "Save empty logs array");
    const model = await IdentTest.create({ logs: [] });
    const ps = [];
    this.log("DEBUG", "Upsert 10 lines");
    for (let i = 0; i < 10; i++) {
      ps.push(model.upsertItemToCollection("logs", `line${i}`));
    }
    await Promise.all(ps);
    await model.refresh();
    assert.strictEqual(model.logs.length, 10);
    // Depending on the implementation it can be swallowed by the backend
    this.log("DEBUG", "Upsert on unknown doc");
    await assert.rejects(
      () => IdentTest.ref(randomUUID()).upsertItemToCollection("logs", `line`),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );

    this.log("DEBUG", "Delete on unknown doc");
    await assert.rejects(
      () => IdentTest.ref(randomUUID()).deleteItemFromCollection("logs", 0, undefined, undefined),
      err => err instanceof StoreNotFoundError || err instanceof UpdateConditionFailError
    );
  }

  @test
  async upsert() {
    const ref = IdentTest.ref(getUuid());
    if (await ref.exists()) {
      await ref.delete();
    }
    await ref.upsert({ test: "true" });
    await ref.upsert({ test: "false" });
  }
}

export { StoreTest };
