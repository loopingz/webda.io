import { suite, test } from "@webda/test";
import { Ident } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
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
      } as any,
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
      } as any,
      "users"
    );
  }

  getModelClass() {
    return Ident as any;
  }

  /**
   * Postgres-specific smoke: verifies autoCreateTable+pool path and the
   * single-client (usePool=false) connection mode aside from the
   * StoreTest-inherited CRUD tests.
   */
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
      await store.checkTable();
      const res = await client.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name='create_test'"
      );
      assert.strictEqual(res.rowCount, 1);
    } finally {
      await client.end();
    }
  }

  @test
  async usePoolFalseStillConnects() {
    const single = await this.addService(
      PostgresStore,
      {
        ...params,
        usePool: false,
        autoCreateTable: false,
        table: "idents",
        model: "Webda/Ident"
      } as any,
      "smoke_single"
    );
    try {
      assert.ok(single.client instanceof pg.Client);
      const res = await single.getClient().query("SELECT 1 AS one");
      assert.strictEqual(res.rows[0].one, 1);
    } finally {
      await single.stop?.();
    }
  }

  @test
  async checkTableSkippedWhenAutoCreateDisabled() {
    this.identStore.getParameters().autoCreateTable = false;
    await this.identStore.checkTable();
    this.identStore.getParameters().autoCreateTable = true;
  }
}
