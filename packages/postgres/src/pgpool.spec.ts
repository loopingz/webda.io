import { SecretString, useApplication } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import { EventEmitter } from "node:events";
import * as assert from "node:assert";
import pg from "pg";
import { PostgresListener } from "./pglisten.js";
import { __resetPools, acquirePool, poolKey, releasePool } from "./pgpool.js";
import PostgresPubSubService, { PostgresPubSubParameters } from "./postgrespubsub.service.js";
import PostgresQueueService, { PostgresQueueParameters } from "./postgresqueue.service.js";
import PostgresRelationalStore, { PostgresRelationalParameters } from "./postgresrelationalstore.service.js";
import PostgresStore, { PostgresParameters } from "./postgresstore.service.js";

const cfg = {
  host: "localhost",
  user: "webda.io",
  database: "webda.io",
  password: "webda.io",
  statement_timeout: 60000,
  max: 1
};

@suite
class PgPoolTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  async afterEach() {
    await __resetPools();
    await super.afterEach();
  }

  @test
  async sameConfigReturnsSamePool() {
    const a = acquirePool(cfg);
    const b = acquirePool(cfg);
    assert.strictEqual(a, b, "same config must return the same pool instance");
    await releasePool(cfg);
    await releasePool(cfg);
  }

  @test
  async keyIsOrderInsensitive() {
    const k1 = poolKey({ host: "h", user: "u", database: "d" });
    const k2 = poolKey({ database: "d", host: "h", user: "u" });
    assert.strictEqual(k1, k2, "key order should not affect the registry hash");
  }

  @test
  async differentConfigReturnsDifferentPool() {
    const a = acquirePool(cfg);
    const b = acquirePool({ ...cfg, database: "other" });
    assert.notStrictEqual(a, b, "different configs must produce distinct pools");
    await releasePool(cfg);
    await releasePool({ ...cfg, database: "other" });
  }

  @test
  async refcountKeepsPoolAliveUntilLastRelease() {
    const a = acquirePool(cfg);
    acquirePool(cfg); // refcount = 2

    await releasePool(cfg); // refcount = 1, pool still alive
    // Re-acquiring after partial release returns the same pool.
    const c = acquirePool(cfg);
    assert.strictEqual(a, c, "pool should still be alive while refcount > 0");

    await releasePool(cfg); // refcount = 1
    await releasePool(cfg); // refcount = 0, pool ends

    // After full release, a fresh acquisition produces a new pool.
    const d = acquirePool(cfg);
    assert.notStrictEqual(a, d, "after final release a new pool must be created");
    await releasePool(cfg);
  }

  @test
  async releasingUnknownConfigIsNoop() {
    // Should not throw — `stop()` paths call this unconditionally.
    await releasePool({ host: "never-acquired", database: "x" });
  }

  @test
  async secretStringPassword() {
    const secretCfg: any = { ...cfg, password: new SecretString("webda.io", "test") };
    // Keyed by the plain value: same pool as the plain config, distinct from another password
    assert.strictEqual(poolKey(secretCfg), poolKey(cfg));
    assert.notStrictEqual(poolKey(secretCfg), poolKey({ ...cfg, password: new SecretString("other", "test") }));
    const a = acquirePool(secretCfg);
    assert.strictEqual((a as any).options.password, "webda.io", "pg must receive the plain password");
    assert.strictEqual(acquirePool(cfg), a);
    await releasePool(secretCfg);
    await releasePool(secretCfg);
    // Fully released: a new pool is created
    const b = acquirePool(secretCfg);
    assert.notStrictEqual(a, b);
    await releasePool(secretCfg);
  }

  @test
  async unitEdgeCases() {
    // 1. pgpool array & function serialization and __resetPools error swallow
    const keyWithArrAndFn = poolKey({ arr: ["a", "b"], fn: () => {} } as any);
    assert.ok(keyWithArrAndFn.includes('["a","b"]'));
    assert.ok(!keyWithArrAndFn.includes("fn"));
    const p1 = acquirePool({ ...cfg, database: "reset-1" });
    p1.end = (async () => {
      throw new Error("end failed");
    }) as any;
    await __resetPools();
    const p2 = acquirePool({ ...cfg, database: "release-err" });
    p2.end = (async () => {
      throw new Error("release end failed");
    }) as any;
    await releasePool({ ...cfg, database: "release-err" });

    // 2. PostgresListener unit edge cases with fake pg.Client
    const origClient = pg.Client;
    let lastClient: any;
    let failConnect = false;
    class FakeClient extends EventEmitter {
      async connect() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        lastClient = this;
        if (failConnect) throw new Error("connect failed");
      }
      async query(sql: string) {
        if (sql.startsWith("UNLISTEN")) throw new Error("unlisten failed");
        return { rows: [{ count: "0" }] };
      }
      async end() {
        throw new Error("end failed");
      }
    }
    (pg as any).Client = FakeClient;
    try {
      const payloads: string[] = [];
      let reconnected = 0;
      let disconnected = 0;
      const listener = new PostgresListener(cfg, "chan_a", {
        name: "TestListener",
        reconnectDelay: 0,
        onNotification: p => payloads.push(p),
        onReconnect: () => reconnected++,
        onDisconnect: () => disconnected++
      });
      await listener.connect();
      assert.strictEqual(listener.connected, true);
      lastClient.emit("notification", { channel: "other", payload: "ignored" });
      lastClient.emit("notification", { channel: "chan_a", payload: undefined });
      lastClient.emit("error", new Error("sock err"));
      assert.deepStrictEqual(payloads, [""]);

      // Disconnect & reconnect success, then reconnect failure
      lastClient.emit("end");
      await new Promise(r => setTimeout(r, 300));
      assert.strictEqual(disconnected, 1);
      assert.strictEqual(reconnected, 1);

      failConnect = true;
      lastClient.emit("end");
      await new Promise(r => setTimeout(r, 300));
      failConnect = false;

      // Stop swallows UNLISTEN & end errors and ignores subsequent handleDisconnect
      await listener.connect();
      await listener.stop();
      (listener as any).handleDisconnect();

      // 3. PostgresPubSubService dispatch edge cases
      const pubsub = new PostgresPubSubService("MyPubSub", new PostgresPubSubParameters().load({}));
      assert.strictEqual((pubsub as any).channel(), "mypubsub");
      const received: any[] = [];
      pubsub.consume(async ev => {
        received.push(ev);
        if (ev === "fail") throw new Error("cb err");
      });
      (pubsub as any).dispatch("");
      (pubsub as any).dispatch("{invalid json");
      (pubsub as any).dispatch(JSON.stringify("fail"));
      await new Promise(r => setTimeout(r, 20));
      assert.deepStrictEqual(received, [undefined, "fail"]);

      // 4. PostgresQueueService edge cases (usePool: false, disconnected guards, listen failure)
      const q = new PostgresQueueService(
        "MyQueue",
        new PostgresQueueParameters().load({ usePool: false, maxConsumers: 20, batchSize: 5 })
      );
      assert.strictEqual(await q.size(), 0);
      await q.__clean();
      await assert.rejects(() => (q as any).lockMessages(), /not connected/);
      await assert.rejects(() => q.deleteMessage("1"), /not connected/);
      assert.strictEqual(q.getMaxConsumers(), 4);

      await q.init();
      (q as any).client.query = async () => {
        throw new Error("truncate err");
      };
      await q.__clean();
      failConnect = true;
      (q as any).listen();
      await (q as any).listening;
      assert.strictEqual((q as any).listener, undefined);
      failConnect = false;
      await q.stop();

      // 5. PostgresStore edge cases (getIsolationLevel, openTransaction error/BEGIN failure, createViews)
      const store = new PostgresStore(
        "ViewStore",
        new PostgresParameters().load({
          usePool: true,
          viewPrefix: "v_",
          views: [".*"],
          models: ["Webda/User", "Webda/OwnerModel"]
        })
      );
      this.registerService(store as any, "ViewStore");
      store.resolve();
      store.getParameters().transactionIsolation = "INVALID" as any;
      assert.throws(() => (store as any).getIsolationLevel(), /Invalid transactionIsolation/);
      store.getParameters().transactionIsolation = "READ COMMITTED";

      const txConn: any = new EventEmitter();
      txConn.release = () => {};
      txConn.query = async (sql: string) => {
        if (sql.startsWith("BEGIN")) throw new Error("begin failed");
      };
      store.client = {
        connect: async () => txConn,
        query: async (sql: string) => {
          if (sql.includes("CREATE OR REPLACE VIEW v_viewroots")) throw new Error("view err");
          return { rows: [] };
        }
      } as any;
      await assert.rejects(() => (store as any).openTransaction(), /begin failed/);
      txConn.query = async () => ({ rows: [] });
      const opened = await (store as any).openTransaction();
      txConn.emit("error", new Error("lost"));
      opened.release("non-error-truthy");

      // Exercise createViews with mock schema properties covering number, boolean, string, array, object
      const modelsMap: any = useApplication().getModels();
      class ViewRoot {
        static Metadata = {
          Identifier: "Test/ViewRoot",
          PrimaryKey: ["uuid"],
          Schemas: {
            Stored: {
              properties: {
                uuid: { type: "string" },
                "bad field!": { type: "string" },
                age: { type: "number" },
                active: { type: "boolean" },
                name: { type: "string" },
                tags: { type: "array" },
                profile: { type: "object" }
              }
            }
          }
        };
      }
      class ViewChild extends ViewRoot {
        static Metadata = {
          Identifier: "Test/ViewChild",
          ShortName: "ViewChild",
          PrimaryKey: ["uuid"],
          Schemas: ViewRoot.Metadata.Schemas
        };
      }
      modelsMap["Test/ViewRoot"] = ViewRoot;
      modelsMap["Test/ViewChild"] = ViewChild;
      store.handleModel = (m: any) => (m === ViewRoot ? 0 : m === ViewChild ? 1 : -1);
      try {
        await store.createViews();
      } finally {
        delete modelsMap["Test/ViewRoot"];
        delete modelsMap["Test/ViewChild"];
      }

      // Single-client stop error swallow and migrate wrapper
      (store as any).migrateCommand = async () => 0;
      assert.strictEqual(await store.migrate(true), 0);
      store.client = new FakeClient() as any;
      await store.stop();

      // 6. PostgresRelationalStore wrappers (ensureTable, createViews, init error, CLI command wrappers)
      const rel = new PostgresRelationalStore("RelUnit", new PostgresRelationalParameters().load({ models: [] }));
      await rel.ensureTable();
      await rel.createViews();
      let closed = 0;
      (FakeClient.prototype as any).end = async () => {
        closed++;
      };
      (rel as any).relational.schemaCommand = async (_s: any, _d: any, _j: any, connect: any) => {
        const c = await connect();
        await c.close();
        return 0;
      };
      (rel as any).relational.checkCommand = async () => 0;
      (rel as any).relational.contractCommand = async (_dr: any, connect: any) => {
        const c = await connect();
        await c.close();
        return 0;
      };
      (rel as any).relational.retireCommand = async () => 0;
      (rel as any).relational.backfillCommand = async (_t: any, _f: any, _to: any, _b: any, connect: any) => {
        const c = await connect();
        await c.close();
        return 0;
      };
      assert.strictEqual(await rel.schema(), 0);
      assert.strictEqual(await rel.schemaCheck(), 0);
      assert.strictEqual(await rel.schemaContract(), 0);
      assert.strictEqual(await rel.schemaRetire("v1"), 0);
      assert.strictEqual(await rel.schemaBackfill("t", "a", "b"), 0);
      assert.strictEqual(closed, 3);
    } finally {
      (pg as any).Client = origClient;
    }
  }
}
