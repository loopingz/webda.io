import {
  callOperation,
  OperationContext,
  registerOperation,
  Service,
  ServiceParameters,
  useRepository
} from "@webda/core";
import type { Application } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { RELATIONAL_MODELS, RelPost, RelTag, RelUser, registerRelationalFixtures } from "@webda/sql/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import pg from "pg";
import { dropRelationalTables, params } from "../test/relational-helpers.js";
import { PostgresRelationalStore } from "./postgresrelationalstore.service.js";

/**
 * The store of the running test, read by the operations of RelTxOperations
 */
let store: PostgresRelationalStore;

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
}

/**
 * Operation transactions on a relational PostgreSQL store: its typed writes, junction rows included, run on the
 * connection of the operation transaction
 */
@suite
class PostgresRelationalStoreTransactionTest extends WebdaApplicationTest {
  admin!: pg.Client;

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
    await super.tweakApp(app);
    app.addModda("Webda/RelTxOperations", RelTxOperations);
    registerRelationalFixtures(app as Application);
  }

  async beforeEach() {
    await super.beforeEach();
    this.admin = new pg.Client(params.postgresqlServer);
    await this.admin.connect();
    await dropRelationalTables(this.admin);
    store = await this.addService(
      PostgresRelationalStore,
      {
        ...params,
        postgresqlServer: { ...params.postgresqlServer, max: 4, application_name: "webda-reltx-spec" },
        usePool: true,
        transaction: "operation",
        models: RELATIONAL_MODELS
      } as any,
      "relational"
    );
    for (const [id, method] of [
      ["RelTxOps.WriteBlog", "writeBlog"],
      ["RelTxOps.WriteBlogThenFail", "writeBlogThenFail"]
    ] as const) {
      registerOperation(id, { service: "RelTxOps", method, input: "void", output: "void" } as any);
    }
  }

  async afterEach() {
    const pool = store?.getClient() as pg.Pool | undefined;
    if (pool) {
      assert.strictEqual(pool.totalCount - pool.idleCount, 0, "every transaction connection is back in the pool");
    }
    await store?.stop();
    await dropRelationalTables(this.admin);
    await this.admin.end();
    await super.afterEach();
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
   * @returns the row counts of the blog tables, read on another connection
   */
  async blogCounts(): Promise<number[]> {
    const counts: number[] = [];
    for (const table of ["rel_user", "rel_tag", "rel_post", "rel_post_tags"]) {
      counts.push(Number((await this.admin.query(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n));
    }
    return counts;
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
}
