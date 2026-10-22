import {
  callOperation,
  OperationContext,
  registerOperation,
  runAsSystem,
  Service,
  ServiceParameters,
  useModel
} from "@webda/core";
import type { Repository } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { __resetDatabases } from "./dbregistry.js";
import { SQLitePubSubParameters, SQLitePubSubService } from "./sqlitepubsub.service.js";
import { SQLiteQueueParameters, SQLiteQueueService } from "./sqlitequeue.service.js";
import SQLiteStore, { SQLiteStoreParameters } from "./sqlitestore.service.js";

const TABLE = "tx_rows";

/**
 * The store and queue of the running test, read by the operations of TxOperations
 */
let store: SQLiteStore;
let queue: SQLiteQueueService | undefined;
let pubsub: SQLitePubSubService | undefined;
/**
 * Messages delivered to the subscriber of the pub/sub test
 */
let delivered: string[] = [];
/**
 * Resolved by the operation once it wrote, waiting for {@link proceed}
 */
let written: () => void;
let proceed: Promise<void>;

/**
 * @returns the repository of the test rows
 */
function repo(): Repository<any> {
  return store.getRepository(useModel("Webda/OwnerModel"));
}

/**
 * Service exposing the operations of the tests
 */
class TxOperations extends Service {
  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  async createTwo(): Promise<void> {
    await repo().create({ uuid: "a" });
    await repo().create({ uuid: "b" });
  }

  async createTwoThenFail(): Promise<void> {
    await this.createTwo();
    throw new Error("operation failed");
  }

  async createAll(): Promise<void> {
    await Promise.all(["p1", "p2", "p3"].map(uuid => repo().create({ uuid })));
  }

  async writeAndWait(): Promise<void> {
    await repo().create({ uuid: "a" });
    assert.strictEqual(await repo().exists("a"), true, "the transaction reads its own write");
    // runAsSystem switches the context, not the transaction: no deadlock on the database lock
    assert.strictEqual(await runAsSystem(() => repo().exists("a")), true);
    written();
    await proceed;
  }

  async writeOtherThenFail(): Promise<void> {
    await repo().create({ uuid: "other" });
    throw new Error("second operation failed");
  }

  async duplicateSwallowed(): Promise<void> {
    await repo().create({ uuid: "a" });
    await repo()
      .create({ uuid: "a" })
      .catch(() => {
        /* the transaction is aborted anyway */
      });
  }

  async createAndQueueThenFail(): Promise<void> {
    await repo().create({ uuid: "a" });
    await queue!.sendMessage({ uuid: "a" });
    throw new Error("operation failed");
  }

  async publishThenFail(): Promise<void> {
    await repo().create({ uuid: "a" });
    await pubsub!.sendMessage("rolled back");
    throw new Error("operation failed");
  }

  async publish(): Promise<void> {
    await repo().create({ uuid: "b" });
    await pubsub!.sendMessage("committed");
    // Several poll intervals: nothing is delivered before the commit
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepStrictEqual(delivered, [], "delivered before the commit");
  }

  async noStore(): Promise<string> {
    return "nothing";
  }
}

/**
 * Operation transactions on SQLite: one connection per database, so a transaction holds the database for the async
 * chain of its operation until it ends
 */
abstract class SQLiteTransactionSuite extends WebdaApplicationTest {
  abstract connection(): Partial<SQLiteStoreParameters>;

  getTestConfiguration() {
    return {
      services: {
        TxOps: {
          type: "TxOperations"
        }
      }
    };
  }

  async tweakApp(app: any): Promise<void> {
    app.addModda("Webda/TxOperations", TxOperations);
  }

