import { StoreTest } from "@webda/core/lib/stores/store.spec";
import { Store, Ident } from "@webda/core";
import { test, suite } from "@testdeck/mocha";
import { FireStore } from "./firestore";
import * as assert from "assert";
import * as sinon from "sinon";
import { v4 as uuidv4 } from "uuid";
import { Firestore } from "@google-cloud/firestore";

@suite
class FireStoreTest extends StoreTest {
  unitUuid: string;
  firestore: Firestore;

  async before() {
    this.unitUuid = uuidv4();
    this.firestore = new Firestore();
    await super.before();
  }

  getIdentStore(): Store<any> {
    let ident = <FireStore<any>>this.getService("fireidents");
    ident.getParameters().collection += "_" + this.unitUuid;
    return ident;
  }

  getUserStore(): Store<any> {
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

  /*
  async after() {
    await this.deleteCollection(`idents_${this.unitUuid}`, 10000);
    await this.deleteCollection(`users_${this.unitUuid}`, 10000);
  }
  */

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
