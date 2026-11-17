import { SecretString, useApplication } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import { EventEmitter } from "node:events";
import * as assert from "node:assert";
import pg from "pg";
import { PostgresListener } from "./pglisten.js";
import { __resetPools, acquirePool, connectSingleConnectionPool, poolKey, releasePool } from "./pgpool.js";
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

  /**
   * Kill the connection of a pool of one connection from another session, as a server restart or a failover would,
   * and wait for the pool to drop it.
   *
   * It waits on `remove` with a plain listener, never on `error` (nor `events.once`, which listens to `error` too):
   * that would hide a pool without its own listener, whose unhandled `error` event crashes the process
   * @param pool - the pool, holding one idle connection
   * @returns the process id of the killed backend
   */
  async loseConnection(pool: pg.Pool): Promise<number> {
    const { rows } = await pool.query("SELECT pg_backend_pid() AS pid");
    const pid = rows[0].pid;
    const removed = new Promise(resolve => pool.once("remove", resolve));
    const admin = new pg.Client(cfg);
    await admin.connect();
    try {
      await admin.query("SELECT pg_terminate_backend($1)", [pid]);
    } finally {
      await admin.end();
    }
    await removed;
    return pid;
  }

  /**
   * The process id of the backend serving the next statement of a pool
   * @param pool - the pool
   * @returns the process id
   */
  async backendPid(pool: pg.Pool): Promise<number> {
    return (await pool.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  }

  @test
  async sharedPoolSurvivesALostConnection() {
    const pool = acquirePool(cfg);
    const lost = await this.loseConnection(pool);
    assert.notStrictEqual(await this.backendPid(pool), lost, "the pool opens a new connection");
    await releasePool(cfg);
  }

  @test
  async singleConnectionPoolFailsFastAndKeepsItsConnection() {
    await assert.rejects(() => connectSingleConnectionPool({ ...cfg, port: 1 }), "an unreachable server fails at init");
    const pool = await connectSingleConnectionPool({ ...cfg, max: 5 });
    try {
      assert.strictEqual(pool.options.max, 1);
      assert.strictEqual(pool.totalCount, 1, "connected at creation");
      assert.strictEqual(pool.options.idleTimeoutMillis, 0, "kept open while idle, like a client");
    } finally {
      await pool.end();
    }
  }

  @test
  async singleConnectionStoreReconnects() {
    const store = await this.addService(
      PostgresStore,
      { postgresqlServer: cfg, usePool: false, autoCreateTable: false, table: "idents", models: ["Webda/OwnerModel"] },
      "reconnectStore"
    );
    try {
      const lost = await this.loseConnection(store.getClient());
      assert.notStrictEqual(await this.backendPid(store.getClient()), lost, "the store opens a new connection");
    } finally {
      await store.stop();
    }
  }

  @test
  async singleConnectionQueueReconnects() {
    const queue = new PostgresQueueService(
      "reconnectQueue",
      new PostgresQueueParameters().load({ postgresqlServer: cfg, usePool: false, table: "webda_reconnect_queue" })
    );
    await this.registerService(queue as any, "reconnectQueue")
      .resolve()
      .init();
    try {
      await queue.sendMessage({ before: true });
      await this.loseConnection((queue as any).client);
      await queue.sendMessage({ after: true });
      assert.strictEqual(await queue.size(), 2);
    } finally {
      await (queue as any).client.query("DROP TABLE IF EXISTS webda_reconnect_queue");
      await queue.stop();
    }
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
    // The single connection modes open a pool of one connection: backed by the fake client too
    const origPool = pg.Pool;
    class FakePool extends EventEmitter {
      client = new FakeClient();
      async connect() {
        await this.client.connect();
        return Object.assign(this.client, { release: () => {} });
      }
      query(sql: string) {
        return this.client.query(sql);
      }
      async end() {}
    }
    (pg as any).Pool = FakePool;
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
      (pg as any).Pool = origPool;
    }
  }

  @test
  async unitDefaultsAndGuards() {
    // A missing config is keyed like an empty one: pg reads the PG* environment variables
    assert.strictEqual(poolKey(undefined), poolKey({}));

    const origClient = pg.Client;
    const clients: any[] = [];
    let failConnect = false;
    class FakeClient extends EventEmitter {
      queries: string[] = [];
      async connect() {
        clients.push(this);
        if (failConnect) throw new Error("connect failed");
      }
      async query(sql: string) {
        this.queries.push(sql);
        return { rows: [], rowCount: 0 };
      }
      async end() {}
    }
    (pg as any).Client = FakeClient;
    // The single connection modes open a pool of one connection: backed by the fake client too
    const origPool = pg.Pool;
    class FakePool extends EventEmitter {
      client = new FakeClient();
      async connect() {
        await this.client.connect();
        return Object.assign(this.client, { release: () => {} });
      }
      query(sql: string) {
        return this.client.query(sql);
      }
      async end() {}
    }
    (pg as any).Pool = FakePool;
    try {
      // 1. PostgresListener: a stop during the reconnect delay cancels the reconnect, a second stop is a no-op
      const listener = new PostgresListener(cfg, "chan_stop", {
        name: "StoppedListener",
        reconnectDelay: 0,
        onNotification: () => {}
      });
      await listener.connect();
      assert.strictEqual(clients.length, 1);
      clients[0].emit("end");
      assert.strictEqual(listener.connected, false);
      await listener.stop();
      await listener.stop();
      await new Promise(r => setTimeout(r, 300));
      assert.strictEqual(clients.length, 1, "no reconnect once stopped");

      // 2. PostgresPubSubService: stopping a service that never listened nor published
      const pubsub = new PostgresPubSubService("IdlePubSub", new PostgresPubSubParameters().load({}));
      pubsub.consume(async () => {});
      await pubsub.stop();
      assert.strictEqual((pubsub as any).callbacks.size, 0);

      // 3. PostgresQueueService without table creation, with several consumers on one LISTEN connection
      clients.length = 0;
      const queue = new PostgresQueueService(
        "ManualQueue",
        new PostgresQueueParameters().load({ usePool: false, autoCreateTable: false, waitTimeout: 0.05 })
      );
      this.registerService(queue as any, "ManualQueue");
      await queue.resolve().init();
      assert.deepStrictEqual(clients[0].queries, [], "no DDL without autoCreateTable");
      const first = queue.consume(async () => {});
      const second = queue.consume(async () => {});
      await (queue as any).listening;
      assert.strictEqual(clients.length, 2, "one client for the queue, one LISTEN connection for every consumer");
      assert.deepStrictEqual(clients[1].queries, ["LISTEN webda_queue"]);
      assert.strictEqual((queue as any).consumers, 2);
      // Cancelling twice counts once
      await first.cancel();
      await first.cancel();
      assert.strictEqual((queue as any).consumers, 1);
      await second.cancel();
      assert.strictEqual((queue as any).consumers, 0);
      await queue.stop();

      // A LISTEN connection failing after the queue stopped leaves the stopped state alone
      const stopped = new PostgresQueueService(
        "StoppedQueue",
        new PostgresQueueParameters().load({ usePool: false, autoCreateTable: false })
      );
      await stopped.init();
      failConnect = true;
      (stopped as any).listen();
      const listening = (stopped as any).listening;
      await stopped.stop();
      await listening;
      failConnect = false;
      assert.strictEqual((stopped as any).listener, undefined);

      // 4. PostgresStore.createViews: models without usable metadata are skipped, untyped fields are not cast
      const store = new PostgresStore(
        "DefaultViewStore",
        new PostgresParameters().load({ usePool: true, viewPrefix: "dv_", models: ["Webda/OwnerModel"] })
      );
      this.registerService(store as any, "DefaultViewStore");
      store.resolve();
      const queries: string[] = [];
      store.client = {
        query: async (sql: string) => {
          queries.push(sql);
          return { rows: [] };
        }
      } as any;
      const modelsMap: any = useApplication().getModels();
      const Stored = { properties: { uuid: { type: "string" }, misc: {}, age: { type: "number" } } };
      class DefaultViewRoot {
        static Metadata = { Identifier: "Test/DefaultViewRoot", PrimaryKey: ["uuid"], Schemas: { Stored } };
      }
      class DefaultViewChild extends DefaultViewRoot {
        static Metadata = { Identifier: "Test/DefaultViewChild", PrimaryKey: ["uuid"], Schemas: { Stored } };
      }
      class NoIdentifier {
        static Metadata = {};
      }
      class NoSchema {
        static Metadata = { Identifier: "Test/DefaultViewNoSchema" };
      }
      class NoProperties {
        static Metadata = { Identifier: "Test/DefaultViewNoProperties", Schemas: { Stored: {} } };
      }
      const fixtures: Record<string, any> = {
        "Test/DefaultViewRoot": DefaultViewRoot,
        "Test/DefaultViewChild": DefaultViewChild,
        "Test/DefaultViewGone": undefined,
        "Test/DefaultViewNoIdentifier": NoIdentifier,
        "Test/DefaultViewNoSchema": NoSchema,
        "Test/DefaultViewNoProperties": NoProperties
      };
      Object.assign(modelsMap, fixtures);
      store.handleModel = (m: any) =>
        m === DefaultViewRoot ? 0 : m === DefaultViewChild ? 1 : [NoSchema, NoProperties].includes(m) ? 0 : -1;
      try {
        // Every model matches when `views` is not set
        store.getParameters().views = undefined;
        await store.createViews();
        assert.deepStrictEqual(
          queries.filter(q => q.startsWith("CREATE")),
          [
            "CREATE OR REPLACE VIEW dv_defaultviewroots AS SELECT uuid,(data->>'misc') as misc,(data->>'age')::bigint as age FROM test_defaultviewroot",
            "CREATE OR REPLACE VIEW dv_defaultviewchilds AS SELECT uuid,(data->>'misc') as misc,(data->>'age')::bigint as age FROM test_defaultviewchild WHERE (data#>>'{__type}') = 'Test/DefaultViewChild'"
          ]
        );
        // Only the models matching `views` get a view
        queries.length = 0;
        store.getParameters().views = ["^Test/DefaultViewChild$"];
        await store.createViews();
        assert.deepStrictEqual(queries.slice(0, 1), ["DROP VIEW IF EXISTS dv_defaultviewchilds"]);
        assert.strictEqual(queries.length, 2);
      } finally {
        for (const name of Object.keys(fixtures)) {
          delete modelsMap[name];
        }
        store.client = undefined;
      }
    } finally {
      (pg as any).Client = origClient;
      (pg as any).Pool = origPool;
    }
  }
}
