import { StoreTest } from "@webda/core/lib/stores/store.spec";
import { Store, Ident } from "@webda/core";
import { test, suite } from "@testdeck/mocha";
import { FireStore, FireStoreParameters } from "./firestore";
import * as assert from "assert";
import * as sinon from "sinon";

@suite
class FireStoreTest extends StoreTest {
  getIdentStore(): Store<any> {
    return <Store<any>>this.getService("fireidents");
  }

  getUserStore(): Store<any> {
    return <Store<any>>this.getService("fireusers");
  }

  getModelClass() {
    return Ident;
  }

  @test
  getModda() {
    FireStore.getModda();
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
    const store = this.getIdentStore();
    await assert.rejects(() => store.upsertItemToCollection("inexisting", "plop", {}, 0), /Item not found inexisting/);
    sinon.stub(store, "getDocumentRef").callsFake(() => {
      throw new Error("FAKE");
    });
    await assert.rejects(() => store.upsertItemToCollection("inexisting", "plop", {}), /FAKE/);
    await assert.rejects(() => store.incrementAttribute("inexisting", "plop", 1), /FAKE/);
  }
}
