import { suite, test } from "@testdeck/mocha";
import { CoreModel, Ident, Store } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import pg from "pg";
import PostgresStore from "./postgresstore";

const params = {
  database: "webda.io",
  postgresqlServer: {
    host: "localhost",
    user: "webda.io",
    database: "webda.io",
    password: "webda.io",
    statement_timeout: 60000,
    max: 2
  }
};

@suite
export class PostgresTest extends StoreTest<PostgresStore> {
  async getIdentStore(): Promise<PostgresStore<any>> {
    return this.addService(
      PostgresStore,
      {
        ...params,
        asyncDelete: true,
        table: "idents",
        model: "Webda/Ident"
      },
      "idents"
    );
  }
  async getUserStore(): Promise<PostgresStore<any>> {
    return this.addService(
      PostgresStore,
      {
        ...params,
        table: "users",
        model: "Webda/User"
      },
      "users"
    );
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
      const store: PostgresStore = this.getService<PostgresStore>("idents");
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
    const store: PostgresStore = this.identStore;
    store.getParameters().usePool = false;
    await store.init();
    await store.query("test = TRUE");
    //assert.rejects(() => store._find({}, 12, 10), /Query should be a string/);
    assert.strictEqual(store.getClient(), store.client);
    // Test checkTable
    store.getParameters().autoCreateTable = false;
    await store.checkTable();
  }

  @test
  async stoppedPostgres() {
    const obj = <CoreModel & { test: number }>await this.identStore.save({
      test: 0
    });
    await obj.patch({ test: 1 });
    await new Promise(resolve => setTimeout(resolve, 20000));
    await obj.patch({ test: 2 });
  }

  @test
  async createViews() {
    const store: PostgresStore = this.identStore;
    let info = await store.getClient().query(`SELECT 'DROP VIEW ' || table_name || ';'
    FROM information_schema.views
   WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
     AND table_name !~ '^pg_';`);
    store.getParameters().viewPrefix = "view_";
    // Execute all the drop views
    await store.createViews();
    info = await store
      .getClient()
      .query(
        "SELECT table_name FROM information_schema.views WHERE table_schema NOT IN ('pg_catalog', 'information_schema')"
      );
    assert.deepStrictEqual(
      info.rows.sort((a, b) => a.table_name.localeCompare(b.table_name)),
      [
        { table_name: "view_idents" },
        { table_name: "view_myidents" },
        { table_name: "view_mysimpleusers" },
        { table_name: "view_simpleusers" },
        { table_name: "view_testidents" },
        { table_name: "view_users" }
      ]
    );
    store.getParameters().viewPrefix = "";
    await store.createViews();
  }
}
