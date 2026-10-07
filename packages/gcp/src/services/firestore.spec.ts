import { Firestore } from "@google-cloud/firestore";
import { EventRepository, StoreNotFoundError, UpdateConditionFailError, useModel } from "@webda/core";
import { checkCreateWithoutPrimaryKey, WebdaApplicationTest } from "@webda/core/lib/test";
import * as WebdaQL from "@webda/ql";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import FireStore, {
  FireStoreParameters,
  FireStoreRepository,
  giveDatesBack,
  toFirestore
} from "./firestore.service.js";

/**
 * Smoke tests for FireStore against the Firestore emulator
 *
 * The generic StoreTest harness is not usable from other packages yet (see the
 * PostgresStore spec), so the repository is exercised directly.
 */
@suite
class FireStoreTest extends WebdaApplicationTest {
  store: FireStore;
  repo: FireStoreRepository<any>;
  collection: string;

  async beforeEach() {
    await super.beforeEach();
    this.collection = `idents-${randomUUID()}`;
    this.store = this.createStore({ collection: this.collection, models: ["Webda/OwnerModel"] });
    this.repo = this.store.getRepositories()[0];
  }

  async afterEach() {
    vi.restoreAllMocks();
    const store = this.store;
    this.store = undefined;
    await store?.__clean();
    await store?.stop();
  }

  /**
   * Create and resolve a FireStore
   * @param params - store parameters
   * @returns the store
   */
  createStore(params: any): FireStore {
    return new FireStore("firestore", new FireStoreParameters().load({ strict: true, ...params })).resolve();
  }

  @test
  params() {
    const params = new FireStoreParameters().load({ collection: "test" });
    assert.deepStrictEqual(params.compoundIndexes, []);
    assert.deepStrictEqual(params.collections, {});
  }

  @test
  conversions() {
    const date = new Date();
    assert.deepStrictEqual(
      toFirestore({ a: undefined, b: () => {}, c: date, d: [{ toJSON: () => ({ e: 1 }) }], f: null, g: "g" }),
      { c: date, d: [{ e: 1 }], f: null, g: "g" }
    );
    assert.deepStrictEqual(giveDatesBack({ a: [1, "2"], b: { c: true } }), { a: [1, "2"], b: { c: true } });
  }

  @test
  resolveCollection() {
    const store = this.createStore({
      collection: "main",
      models: ["Webda/OwnerModel", "Webda/User"],
      collections: { "Webda/User": "people" }
    });
    assert.strictEqual(store.resolveCollection(useModel("Webda/OwnerModel")), "main");
    assert.strictEqual(store.resolveCollection(useModel("Webda/User")), "people");
    const store2 = this.createStore({ collection: "main", models: ["Webda/User", "Webda/OwnerModel"] });
    assert.strictEqual(store2.resolveCollection(useModel("Webda/OwnerModel")), "webda_ownermodel");
    assert.ok(store2.getRepository(useModel("Webda/OwnerModel")) instanceof EventRepository);
  }

  @test
  async createWithoutPrimaryKey() {
    // Check both the EventRepository returned by the store and the underlying FireStoreRepository
    const firestore: Firestore = this.store.firestore;
    await checkCreateWithoutPrimaryKey([this.store.getRepository(useModel("Webda/OwnerModel")), this.repo], {
      data: i => ({ email: `nokey${i}@webda.io` }),
      readStored: async key => {
        const snapshot = await firestore.doc(`${this.collection}/${key}`).get();
        return snapshot.exists ? snapshot.data() : undefined;
      }
    });
  }

