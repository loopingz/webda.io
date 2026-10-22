import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import pg from "pg";
import { vi } from "vitest";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import {
  callOperation,
  OperationContext,
  registerOperation,
  runAsSystem,
  Service,
  ServiceParameters,
  useModel,
  WebdaError
} from "@webda/core";
import type { Repository } from "@webda/core";
import PostgresStore from "./postgresstore.service.js";

const server = {
  host: "localhost",
  user: "webda.io",
  database: "webda.io",
  password: "webda.io",
  statement_timeout: 60000,
  // A pool of its own: no other suite shares it, so the leak checks only see this suite connections
  application_name: "webda-tx-spec",
  max: 4
};

const TABLE = "tx_rows";

/**
 * The store of the running test, read by the operations of TxOperations
 */
let store: PostgresStore;
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
    await Promise.all(["p1", "p2", "p3", "p4", "p5"].map(uuid => repo().create({ uuid })));
    await repo().incrementAttributes("p1", [{ property: "counter", value: 2 }]);
  }

  async readOwnWrite(): Promise<void> {
    await repo().create({ uuid: "a" });
    assert.strictEqual(await repo().exists("a"), true, "the transaction reads its own write");
    // runAsSystem switches the context, not the transaction: still in it
    assert.strictEqual(await runAsSystem(() => repo().exists("a")), true);
    const level = await store.getTransactionClient()!.query("SHOW transaction_isolation");
    assert.strictEqual(level.rows[0].transaction_isolation, "repeatable read");
    written();
    await proceed;
  }

  async duplicate(): Promise<void> {
    await repo().create({ uuid: "a" });
    await repo().create({ uuid: "a" });
  }

  async duplicateSwallowed(): Promise<void> {
    await repo().create({ uuid: "a" });
    await repo()
      .create({ uuid: "a" })
      .catch(() => {
        /* the transaction is aborted anyway */
      });
  }

  async commitOnABrokenConnection(): Promise<void> {
    await repo().create({ uuid: "a" });
    const pid = (await store.getTransactionClient()!.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    // Another connection of the pool kills the transaction one: the COMMIT fails
    await runAsSystem(() => store.getClient().query("SELECT pg_terminate_backend($1)", [pid]));
  }

  async statementOnABrokenConnection(): Promise<void> {
    await repo().create({ uuid: "a" });
    // The transaction connection kills itself: the statement and the ROLLBACK fail
    await store.getTransactionClient()!.query("SELECT pg_terminate_backend(pg_backend_pid())");
  }

  async noStore(): Promise<string> {
    return "nothing";
  }

  async *streamRows(): AsyncGenerator<string> {
    await repo().create({ uuid: "s" });
    yield "s";
  }
}

