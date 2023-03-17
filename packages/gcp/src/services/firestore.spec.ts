import { Firestore } from "@google-cloud/firestore";
import { suite, test } from "@testdeck/mocha";
import { Ident, WebdaQL } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import * as sinon from "sinon";
import { v4 as uuidv4 } from "uuid";
import { FireStore } from "./firestore";

@suite
class FireStoreTest extends StoreTest {
  unitUuid: string;
  firestore: Firestore;

  async before() {
    this.unitUuid = uuidv4();
    this.firestore = new Firestore();
    await super.before();
  }

  getIdentStore(): FireStore<any> {
    let ident = <FireStore<any>>this.getService("fireidents");
    ident.getParameters().collection += "_" + this.unitUuid;
    return ident;
  }

  getUserStore(): FireStore<any> {
    let user = <FireStore<any>>this.getService("fireusers");
    user.getParameters().collection += "_" + this.unitUuid;
    return user;
  }

  getModelClass() {
    return Ident;
  }

  /**
   * Delete a full collection
   */
  private async deleteCollection(collectionPath, batchSize) {
    const collectionRef = this.firestore.collection(collectionPath);
    const query = collectionRef.orderBy("__name__").limit(batchSize);

    return new Promise((resolve, reject) => {
      this.deleteQueryBatch(this.firestore, query, resolve).catch(reject);
    });
  }

  async cleanCollection() {
    let collections = await this.firestore.listCollections();
    await Promise.all(
      collections.map(c => {
        return this.deleteCollection(c.id, 500);
      })
    );
  }

  async fillForQuery(): Promise<FireStore> {
    // Create a new store
    let store = new FireStore(this.webda, "queryStore", {
      collection: "webda-query",
      compoundIndexes: [{ state: "asc", "team.id": "asc" }],
      expose: {
        url: "/query"
      }
    });
    store.resolve();
    await store.init();
    let res = await this.firestore.collection("webda-query").where("order", "==", 1).get();
    if (!res.docs.length) {
      console.log("Init the query collection");
      await Promise.all(this.getQueryDocuments().map(d => store.save(d)));
    }
    return store;
  }

  @test
  async query() {
    let store = await super.query();
    let exp = new WebdaQL.QueryValidator('state = "CA" AND role = 4').getExpression();
    let res = await store.find({ filter: exp, limit: 1000 });
    assert.strictEqual(res.filter, true, `Should not have any post filter ${res.filter.toString()}`);
    assert.strictEqual(res.results.length, 50);
    exp = new WebdaQL.QueryValidator('state = "CA" AND team.id < 5').getExpression();
    res = await store.find({ filter: exp, limit: 1000 });
    assert.strictEqual(res.filter, true, `Should not have post filter ${res.filter.toString()}`);
    assert.strictEqual(res.results.length, 100);
    exp = new WebdaQL.QueryValidator('state = "CA" AND team.id < 5 AND role >= 4').getExpression();
    res = await store.find({ filter: exp, limit: 1000 });
    assert.notStrictEqual(res.filter, true, `Should have post filter ${res.filter.toString()}`);
    assert.strictEqual(res.results.length, 100);
    assert.strictEqual(res.results.filter(c => (<WebdaQL.Expression>res.filter).eval(c)).length, 50);
    exp = new WebdaQL.QueryValidator('state = "CA" AND role <= 4').getExpression();
    res = await store.find({ filter: exp, limit: 1000 });
    assert.notStrictEqual(res.filter, true, "Should have post filter");
    assert.strictEqual(res.results.length, 250);
    let items = ["CA", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    res = await store.find({
      filter: new WebdaQL.QueryValidator(`state IN [${items.map(i => `"${i}"`).join(",")}]`).getExpression(),
      limit: 1000
    });
    // Should be post filtered
    assert.strictEqual(res.results.length, 1000);
    res = await store.find({
      filter: new WebdaQL.QueryValidator(`state IN ["CA", "OR"] AND team.id IN [4,8]`).getExpression(),
      limit: 1000
    });
    assert.strictEqual(res.results.length, 500);
    res = await store.find({
      filter: new WebdaQL.QueryValidator(`team.id < 5 AND state > "CA"`).getExpression(),
      limit: 1000
    });
    assert.strictEqual(res.results.length, 250);
    // Test double CONTAINS
    exp = new WebdaQL.QueryValidator('states CONTAINS "CA" AND states CONTAINS "OR"').getExpression();
    res = await store.find({ filter: exp, limit: 1000 });
    assert.notStrictEqual(res.filter, true, `Should have post filter as CONTAINS cannot be used twice`);
    return store;
  }

  @test
  async queryOrder() {
    // Disable default ordering query as it is not possible with Dynamo
    let store = await this.fillForQuery();
    let res = await store.query("order > 900 ORDER BY order DESC LIMIT 10");
    assert.strictEqual((<any>res.results.shift()).order, 999);
    res = await store.query("ORDER BY order ASC LIMIT 10");
    assert.strictEqual((<any>res.results.shift()).order, 0);
    res = await store.query("ORDER BY order DESC LIMIT 10");
    assert.strictEqual((<any>res.results.shift()).order, 999);
    res = await store.query("ORDER BY state ASC, team.id ASC LIMIT 10");
    res.results
      .map(c => this.mapQueryModel(c))
      .forEach(c => {
        assert.deepStrictEqual({ teamId: 0, state: "CA" }, { teamId: c.teamId, state: c.state });
      });
    // It should not fail even if index is not found
    res = await store.query("ORDER BY state ASC, team.id DESC LIMIT 10");
    res = await store.query("order > 900 ORDER BY team.id ASC LIMIT 10");
    res = await store.query("ORDER BY team.id ASC, order DESC LIMIT 10");
  }

  /**
   * Query batch
   *
   * Code from Google Documentation
   *
   */
  private async deleteQueryBatch(db, query, resolve) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
      // When there are no documents left, we are done
      resolve();
      return;
    }

    // Delete documents in a batch
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Recurse on the next process tick, to avoid
    // exploding the stack.
    process.nextTick(() => {
      this.deleteQueryBatch(db, query, resolve);
    });
  }

  async after() {
    await this.deleteCollection(`idents_${this.unitUuid}`, 10000);
    await this.deleteCollection(`users_${this.unitUuid}`, 10000);
  }

  @test
  async deleteCondition() {
    let idents = this.getIdentStore();
    let obj = await idents.save({
      plop: 3
    });
    await assert.rejects(() => idents._delete(obj.getUuid(), 2, "plop"), /UpdateCondition not met/);
    await idents._delete(obj.getUuid(), 3, "plop");
  }

  @test
  async cov() {
    const store: FireStore = <FireStore>this.getIdentStore();
    await assert.rejects(
      () => store.upsertItemToCollection("inexisting", <any>"plop", {}, 0),
      /Item not found inexisting/
    );
    sinon.stub(store, "getDocumentRef").callsFake(() => {
      throw new Error("FAKE");
    });
    await assert.rejects(() => store.upsertItemToCollection("inexisting", <any>"plop", {}), /FAKE/);
    await assert.rejects(() => store.incrementAttribute("inexisting", <never>"plop", 1), /FAKE/);
  }
}