  @test
  async crud() {
    const repo = this.repo;
    const ident = await repo.create({ uuid: "id1", email: "test@webda.io", _failedLogin: 1 });
    assert.strictEqual(ident.uuid, "id1");
    await assert.rejects(() => repo.create({ uuid: "id1" }), /Already exists: id1/);
    assert.strictEqual(await repo.exists("id1"), true);
    assert.strictEqual(await repo.exists("id2"), false);
    let res = await repo.get("id1");
    assert.strictEqual(res.email, "test@webda.io");
    await assert.rejects(() => repo.get("id2"), StoreNotFoundError);

    // Update with condition
    await repo.update({ uuid: "id1", email: "test2@webda.io", _failedLogin: 2 }, "_failedLogin", 1);
    await assert.rejects(
      () => repo.update({ uuid: "id1", email: "test3@webda.io" }, "_failedLogin", 1),
      UpdateConditionFailError
    );
    await assert.rejects(() => repo.update({ uuid: "id2", email: "test3@webda.io" }), StoreNotFoundError);
    res = await repo.get("id1");
    assert.strictEqual(res.email, "test2@webda.io");

    // Patch keeps other fields
    const lastUsed = new Date();
    await repo.patch("id1", { provider: "google", _lastUsed: lastUsed });
    res = await repo.get("id1");
    assert.strictEqual(res.provider, "google");
    assert.strictEqual(res.email, "test2@webda.io");
    assert.strictEqual(new Date(res._lastUsed).getTime(), lastUsed.getTime());
    // Date condition
    await repo.patch("id1", { provider: "github" }, "_lastUsed", lastUsed);
    await assert.rejects(
      () => repo.patch("id1", { provider: "x" }, "_lastUsed", new Date(0)),
      UpdateConditionFailError
    );

    // Remove attribute
    await repo.removeAttribute("id1", "provider");
    assert.strictEqual((await repo.get("id1")).provider, undefined);
    await assert.rejects(() => repo.removeAttribute("id2", "provider"), StoreNotFoundError);
    await assert.rejects(() => repo.removeAttribute("id1", "email", "_failedLogin", 12), UpdateConditionFailError);

    // Increment
    await repo.incrementAttributes("id1", [{ property: "_failedLogin", value: 3 }, "counter"]);
    await repo.incrementAttributes("id1", { counter: 2 });
    res = await repo.get("id1");
    assert.strictEqual(res._failedLogin, 5);
    assert.strictEqual(res.counter, 3);
    await assert.rejects(() => repo.incrementAttributes("id2", ["counter"]), StoreNotFoundError);

    // Delete with condition
    await assert.rejects(() => repo.delete("id1", "_failedLogin", 1), UpdateConditionFailError);
    await repo.delete("id1", "_failedLogin", 5);
    assert.strictEqual(await repo.exists("id1"), false);
    // Deleting a missing object is a no-op
    await repo.delete("id1");
  }

  @test
  async collections() {
    const repo = this.repo;
    await repo.create({ uuid: "id1" });
    await repo.upsertItemToCollection("id1", "items", { name: "a" });
    await repo.upsertItemToCollection("id1", "items", { name: "b" });
    await repo.upsertItemToCollection("id1", "items", { name: "c" }, 1, "name", "b");
    await assert.rejects(
      () => repo.upsertItemToCollection("id1", "items", { name: "d" }, 1, "name", "b"),
      UpdateConditionFailError
    );
    assert.deepStrictEqual((await repo.get("id1")).items, [{ name: "a" }, { name: "c" }]);
    await assert.rejects(() => repo.upsertItemToCollection("id2", "items", { name: "a" }), StoreNotFoundError);
    await assert.rejects(() => repo.upsertItemToCollection("id2", "items", { name: "a" }, 0), StoreNotFoundError);

    await assert.rejects(() => repo.deleteItemFromCollection("id1", "items", 0, "name", "z"), UpdateConditionFailError);
    await repo.deleteItemFromCollection("id1", "items", 0, "name", "a");
    // Out of range index is ignored
    await repo.deleteItemFromCollection("id1", "items", 10);
    assert.deepStrictEqual((await repo.get("id1")).items, [{ name: "c" }]);
    await assert.rejects(() => repo.deleteItemFromCollection("id2", "items", 0), StoreNotFoundError);

    // Other errors are not translated
    vi.spyOn(repo, "getDocumentRef").mockImplementation(
      () =>
        <any>{
          id: "id1",
          update: async () => {
            throw new Error("FAKE");
          }
        }
    );
    await assert.rejects(() => repo.upsertItemToCollection("id1", "items", {}), /FAKE/);
    await assert.rejects(() => repo.incrementAttributes("id1", ["counter"]), /FAKE/);
  }

  /**
   * Fill a query store
   * @returns the repository filled with 1000 documents
   */
  async fillForQuery(): Promise<FireStoreRepository<any>> {
    const store = this.createStore({
      collection: `query-${randomUUID()}`,
      models: ["Webda/OwnerModel"],
      compoundIndexes: [{ state: "asc", "team.id": "asc" }]
    });
    const repo = store.getRepositories()[0];
    const firestore: Firestore = store.firestore;
    const batch = firestore.batch();
    for (let i = 0; i < 1000; i++) {
      batch.set(firestore.doc(`${repo.getCollection()}/q${i}`), {
        uuid: `q${i}`,
        state: ["CA", "OR", "NY", "FL"][i % 4],
        states: [["CA", "OR", "NY", "FL"][i % 4], ["CA", "OR", "NY", "FL"][(i + 1) % 4]],
        order: i,
        team: {
          id: i % 20
        },
        role: i % 10
      });
    }
    await batch.commit();
    // Ensure the store is cleaned with the test
    const previous = this.store;
    this.store = store;
    await previous.__clean();
    await previous.stop();
    return repo;
  }

  /**
   * Find helper
   * @param repo - the repository
   * @param query - the WebdaQL query
   * @returns the find result
   */
  find(repo: FireStoreRepository<any>, query: string) {
    return repo.find(WebdaQL.parse(query));
  }

