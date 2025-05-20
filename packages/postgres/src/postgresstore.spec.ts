import { suite, test } from "@testdeck/mocha";
import { Ident, Store } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import pg from "pg";
import PostgresStore from "./postgresstore";
import Sinon from "sinon";

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
  async debugMode() {
    const store = <PostgresStore<Ident>>this.getIdentStore();
    store.getParameters().debug = true;
    store.getParameters().autoCreateTable = true;
    await store.init();
    const obj = await store.save({
      name: "test"
    });

    const spy = Sinon.spy(store, "log");
    await store.executeQuery("SELECT * FROM idents");
    assert.ok(spy.getCalls().filter(call => call.args[0] === "WARN" && call.args[2].startsWith("Seq Scan")).length > 0);
    spy.resetHistory();
    await Ident.query();
    assert.ok(spy.getCalls().filter(call => call.args[0] === "WARN").length == 0);
    spy.resetHistory();
    await Ident.query("name = 'test'");
    assert.ok(spy.getCalls().filter(call => call.args[0] === "WARN").length == 0);
  }

  @test
  async correctEscape() {
    const ident = <Store<Ident>>this.getIdentStore();
    await ident.save({
      name: "test"
    });
    assert.strictEqual((await Ident.query("name = 'test'")).results.length, 1);
    await assert.rejects(() => Ident.query("name = '\"test'"), /SyntaxError/);
    assert.strictEqual((await Ident.query('name = "\'test"')).results.length, 0);
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
    // Test checkTable
    store.getParameters().autoCreateTable = false;
    await store.checkTable();
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

  @test
  async createViews() {
    let store: PostgresStore = this.getService<PostgresStore>("idents");
    let info = await store.getClient().query(`SELECT 'DROP VIEW ' || table_name || ';'
    FROM information_schema.views
   WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
     AND table_name !~ '^pg_';`);
    console.log(info.rows);
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
      [{ table_name: "view_idents" }, { table_name: "view_users" }]
    );
    store.getParameters().viewPrefix = "";
    await store.createViews();
  }
}
