import {
  callOperation,
  OperationContext,
  registerOperation,
  Service,
  ServiceParameters,
  useApplication,
  useModel,
  useRepository
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { RELATIONAL_MODELS, RelPost, RelTag, RelUser, registerRelationalFixtures } from "@webda/sql/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { __resetDatabases } from "./dbregistry.js";
import { SQLiteRelationalParameters, SQLiteRelationalStore } from "./sqliterelationalstore.service.js";
import { SQLiteStore, SQLiteStoreParameters } from "./sqlitestore.service.js";

const DATABASE = { name: "reltx" };
const JSON_TABLE = "tx_rows";

/**
 * The stores of the running test, read by the operations of RelTxOperations
 */
let store: SQLiteRelationalStore;
let jsonStore: SQLiteStore | undefined;

/**
 * Write a user, a tag and a post linked to both: the post and its junction rows go through the relational
 * repository's own transaction
 */
async function writeBlog(): Promise<void> {
  await useRepository(RelUser as any).create({ uuid: "u1", name: "alice" } as any);
  await useRepository(RelTag as any).create({ uuid: "t1", label: "x" } as any);
  await useRepository(RelPost as any).create({ uuid: "p1", title: "Hello", author: "u1", tags: ["t1"] } as any);
  assert.strictEqual(await useRepository(RelPost as any).exists("p1" as any), true, "reads its own write");
}

/**
 * Service exposing the operations of the tests
 */
class RelTxOperations extends Service {
  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  async writeBlog(): Promise<void> {
    await writeBlog();
  }

  async writeBlogThenFail(): Promise<void> {
    await writeBlog();
    throw new Error("operation failed");
  }

  async writeBothThenFail(): Promise<void> {
    await jsonStore!.getRepository(useModel("Webda/OwnerModel")).create({ uuid: "j1" });
    await writeBlog();
    throw new Error("operation failed");
  }
}

/**
 * Operation transactions on a relational SQLite store: its typed writes, junction rows included, take part in the
 * transaction of the operation
 */
@suite
class SQLiteRelationalStoreTransactionTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {
        RelTxOps: {
          type: "RelTxOperations"
        }
      }
    };
  }

  async tweakApp(app: any): Promise<void> {
    app.addModda("Webda/RelTxOperations", RelTxOperations);
  }

  async beforeEach() {
    await super.beforeEach();
    registerRelationalFixtures(useApplication());
    store = await this.makeStore("operation");
    for (const [id, method] of [
      ["RelTxOps.WriteBlog", "writeBlog"],
      ["RelTxOps.WriteBlogThenFail", "writeBlogThenFail"],
      ["RelTxOps.WriteBothThenFail", "writeBothThenFail"]
    ] as const) {
      registerOperation(id, { service: "RelTxOps", method, input: "void", output: "void" } as any);
    }
  }

  async afterEach() {
    await jsonStore?.stop();
    jsonStore = undefined;
    await store?.stop();
    __resetDatabases();
    await super.afterEach();
  }

  /**
   * @param transaction - the transaction mode
   * @returns the initialized relational store, its tables empty
   */
  async makeStore(transaction: "none" | "operation"): Promise<SQLiteRelationalStore> {
    const created = new SQLiteRelationalStore(
      "relational",
      new SQLiteRelationalParameters().load({ database: DATABASE, transaction, models: RELATIONAL_MODELS })
    );
    this.registerService(created as any, "relational");
    await created.resolve().init();
    await created.__clean();
    return created;
  }

  /**
   * @param operationId - the operation
   */
  async call(operationId: string): Promise<void> {
    const ctx = new OperationContext();
    await ctx.init();
    await callOperation(ctx, operationId);
  }

  /**
   * @param table - a table
   * @returns its row count, read outside of any transaction
   */
  async count(table: string): Promise<number> {
    return Number((await store.getClient()!.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
  }

  /**
   * @returns the row counts of the blog tables
   */
  async blogCounts(): Promise<number[]> {
    return Promise.all(["rel_user", "rel_tag", "rel_post", "rel_post_tags"].map(table => this.count(table)));
  }

  @test
  async commitsAndRollsBack() {
    await assert.rejects(() => this.call("RelTxOps.WriteBlogThenFail"), /operation failed/);
    assert.deepStrictEqual(await this.blogCounts(), [0, 0, 0, 0], "every write of the operation is rolled back");
    await this.call("RelTxOps.WriteBlog");
    assert.deepStrictEqual(await this.blogCounts(), [1, 1, 1, 1]);
  }

  @test
  async withTransactionCoversTheRelationalWrites() {
    await assert.rejects(
      () =>
        store.withTransaction(async () => {
          await writeBlog();
          throw new Error("rolled back");
        }),
      /rolled back/
    );
    assert.deepStrictEqual(await this.blogCounts(), [0, 0, 0, 0]);
    await store.withTransaction(() => writeBlog());
    assert.deepStrictEqual(await this.blogCounts(), [1, 1, 1, 1]);
  }

  @test
  async waitsForARelationalTransactionOfAnotherChain() {
    let began!: () => void;
    const begun = new Promise<void>(resolve => (began = resolve));
    // The store's own transaction holds the connection: the operation begins once it ended, never inside it
    const other = store.transact(async tx => {
      began();
      await new Promise(resolve => setTimeout(resolve, 30));
      await tx.query(`INSERT INTO rel_tag (uuid, label) VALUES ('t0', 'first')`);
    });
    await begun;
    await this.call("RelTxOps.WriteBlog");
    await other;
    assert.deepStrictEqual(await this.blogCounts(), [1, 2, 1, 1]);
  }

  @test
  async joinsTheTransactionOfAJsonStoreOnTheSameDatabase() {
    await store.stop();
    store = await this.makeStore("none");
    jsonStore = new SQLiteStore(
      "txjson",
      new SQLiteStoreParameters().load({
        database: DATABASE,
        transaction: "operation",
        table: JSON_TABLE,
        models: ["Webda/OwnerModel"]
      })
    );
    this.registerService(jsonStore as any, "txjson");
    await jsonStore.resolve().init();
    await jsonStore.__clean();
    // One connection per database: the relational writes land in the transaction the JSON store opened
    await assert.rejects(() => this.call("RelTxOps.WriteBothThenFail"), /operation failed/);
    assert.deepStrictEqual(await this.blogCounts(), [0, 0, 0, 0]);
    assert.strictEqual(await this.count(JSON_TABLE), 0);
  }
}