@suite
class PostgresStoreTransactionTest extends WebdaApplicationTest {
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
    store = await this.createStore("txstore", "operation");
    for (const [id, method, extra] of [
      ["TxOps.CreateTwo", "createTwo", {}],
      ["TxOps.CreateTwoThenFail", "createTwoThenFail", {}],
      ["TxOps.CreateAll", "createAll", {}],
      ["TxOps.ReadOwnWrite", "readOwnWrite", {}],
      ["TxOps.Duplicate", "duplicate", {}],
      ["TxOps.DuplicateSwallowed", "duplicateSwallowed", {}],
      ["TxOps.NoStore", "noStore", {}],
      ["TxOps.CommitOnABrokenConnection", "commitOnABrokenConnection", {}],
      ["TxOps.StatementOnABrokenConnection", "statementOnABrokenConnection", {}],
      ["TxOps.StreamRows", "streamRows", { generator: true }],
      ["TxOps.StreamRowsNoTx", "streamRows", { generator: true, transaction: false }]
    ] as const) {
      registerOperation(id, { service: "TxOps", method, input: "void", output: "void", ...extra } as any);
    }
  }

  async afterEach() {
    try {
      this.assertNoLeak();
    } finally {
      await store?.getClient()?.query(`DROP TABLE IF EXISTS ${TABLE}`);
      await store?.stop();
      await super.afterEach();
    }
  }

  /**
   * @param name - the service name
   * @param transaction - the transaction mode
   * @param extra - more parameters
   * @returns the initialized store, its table empty
   */
  async createStore(name: string, transaction: "none" | "operation", extra: any = {}): Promise<PostgresStore> {
    const created = await this.addService(
      PostgresStore,
      {
        postgresqlServer: server,
        usePool: true,
        transaction,
        autoCreateTable: true,
        table: TABLE,
        models: ["Webda/OwnerModel"],
        ...extra
      } as any,
      name
    );
    await created.getClient().query(`TRUNCATE TABLE ${TABLE}`);
    return created;
  }

  /**
   * Every connection checked out of the pool was released
   */
  assertNoLeak() {
    const pool = store.getClient() as pg.Pool;
    assert.strictEqual(pool.totalCount - pool.idleCount, 0, "a connection is still checked out");
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
    const res = await store.getClient().query(`SELECT uuid FROM ${TABLE} ORDER BY uuid`);
    return res.rows.map(r => r.uuid);
  }

  @test
  async commitsTheOperationWrites() {
    await this.call("TxOps.CreateTwo");
    assert.deepStrictEqual(await this.stored(), ["a", "b"]);
    this.assertNoLeak();
  }

  @test
  async rollsBackWhenTheOperationThrows() {
    await assert.rejects(() => this.call("TxOps.CreateTwoThenFail"), /operation failed/);
    assert.deepStrictEqual(await this.stored(), []);
    this.assertNoLeak();
  }

  @test
  async concurrentWritesInOneOperation() {
    await this.call("TxOps.CreateAll");
    assert.deepStrictEqual(await this.stored(), ["p1", "p2", "p3", "p4", "p5"]);
    assert.strictEqual((await repo().get("p1")).counter, 2);
  }

  @test
  async uncommittedWritesAreInvisibleOutside() {
    store.getParameters().transactionIsolation = "REPEATABLE READ";
    let resume: () => void;
    proceed = new Promise(resolve => (resume = resolve));
    const reached = new Promise<void>(resolve => (written = resolve));
    const operation = this.call("TxOps.ReadOwnWrite");
    await reached;
    // This async chain is outside the operation: autocommit statements on the pool
    assert.strictEqual(await runAsSystem(() => repo().exists("a")), false);
    assert.deepStrictEqual(await this.stored(), []);
    resume!();
    await operation;
    assert.deepStrictEqual(await this.stored(), ["a"]);
  }

  @test
  async failedStatementRollsBackTheOperation() {
    await assert.rejects(() => this.call("TxOps.Duplicate"), /Already exists: a/);
    assert.deepStrictEqual(await this.stored(), []);
    this.assertNoLeak();
    // Swallowing the error does not commit an aborted transaction: the operation fails
    await assert.rejects(
      () => this.call("TxOps.DuplicateSwallowed"),
      (err: any) => {
        assert.strictEqual(err.code, "SQL_TRANSACTION_ABORTED");
        return true;
      }
    );
    assert.deepStrictEqual(await this.stored(), []);
    this.assertNoLeak();
  }

  @test
  async brokenConnectionsAreReleased() {
    const pool = store.getClient() as pg.Pool;
    await assert.rejects(() => this.call("TxOps.CommitOnABrokenConnection"));
    this.assertNoLeak();
    await assert.rejects(() => this.call("TxOps.StatementOnABrokenConnection"));
    this.assertNoLeak();
    assert.deepStrictEqual(await this.stored(), []);
    // The broken connections were destroyed, not given back to the pool: the next operation works
    await this.call("TxOps.CreateTwo");
    assert.deepStrictEqual(await this.stored(), ["a", "b"]);
    assert.ok(pool.totalCount <= 4);
  }

  @test
  async lazyConnectionCheckout() {
    const open = vi.spyOn(store as any, "openTransaction");
    await this.call("TxOps.NoStore");
    assert.strictEqual(open.mock.calls.length, 0, "an operation not touching the store opens nothing");
    await this.call("TxOps.CreateTwo");
    assert.strictEqual(open.mock.calls.length, 1, "one connection for the whole operation");
  }

  @test
  async streamedOperations() {
    const open = vi.spyOn(store as any, "openTransaction");
    await this.call("TxOps.StreamRows");
    assert.strictEqual(open.mock.calls.length, 1);
    assert.deepStrictEqual(await this.stored(), ["s"]);
    await store.getClient().query(`TRUNCATE TABLE ${TABLE}`);
    // transaction: false keeps the autocommit statements
    await this.call("TxOps.StreamRowsNoTx");
    assert.strictEqual(open.mock.calls.length, 1);
    assert.deepStrictEqual(await this.stored(), ["s"]);
  }

  @test
  async noneKeepsAutocommit() {
    await store.stop();
    store = await this.createStore("txnone", "none");
    const open = vi.spyOn(store as any, "openTransaction");
    await assert.rejects(() => this.call("TxOps.CreateTwoThenFail"), /operation failed/);
    // Each statement committed on its own, as before
    assert.deepStrictEqual(await this.stored(), ["a", "b"]);
    assert.strictEqual(open.mock.calls.length, 0);
  }

  @test
  async withTransactionOutsideOperations() {
    await assert.rejects(
      () =>
        store.withTransaction(async () => {
          await repo().create({ uuid: "a" });
          await repo().create({ uuid: "b" });
          throw new Error("worker failed");
        }),
      /worker failed/
    );
    assert.deepStrictEqual(await this.stored(), []);
    this.assertNoLeak();
    const result = await store.withTransaction(async () => {
      await repo().create({ uuid: "a" });
      // Joins: committed with the outer one
      await store.withTransaction(() => repo().create({ uuid: "b" }));
      assert.deepStrictEqual(await this.stored(), [], "nothing visible before the commit");
      return "done";
    });
    assert.strictEqual(result, "done");
    assert.deepStrictEqual(await this.stored(), ["a", "b"]);
    this.assertNoLeak();
  }

  @test
  async withTransactionOnANoneStore() {
    await store.stop();
    store = await this.createStore("txnone2", "none");
    await assert.rejects(
      () =>
        store.withTransaction(async () => {
          await repo().create({ uuid: "a" });
          throw new Error("worker failed");
        }),
      /worker failed/
    );
    assert.deepStrictEqual(await this.stored(), []);
  }

  @test
  async ddlRunsOutsideTheTransaction() {
    await store.getClient().query(`DROP TABLE ${TABLE}`);
    (store as any).tablesReady.clear();
    await assert.rejects(() => this.call("TxOps.CreateTwoThenFail"), /operation failed/);
    // The table created by the first statement is not rolled back with the operation
    assert.deepStrictEqual(await this.stored(), []);
    await this.call("TxOps.CreateTwo");
    assert.deepStrictEqual(await this.stored(), ["a", "b"]);
  }

  @test
  async transactionNeedsAPool() {
    await assert.rejects(
      () => this.createStore("txsingle", "operation", { usePool: false }),
      (err: any) => {
        assert.ok(err instanceof WebdaError.CodeError);
        assert.strictEqual(err.code, "POSTGRES_TRANSACTION_REQUIRES_POOL");
        return true;
      }
    );
  }

  @test
  async refusesAnUnknownIsolationLevel() {
    await assert.rejects(
      () => this.createStore("txiso", "operation", { transactionIsolation: "READ UNCOMMITTED; DROP TABLE x" }),
      /Invalid transactionIsolation/
    );
  }
}
