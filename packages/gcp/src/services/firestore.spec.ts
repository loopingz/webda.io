import { StoreTest } from "@webda/core/lib/stores/store.spec";
import { test, suite } from "@testdeck/mocha";
import { FireStore } from "./firestore";
import * as assert from "assert";
import * as sinon from "sinon";
import { v4 as uuidv4 } from "uuid";
import { Firestore } from "@google-cloud/firestore";
import { Ident, WebdaQL } from "@webda/core";

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
        return this.deleteCollection(c.id, 1000);
      })
    );
  }

  async fillForQuery(): Promise<FireStore> {
    // Create a new store
    let store = new FireStore(this.webda, "queryStore", {
      collection: "webda-query",
      compoundIndexes: [["state", "team.id"]],
      expose: {
        url: "/query",
      },
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
    let res = await store.find(exp, undefined, 1000);
    assert.strictEqual(res.filter, true, `Should not have any post filter ${res.filter.toString()}`);
    assert.strictEqual(res.results.length, 50);
    exp = new WebdaQL.QueryValidator('state = "CA" AND team.id < 5').getExpression();
    res = await store.find(exp, undefined, 1000);
    assert.strictEqual(res.filter, true, `Should not have post filter ${res.filter.toString()}`);
    assert.strictEqual(res.results.length, 100);
    exp = new WebdaQL.QueryValidator('state = "CA" AND team.id < 5 AND role >= 4').getExpression();
    res = await store.find(exp, undefined, 1000);
    assert.notStrictEqual(res.filter, true, `Should have post filter ${res.filter.toString()}`);
    assert.strictEqual(res.results.length, 100);
    assert.strictEqual(res.results.filter(c => (<WebdaQL.Expression>res.filter).eval(c)).length, 50);
    exp = new WebdaQL.QueryValidator('state = "CA" AND role <= 4').getExpression();
    res = await store.find(exp, undefined, 1000);
    assert.notStrictEqual(res.filter, true, "Should have post filter");
    assert.strictEqual(res.results.length, 250);
    let items = ["CA", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    res = await store.find(
      new WebdaQL.QueryValidator(`state IN [${items.map(i => `"${i}"`).join(",")}]`).getExpression(),
      undefined,
      1000
    );
    // Should be post filtered
    assert.strictEqual(res.results.length, 1000);
    res = await store.find(
      new WebdaQL.QueryValidator(`state IN ["CA", "OR"] AND team.id IN [4,8]`).getExpression(),
      undefined,
      1000
    );
    assert.strictEqual(res.results.length, 500);
    res = await store.find(new WebdaQL.QueryValidator(`team.id < 5 AND state > "CA"`).getExpression(), undefined, 1000);
    assert.strictEqual(res.results.length, 250);
    return store;
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
      plop: 3,
    });
    await assert.rejects(() => idents._delete(obj.getUuid(), 2, "plop"), /UpdateCondition not met/);
    await idents._delete(obj.getUuid(), 3, "plop");
  }

  @test
  async cov() {
    const store: FireStore = <FireStore>this.getIdentStore();
    await assert.rejects(() => store.upsertItemToCollection("inexisting", "plop", {}, 0), /Item not found inexisting/);
    sinon.stub(store, "getDocumentRef").callsFake(() => {
      throw new Error("FAKE");
    });
    await assert.rejects(() => store.upsertItemToCollection("inexisting", "plop", {}), /FAKE/);
    await assert.rejects(() => store.incrementAttribute("inexisting", "plop", 1), /FAKE/);
  }
}
