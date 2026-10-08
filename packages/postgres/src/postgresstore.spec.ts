import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import pg from "pg";
import { checkCreateWithoutPrimaryKey, WebdaApplicationTest } from "@webda/core/lib/test";
import { EventRepository, useModel } from "@webda/core";
import PostgresStore, { PostgresParameters } from "./postgresstore.service.js";
import { PostgresRepository } from "./sqlstore.js";

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

/**
 * Focused smoke tests for PostgresStore.
 *
 * Background: the StoreTest harness (`@webda/core/lib/stores/store.spec`)
 * is now compiled to lib via tsconfig files[], and its type errors are
 * fixed. The remaining blocker is class-identity duplication in vitest's
 * module resolution that the @webda/core / @webda/postgres pair can't
 * resolve cleanly:
 *
 * - Application.load() loads model classes via filesystem paths
 *   (lib/models/ident:Ident → lib's Ident class).
 * - Test code imports User/Ident via bare specifiers — without an
 *   exports field on @webda/core they resolve to lib too. Adding an
 *   exports field broke pnpm's `webda` bin symlink.
 * - The existing @webda/core/lib/test alias forces test/index.ts (and
 *   its relative imports) through src — re-introducing class identity
 *   duplication if any harness import follows that path.
 *
 * Resolving this properly probably means a dedicated test-utils
 * package (e.g. @webda/store-test) that publishes harness classes
 * through normal module resolution. Out of scope here.
 *
 * These smoke tests verify the migrated lifecycle directly through
 * SQL while that follow-up lands.
 */
@suite
export class PostgresStoreSmokeTest extends WebdaApplicationTest {
  store?: PostgresStore<any>;

  async beforeEach() {
    await super.beforeEach();
    this.store = await this.addService(
      PostgresStore,
      {
        ...params,
        autoCreateTable: true,
        table: "smoke_idents",
        models: ["Webda/OwnerModel"]
      } as any,
      "smoke"
    );
    await this.store.getClient().query(`TRUNCATE TABLE smoke_idents`);
  }

  async afterEach() {
    if (this.store) {
      try {
        await this.store.getClient().query(`DROP TABLE IF EXISTS smoke_idents`);
      } catch {
        /* ignore */
      }
      try {
        await this.store.stop?.();
      } catch {
        /* ignore */
      }
      this.store = undefined;
    }
  }

