import { suite, test } from "@testdeck/mocha";
import { Ident, Store } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import pg from "pg";
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
  async createTable() {
    const client = new pg.Client({
      host: "localhost",
      user: "webda.io",
      database: "webda.io",
      password: "webda.io"
    });
    try {
      await client.connect();
      await client.query("DROP TABLE IF EXISTS create_test");
      let store: PostgresStore = this.getService<PostgresStore>("idents");
      store.getParameters().table = "create_test";
      store.getParameters().autoCreateTable = true;
      await store.init();
      await store.save({ test: 1 });
      const res = await store.getClient().query("SELECT * FROM create_test");
      assert.strictEqual(res.rowCount, 1);
    } finally {
      await client.end();
    }
  }

  @test
  async cov() {
    let store: PostgresStore = this.getService<PostgresStore>("idents");
    store.getParameters().usePool = false;
    await store.init();
    await store.query("test = TRUE");
    //assert.rejects(() => store._find({}, 12, 10), /Query should be a string/);
    assert.strictEqual(store.getClient(), store.client);
  }

  @test
  async stoppedPostgres() {
    let obj = await this.getIdentStore().save({
      test: 0
    });
    await obj.patch({ test: 1 });
    await new Promise(resolve => setTimeout(resolve, 20000));
    await obj.patch({ test: 2 });
  }
}
