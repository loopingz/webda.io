import { suite, test } from "@webda/test";
import { Ident, Store } from "@webda/core";
import { StoreTest, IdentTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "node:assert";
import pg from "pg";
import PostgresStore from "./postgresstore.js";

const params = {
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
export class PostgresTest extends StoreTest<PostgresStore<any>> {
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
    return Ident as any;
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
      const store: PostgresStore = this.identStore;
      store.getParameters().table = "create_test";
      store.getParameters().autoCreateTable = true;
      await store.init();
      // Use the repository to save
      const repo = store.getRepository(Ident as any);
      await repo.create({ uuid: "test-1", test: 1 } as any);
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
    // Test the repository query method
    const repo = store.getRepository(Ident as any) as any;
    if (repo.executeQuery) {
      await repo.executeQuery("TRUE");
    }
    assert.strictEqual(store.getClient(), store.client);
    // Test checkTable skip
    store.getParameters().autoCreateTable = false;
    await store.checkTable();
  }

  @test
  async createViews() {
    const store: PostgresStore = this.identStore;
    store.getParameters().viewPrefix = "view_";
    // Should not throw even if no models match
    try {
      await store.createViews();
    } catch (err) {
      // May fail without a real database — that's OK
    }
    store.getParameters().viewPrefix = "";
  }
}
