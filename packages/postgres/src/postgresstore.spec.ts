import { suite, test } from "@testdeck/mocha";
import { Ident, Store } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import PostgresStore from "./postgresstore";

@suite
export class PostgresTest extends StoreTest {
  getIdentStore(): Store<any> {
    return <Store<any>>this.getService("idents");
  }
  getUserStore(): Store<any> {
    return <Store<any>>this.getService("users");
  }

  getModelClass() {
    return Ident;
  }

  @test
  async deleteConcurrent() {
    return super.deleteConcurrent();
  }

  @test
  async cov() {
    let store: PostgresStore = this.getService<PostgresStore>("idents");
    store.getParameters().usePool = false;
    await store.init();

    //assert.rejects(() => store._find({}, 12, 10), /Query should be a string/);
    assert.strictEqual(store.getClient(), store.client);
  }

  @test
  async stoppedPostgres() {
    let obj = await this.getIdentStore().save({
      test: 0
    });
    await obj.update({ test: 1 });
    await new Promise(resolve => setTimeout(resolve, 20000));
    await obj.update({ test: 2 });
  }
}