  @test
  async queryIsNull() {
    const repo: any = this.repo;
    // A null field, a missing field and a value, written raw
    for (const data of [{ uuid: "null", email: null }, { uuid: "missing" }, { uuid: "set", email: "set@webda.io" }]) {
      await repo.firestore.collection(repo.collection).doc(data.uuid).set(data);
    }
    const uuids = (res: any) => res.results.map((r: any) => r.uuid).sort();
    // Firestore `== null` misses absent fields: IS NULL is filtered in memory
    let res = await this.find(repo, "email IS NULL");
    assert.notStrictEqual(res.filter, true);
    assert.deepStrictEqual(uuids(res), ["missing", "null"]);
    // IS NOT NULL maps natively to `!= null`
    res = await this.find(repo, "email IS NOT NULL");
    assert.strictEqual(res.filter, true);
    assert.deepStrictEqual(uuids(res), ["set"]);
    assert.deepStrictEqual(uuids(await repo.query("email IS NULL AND uuid = 'null'")), ["null"]);
  }

  @test
  async query() {
    const repo = await this.fillForQuery();
    let res = await this.find(repo, 'state = "CA" AND role = 4 LIMIT 1000');
    assert.strictEqual(res.filter, true, `Should not have any post filter ${res.filter.toString()}`);
    assert.strictEqual(res.results.length, 50);
    res = await this.find(repo, 'state = "CA" AND team.id < 5 LIMIT 1000');
    assert.strictEqual(res.filter, true, `Should not have post filter ${res.filter.toString()}`);
    assert.strictEqual(res.results.length, 100);
    res = await this.find(repo, 'state = "CA" AND team.id < 5 AND role >= 4 LIMIT 1000');
    assert.notStrictEqual(res.filter, true, "Should have post filter");
    assert.strictEqual(res.results.length, 50);
    res = await this.find(repo, 'state = "CA" AND role <= 4 LIMIT 1000');
    assert.notStrictEqual(res.filter, true, "Should have post filter");
    assert.strictEqual(res.results.length, 150);
    const items = ["CA", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    res = await this.find(repo, `state IN [${items.map(i => `"${i}"`).join(",")}] LIMIT 1000`);
    // Should be post filtered
    assert.notStrictEqual(res.filter, true);
    assert.strictEqual(res.results.length, 250);
    res = await this.find(repo, `state IN ["CA", "OR"] AND team.id IN [4,8] LIMIT 1000`);
    assert.strictEqual(res.results.length, 100);
    // Range on two attributes: the second one is post filtered
    res = await this.find(repo, `team.id < 5 AND state > "CA" LIMIT 1000`);
    assert.notStrictEqual(res.filter, true);
    assert.strictEqual(res.results.length, 150);
    res = await this.find(repo, `state LIKE "C%" OR role = 1 LIMIT 1000`);
    assert.notStrictEqual(res.filter, true);
    res = await this.find(repo, `state LIKE "C%" AND role = 1 LIMIT 1000`);
    assert.notStrictEqual(res.filter, true);
    assert.strictEqual(res.results.length, 0);
    // Test double CONTAINS
    res = await this.find(repo, 'states CONTAINS "CA" AND states CONTAINS "OR" LIMIT 1000');
    assert.notStrictEqual(res.filter, true, `Should have post filter as CONTAINS cannot be used twice`);
    assert.strictEqual(res.results.length, 250);
    // FALSE matches nothing, TRUE is neutral
    res = await repo.find({ filter: new WebdaQL.BooleanExpression(false), limit: 1000 } as any);
    assert.deepStrictEqual(res.results, []);
    res = await this.find(repo, 'state = "CA" AND TRUE LIMIT 1000');
    assert.strictEqual(res.results.length, 250);

    // Pagination through query/iterate
    const page = await repo.query("role = 1 LIMIT 40");
    assert.strictEqual(page.results.length, 40);
    assert.strictEqual(page.continuationToken, "40");
    let count = 0;
    for await (const _item of repo.iterate("role = 1")) {
      count++;
    }
    assert.strictEqual(count, 100);
  }

  @test
  async queryOrder() {
    const repo = await this.fillForQuery();
    let res = await repo.query("order > 900 ORDER BY order DESC LIMIT 10");
    assert.strictEqual((<any>res.results.shift()).order, 999);
    res = await repo.query("ORDER BY order ASC LIMIT 10");
    assert.strictEqual((<any>res.results.shift()).order, 0);
    res = await repo.query("ORDER BY order DESC LIMIT 10");
    assert.strictEqual((<any>res.results.shift()).order, 999);
    res = await repo.query("ORDER BY state ASC, team.id ASC LIMIT 10");
    res.results.forEach((c: any) => {
      assert.deepStrictEqual({ teamId: 0, state: "CA" }, { teamId: c.team.id, state: c.state });
    });
    // It should not fail even if index is not found or does not match
    await repo.query("ORDER BY state ASC, team.id DESC LIMIT 10");
    await repo.query("ORDER BY state ASC, order DESC LIMIT 10");
    await repo.query("order > 900 ORDER BY team.id ASC LIMIT 10");
    await repo.query("ORDER BY team.id ASC, order DESC LIMIT 10");
  }
}