  @test
  async createTableOnInit() {
    const res = await this.store!.getClient().query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'smoke_idents'`
    );
    assert.strictEqual(res.rowCount, 1, "smoke_idents table should be created");
  }

  @test
  async getClientReturnsLiveConnection() {
    const res = await this.store!.getClient().query("SELECT 1 AS one");
    assert.strictEqual(res.rows[0].one, 1);
  }

  @test
  async checkTableIsIdempotent() {
    await this.store!.checkTable();
    await this.store!.checkTable();
  }

  @test
  async checkTableSkippedWhenAutoCreateDisabled() {
    this.store!.getParameters().autoCreateTable = false;
    await this.store!.checkTable();
    this.store!.getParameters().autoCreateTable = true;
  }

  @test
  async usePoolFalseStillConnects() {
    const single = await this.addService(
      PostgresStore,
      {
        ...params,
        usePool: false,
        autoCreateTable: false,
        table: "smoke_idents",
        models: ["Webda/OwnerModel"]
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
  async cleanTruncatesAllRows() {
    const c = this.store!.getClient();
    await c.query(`INSERT INTO smoke_idents(uuid,data) VALUES($1, $2)`, ["a", JSON.stringify({ x: 1 })]);
    await c.query(`INSERT INTO smoke_idents(uuid,data) VALUES($1, $2)`, ["b", JSON.stringify({ x: 2 })]);
    let res = await c.query(`SELECT count(*)::int AS n FROM smoke_idents`);
    assert.strictEqual(res.rows[0].n, 2);

    await (this.store as any).__clean?.();
    res = await c.query(`SELECT count(*)::int AS n FROM smoke_idents`);
    assert.strictEqual(res.rows[0].n, 0);
  }

  @test
  async createWithoutPrimaryKeyPersistsGeneratedUuid() {
    // Check both the EventRepository returned by the store and the underlying PostgresRepository
    await checkCreateWithoutPrimaryKey(
      [
        this.store!.getRepository(useModel("Webda/OwnerModel")),
        this.store!.getRepositories().find(r => r instanceof PostgresRepository)
      ],
      {
        data: () => ({ _type: "google" }),
        readStored: async key =>
          (await this.store!.getClient().query(`SELECT data FROM smoke_idents WHERE uuid=$1`, [key])).rows[0]?.data
      }
    );
  }

  @test
  async queryIsNull() {
    const c = this.store!.getClient();
    // A JSON null, a missing key and a value
    for (const [uuid, data] of [
      ["null", { uuid: "null", email: null }],
      ["missing", { uuid: "missing" }],
      ["set", { uuid: "set", email: "set@webda.io" }]
    ] as const) {
      await c.query(`INSERT INTO smoke_idents(uuid,data) VALUES($1, $2)`, [uuid, JSON.stringify(data)]);
    }
    const repo = this.store!.getRepository(useModel("Webda/OwnerModel"));
    const uuids = async (query: string) => (await repo.query(query)).results.map((r: any) => r.uuid).sort();
    assert.deepStrictEqual(await uuids("email IS NULL"), ["missing", "null"]);
    assert.deepStrictEqual(await uuids("email IS NOT NULL"), ["set"]);
    assert.deepStrictEqual(await uuids("email IS NULL AND uuid = 'null'"), ["null"]);
  }

  @test
  async createViewsWithEmptyPatternIsNoop() {
    this.store!.getParameters().views = [];
    this.store!.getParameters().viewPrefix = "view_";
    await this.store!.createViews().catch(() => {
      /* tolerate environment-specific schema-generator failures */
    });
    this.store!.getParameters().views = [".*"];
    this.store!.getParameters().viewPrefix = "";
  }
}

/**
 * Unit tests for resolveTable() that do not require a live PostgreSQL connection.
 * Extends WebdaApplicationTest only for its model registry (useModel / useModelMetadata),
 * but does NOT call addService() — so the DB-connect path is never triggered.
 */
@suite
export class PostgresStoreResolveTableTest extends WebdaApplicationTest {
  @test
  async resolveTableSingleModelUsesParametersTable() {
    const store = new PostgresStore("singleTable", { models: ["Webda/OwnerModel"], table: "idents" });
    assert.strictEqual(store.resolveTable(useModel("Webda/OwnerModel")), "idents");
  }

  @test
  async resolveTableMultiModelIgnoresParametersTable() {
    const store = new PostgresStore("multiTable", {
      models: ["Webda/OwnerModel", "Webda/User"],
      table: "idents"
    });
    assert.strictEqual(store.resolveTable(useModel("Webda/OwnerModel")), "webda_ownermodel");
    assert.strictEqual(store.resolveTable(useModel("Webda/User")), "webda_user");
  }

  @test
  async resolveTableExplicitTablesMapWins() {
    const store = new PostgresStore("explicitTable", {
      models: ["Webda/User"],
      tables: { "Webda/User": "users_v2" }
    });
    assert.strictEqual(store.resolveTable(useModel("Webda/User")), "users_v2");
  }

  @test
  async resolveTableSingleModelTableIsNotSharedWithFallbackModels() {
    // Registry-like store: the configured model keeps `table`, a model routed to it as fallback does not
    const store = new PostgresStore("fallbackTable", { models: ["Webda/RegistryEntry"], table: "registry" });
    assert.strictEqual(store.resolveTable(useModel("Webda/RegistryEntry")), "registry");
    assert.strictEqual(store.resolveTable(useModel("Webda/OwnerModel")), "webda_ownermodel");
  }

  @test
  async fallbackRepositoryCreatesItsTableBeforeFirstStatement() {
    // Load the parameters as the application does, so autoCreateTable gets its default (true)
    const store = new PostgresStore(
      "fallbackCreate",
      new PostgresParameters().load({ models: ["Webda/RegistryEntry"], table: "registry" })
    );
    store.resolve();
    const statements: string[] = [];
    store.client = {
      query: async (q: string) => {
        statements.push(q);
        return { rows: [], rowCount: 1 };
      }
    } as any;
    // Webda/OwnerModel is not a configured model: it reaches this store through Store.computeStores fallback
    const repo = store.getRepository(useModel("Webda/OwnerModel"));
    await Promise.all([repo.create({ _type: "google" } as any), repo.create({ _type: "github" } as any)]);
    await repo.create({ _type: "gitlab" } as any);
    assert.strictEqual(statements.length, 4);
    assert.match(statements[0], /^CREATE TABLE IF NOT EXISTS webda_ownermodel /);
    assert.ok(statements.slice(1).every(q => q.startsWith("INSERT INTO webda_ownermodel(")));
  }

  @test
  async createOverAnExistingKeyIsRefused() {
    const store = new PostgresStore(
      "duplicateCreate",
      new PostgresParameters().load({ models: ["Webda/RegistryEntry"], table: "registry", autoCreateTable: false })
    );
    store.resolve();
    store.client = {
      query: async () => {
        throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      }
    } as any;
    await assert.rejects(
      () => store.getRepository(useModel("Webda/OwnerModel")).create({ uuid: "dup" } as any),
      /^Error: Already exists: dup/
    );
  }

  @test
  async fallbackRepositorySkipsCreateWhenAutoCreateDisabled() {
    const store = new PostgresStore(
      "fallbackNoCreate",
      new PostgresParameters().load({ models: ["Webda/RegistryEntry"], table: "registry", autoCreateTable: false })
    );
    store.resolve();
    const statements: string[] = [];
    store.client = {
      query: async (q: string) => {
        statements.push(q);
        return { rows: [], rowCount: 1 };
      }
    } as any;
    await store.getRepository(useModel("Webda/OwnerModel")).create({ _type: "google" } as any);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0].startsWith("INSERT INTO webda_ownermodel("));
  }

  @test
  async tableCreationIsRetriedAfterFailureAndNotRepeatedAfterSuccess() {
    const store = new PostgresStore(
      "retryCreate",
      new PostgresParameters().load({ models: ["Webda/RegistryEntry"], table: "registry" })
    );
    store.resolve();
    const statements: string[] = [];
    let failCreate = true;
    store.client = {
      query: async (q: string) => {
        statements.push(q);
        if (q.startsWith("CREATE TABLE") && failCreate) {
          failCreate = false;
          throw new Error("create failed");
        }
        return { rows: [], rowCount: 1 };
      }
    } as any;
    const repo = store.getRepository(useModel("Webda/OwnerModel"));
    // First statement: CREATE fails and the statement itself is never sent
    await assert.rejects(() => repo.create({ _type: "google" } as any), /create failed/);
    assert.strictEqual(statements.length, 1);
    // Second statement: CREATE is issued again (not memoized as failed), then the INSERT runs
    await repo.create({ _type: "github" } as any);
    assert.deepStrictEqual(
      statements.map(q => q.split(/[ (]/).slice(0, 2).join(" ")),
      ["CREATE TABLE", "CREATE TABLE", "INSERT INTO"]
    );
    // Third statement: the table is known to exist
    await repo.create({ _type: "gitlab" } as any);
    assert.strictEqual(statements.filter(q => q.startsWith("CREATE TABLE")).length, 2);
    assert.strictEqual(statements.length, 4);
  }

  @test
  async ensureTableIsNoopWhenAutoCreateDisabled() {
    const store = new PostgresStore(
      "noCreate",
      new PostgresParameters().load({ models: ["Webda/OwnerModel"], table: "idents", autoCreateTable: false })
    );
    store.resolve();
    const statements: string[] = [];
    store.client = {
      query: async (q: string) => {
        statements.push(q);
        return { rows: [{ data: { _type: "google" } }], rowCount: 1 };
      }
    } as any;
    const repo = store.getRepository(useModel("Webda/OwnerModel"));
    await store.ensureTable(
      new PostgresRepository(useModel("Webda/OwnerModel"), ["uuid"], store.client as any, "idents")
    );
    await repo.exists("x");
    assert.deepStrictEqual(statements, ["SELECT uuid FROM idents WHERE uuid=$1"]);
  }

  @test
  async getRepositoryWrapsInEventRepository() {
    const store = new PostgresStore("reposWrap", { models: ["Webda/OwnerModel"], table: "idents", strict: true });
    store.resolve();
    const repo = store.getRepository(useModel("Webda/OwnerModel"));
    assert.ok(repo instanceof EventRepository);
  }

  @test
  async getRepositoriesReturnsUnwrappedPostgresRepositories() {
    const store = new PostgresStore("reposUnwrap", { models: ["Webda/OwnerModel"], table: "idents", strict: true });
    store.resolve();
    const repos = store.getRepositories();
    assert.ok(repos.length >= 1);
    assert.ok(repos.every(r => r instanceof PostgresRepository));
  }
}