  async beforeEach() {
    await super.beforeEach();
    store = await this.makeStore("txstore", "operation");
    for (const [id, method] of [
      ["TxOps.CreateTwo", "createTwo"],
      ["TxOps.CreateTwoThenFail", "createTwoThenFail"],
      ["TxOps.CreateAll", "createAll"],
      ["TxOps.WriteAndWait", "writeAndWait"],
      ["TxOps.WriteOtherThenFail", "writeOtherThenFail"],
      ["TxOps.DuplicateSwallowed", "duplicateSwallowed"],
      ["TxOps.CreateAndQueueThenFail", "createAndQueueThenFail"],
      ["TxOps.PublishThenFail", "publishThenFail"],
      ["TxOps.Publish", "publish"],
      ["TxOps.NoStore", "noStore"]
    ] as const) {
      registerOperation(id, { service: "TxOps", method, input: "void", output: "void" } as any);
    }
  }

  async afterEach() {
    await queue?.stop();
    queue = undefined;
    await pubsub?.stop();
    pubsub = undefined;
    await store?.stop();
    __resetDatabases();
    await super.afterEach();
  }

  /**
   * @param name - the service name
   * @param transaction - the transaction mode
   * @returns the initialized store, its table empty
   */
  async makeStore(name: string, transaction: "none" | "operation"): Promise<SQLiteStore> {
    const created = new SQLiteStore(
      name,
      new SQLiteStoreParameters().load({
        ...this.connection(),
        database: { name: "txdb" },
        transaction,
        table: TABLE,
        models: ["Webda/OwnerModel"]
      })
    );
    this.registerService(created as any, name);
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
   * @returns the uuids stored, read outside of any transaction
   */
  async stored(): Promise<string[]> {
    const res = await store.getClient()!.query(`SELECT uuid FROM ${TABLE} ORDER BY uuid`);
    return res.rows.map(r => r.uuid);
  }

  @test
  async commitsAndRollsBack() {
    await assert.rejects(() => this.call("TxOps.CreateTwoThenFail"), /operation failed/);
    assert.deepStrictEqual(await this.stored(), []);
    await this.call("TxOps.CreateTwo");
    assert.deepStrictEqual(await this.stored(), ["a", "b"]);
    await this.call("TxOps.CreateAll");
    assert.deepStrictEqual(await this.stored(), ["a", "b", "p1", "p2", "p3"]);
  }

  @test
  async otherChainsWaitForTheCommit() {
    let resume: () => void;
    proceed = new Promise(resolve => (resume = resolve));
    const reached = new Promise<void>(resolve => (written = resolve));
    const first = this.call("TxOps.WriteAndWait");
    await reached;
    // Outside the operation: the statement waits for the database, it never reads the uncommitted row
    let outside: string[] | undefined;
    const read = this.stored().then(rows => (outside = rows));
    // A second operation waits as well, and its rollback does not touch the first one rows
    const second = this.call("TxOps.WriteOtherThenFail").catch(err => err);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(outside, undefined, "the read waits for the transaction");
    resume!();
    await first;
    await read;
    assert.deepStrictEqual(outside, ["a"]);
    assert.match((await second).message, /second operation failed/);
    assert.deepStrictEqual(await this.stored(), ["a"]);
  }

  @test
  async exclusiveIsTakenByOneTransactionAtATime() {
    const client = store.getHandle()!.client;
    const holders: string[] = [];
    let current: string | undefined;
    const hold = async (name: string) => {
      const release = await client.acquireExclusive(() => false);
      assert.strictEqual(current, undefined, `${name} took the connection held by ${current}`);
      current = name;
      holders.push(name);
      await new Promise(resolve => setTimeout(resolve, 5));
      current = undefined;
      release();
    };
    await Promise.all([hold("a"), hold("b"), hold("c")]);
    assert.deepStrictEqual(holders, ["a", "b", "c"]);
    // A statement outside waits for the holder
    const release = await client.acquireExclusive(() => false);
    let done = false;
    const statement = client.query("SELECT 1 AS one").then(() => (done = true));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.strictEqual(done, false);
    release();
    await statement;
    assert.strictEqual(done, true);
  }

  @test
  async failedStatementAbortsTheOperation() {
    await assert.rejects(
      () => this.call("TxOps.DuplicateSwallowed"),
      (err: any) => err.code === "SQL_TRANSACTION_ABORTED"
    );
    assert.deepStrictEqual(await this.stored(), []);
  }

  @test
  async lazyAndNone() {
    const open = vi.spyOn(store as any, "openTransaction");
    await this.call("TxOps.NoStore");
    assert.strictEqual(open.mock.calls.length, 0);
    await store.stop();
    store = await this.makeStore("txnone", "none");
    await assert.rejects(() => this.call("TxOps.CreateTwoThenFail"), /operation failed/);
    assert.deepStrictEqual(await this.stored(), ["a", "b"], "autocommit per statement");
  }

  @test
  async withTransaction() {
    await assert.rejects(
      () =>
        store.withTransaction(async () => {
          await repo().create({ uuid: "a" });
          throw new Error("worker failed");
        }),
      /worker failed/
    );
    assert.deepStrictEqual(await this.stored(), []);
    await store.withTransaction(() => repo().create({ uuid: "a" }));
    assert.deepStrictEqual(await this.stored(), ["a"]);
  }

  @test
  async servicesSharingTheDatabaseJoinTheTransaction() {
    queue = new SQLiteQueueService(
      "txqueue",
      new SQLiteQueueParameters().load({ ...this.connection(), database: { name: "txdb" }, waitTime: 0 })
    );
    this.registerService(queue as any, "txqueue");
    await queue.resolve().init();
    await assert.rejects(() => this.call("TxOps.CreateAndQueueThenFail"), /operation failed/);
    assert.deepStrictEqual(await this.stored(), []);
    assert.strictEqual(await queue.size(), 0, "the message is rolled back with the row");
  }

  @test
  async pubSubDeliversCommittedMessagesOnly() {
    pubsub = new SQLitePubSubService(
      "txbus",
      new SQLitePubSubParameters().load({ ...this.connection(), database: { name: "txdb" }, pollInterval: 10 })
    );
    this.registerService(pubsub as any, "txbus");
    await pubsub.resolve().init();
    delivered = [];
    const subscription = pubsub.consume(async (msg: string) => {
      delivered.push(msg);
    });
    try {
      // A rolled back message is never delivered, and its id (given back by the rollback) is not skipped later
      await assert.rejects(() => this.call("TxOps.PublishThenFail"), /operation failed/);
      // Published during the transaction: delivered once committed, never before
      await this.call("TxOps.Publish");
      await pubsub.sendMessage("after");
      for (let i = 0; i < 50 && delivered.length < 2; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.deepStrictEqual(delivered, ["committed", "after"]);
    } finally {
      subscription.cancel();
    }
  }

  @test
  async tableCreatedInARolledBackTransaction() {
    await store.withTransaction(async () => {
      await repo().create({ uuid: "a" });
    });
    await store.getClient()!.query(`DROP TABLE ${TABLE}`);
    (store as any).tablesReady.clear();
    await assert.rejects(
      () =>
        store.withTransaction(async () => {
          // Opens the transaction on another table first: the DDL then runs inside it
          await store.getTransactionClient()!.query("SELECT 1");
          await repo().create({ uuid: "a" });
          throw new Error("worker failed");
        }),
      /worker failed/
    );
    // The CREATE TABLE was rolled back: the store creates it again
    await this.call("TxOps.CreateTwo");
    assert.deepStrictEqual(await this.stored(), ["a", "b"]);
  }
}

@suite
class SQLiteMemoryTransactionTest extends SQLiteTransactionSuite {
  connection(): Partial<SQLiteStoreParameters> {
    return {};
  }
}

@suite
class SQLiteFileTransactionTest extends SQLiteTransactionSuite {
  dir = mkdtempSync(join(tmpdir(), "webda-sqlite-tx-"));

  connection(): Partial<SQLiteStoreParameters> {
    return { persistence: { path: join(this.dir, "tx.db") } };
  }

  async afterAll() {
    rmSync(this.dir, { recursive: true, force: true });
    await super.afterAll?.();
  }
}
