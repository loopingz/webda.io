import { WebdaError, useApplication, useCore, useModel, useRepository } from "@webda/core";
import type { Store } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { SchemaIncompatibleError, SchemaVersion, describeStep } from "@webda/sql";
import {
  POST_V2,
  RELATIONAL_MODELS,
  RelPost,
  RelTag,
  RelUser,
  postVersion,
  registerRelationalFixtures,
  relationalMetadata
} from "@webda/sql/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { __resetDatabases } from "../dbregistry.js";
import { SQLiteRelationalParameters, SQLiteRelationalStore } from "../sqliterelationalstore.service.js";
import { SQLiteStore, SQLiteStoreParameters } from "../sqlitestore.service.js";

/**
 * The multi-version registry on SQLite: two application versions on one database file, the registry on the same
 * database, the contract phase with what SQLite can and cannot apply
 */
@suite
export class SQLiteSchemaVersionsTest extends WebdaApplicationTest {
  stores: SQLiteRelationalStore[] = [];
  logs: string[] = [];
  output: string[] = [];
  consoleLog = console.log;
  registry?: Store;

  async beforeEach() {
    await super.beforeEach();
    registerRelationalFixtures(useApplication());
    this.logs = [];
    this.output = [];
    console.log = (...args: any[]) => this.output.push(args.join(" "));
  }

  async afterEach() {
    console.log = this.consoleLog;
    for (const store of this.stores) {
      await store.stop();
      delete useCore().getServices()[store.getName()];
    }
    this.stores = [];
    useApplication().addModel("Rel/Post", RelPost, relationalMetadata()["Rel/Post"]);
    if (this.registry) {
      this.registerService(this.registry, "Registry");
      this.registry = undefined;
    } else {
      for (const version of await this.versions()) {
        await useRepository(useModel("Webda/SchemaVersion") as any).delete(version.uuid as any);
      }
    }
    __resetDatabases();
    await super.afterEach();
  }

  /**
   * A store on the `versions` database, resolved with its plan built from the current metadata, not initialized
   * @param name - the service name
   * @param extra - parameters
   * @returns the store
   */
  store(name: string, extra: Record<string, any> = {}): SQLiteRelationalStore {
    const store = new SQLiteRelationalStore(
      name,
      new SQLiteRelationalParameters().load({
        database: { name: "versions" },
        models: RELATIONAL_MODELS,
        schemaSync: "alter",
        ...extra
      })
    );
    this.registerService(store as any, name);
    this.stores.push(store);
    store.resolve();
    (store as any).relational.versions.options.store = "relational";
    store.log = (level: any, ...args: any[]) => void this.logs.push(`${level} ${args.join(" ")}`);
    store.getSchemaPlan();
    return store;
  }

  /**
   * @param name - the service name
   * @param extra - parameters
   * @returns the initialized store
   */
  async start(name: string, extra: Record<string, any> = {}): Promise<SQLiteRelationalStore> {
    return this.store(name, extra).init();
  }

  /**
   * @returns the versions of the store `relational` in the Registry
   */
  async versions(): Promise<SchemaVersion[]> {
    const { results } = await useRepository(useModel("Webda/SchemaVersion") as any).query("store = 'relational'");
    return results.map((r: any) => new SchemaVersion(r)).sort((a, b) => a.appVersion.localeCompare(b.appVersion));
  }

  /**
   * @param store - a store
   * @param table - a table
   * @returns its column names, empty when it does not exist
   */
  async columns(store: SQLiteRelationalStore, table: string): Promise<string[]> {
    return (await store.getClient()!.query(`PRAGMA table_info("${table}")`)).rows.map(r => r.name);
  }

  @test
  async twoVersionsWithTheRegistryOnTheSameDatabase() {
    // The Registry is a JSON SQLiteStore on the same database: read and written outside the schema mutex
    this.registry = useCore().getService("Registry");
    const registry = new SQLiteStore("Registry", new SQLiteStoreParameters().load({ database: { name: "versions" } }));
    this.registerService(registry as any, "Registry");
    await registry.resolve().init();
    const v1 = await this.start("relational", { appVersion: "1.0.0" });
    assert.ok(!this.logs.some(l => l.includes("Registry is in memory")));
    await v1.getRepository(RelUser as any).create({ uuid: "u1", name: "alice" } as any);
    await v1.getRepository(RelTag as any).create({ uuid: "t1", label: "x" } as any);
    const postsV1 = v1.getRepository(RelPost as any);
    await postsV1.create({ uuid: "p1", title: "Hello", author: "u1", tags: ["t1"], v1only: "kept" } as any);
    useApplication().addModel("Rel/Post", RelPost, postVersion(POST_V2));
    const v2 = await this.start("relational-v2", { appVersion: "2.0.0" });
    const applied = (v2 as any).relational.appliedSteps.map(describeStep) as string[];
    assert.ok(applied.includes("add column rel_post.summary"), applied.join(", "));
    assert.ok(applied.includes("create table rel_post_categories"));
    assert.ok(applied.includes("create index idx_rel_post_editor"), "an index on an existing table runs as is");
    const postsV2 = v2.getRepository(RelPost as any);
    await postsV2.update({
      uuid: "p1",
      title: "Hello v2",
      author: "u1",
      tags: ["t1"],
      summary: "sum",
      editor: "u1",
      categories: [{ uuid: "t1" }],
      v1only: "kept",
      v2only: "also kept"
    } as any);
    await postsV1.update({ uuid: "p1", title: "Hello v1", author: "u1", tags: ["t1"], v1only: "changed" } as any);
    const afterV1: any = await postsV2.get("p1" as any);
    assert.strictEqual(afterV1.title, "Hello v1");
    assert.strictEqual(afterV1.summary, "sum");
    assert.strictEqual(afterV1.editor, "u1");
    assert.deepStrictEqual(
      afterV1.categories.map((c: any) => c.uuid),
      ["t1"]
    );
    assert.strictEqual(afterV1.v1only, "changed");
    assert.strictEqual(afterV1.v2only, "also kept");
    const tables = (
      await registry.getClient()!.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'rel_%'`)
    ).rows.map(r => r.name);
    assert.strictEqual(tables.length, 1, `the JSON table of the registry: ${tables.join(", ")}`);
    const stored = await registry.getClient()!.query(`SELECT count(*) AS n FROM "${tables[0]}"`);
    assert.strictEqual(Number(stored.rows[0].n), 2, "the versions are rows of the JSON registry table");
    assert.deepStrictEqual(
      (await this.versions()).map(v => [v.appVersion, v.status]),
      [
        ["1.0.0", "LIVE"],
        ["2.0.0", "LIVE"]
      ]
    );
    await registry.stop();
  }

  @test
  async concurrentInitsIssueTheDdlOnce() {
    const stores = [this.store("c1", { appVersion: "1.0.0" }), this.store("c2", { appVersion: "1.0.0" })];
    useApplication().addModel("Rel/Post", RelPost, postVersion(POST_V2));
    stores.push(
      this.store("c3", { appVersion: "2.0.0" }),
      this.store("c4", { appVersion: "2.0.0" }),
      this.store("c5", { appVersion: "2.0.0" })
    );
    const results = await Promise.allSettled(stores.map(s => s.init()));
    assert.deepStrictEqual(
      results.map(r => (r.status === "rejected" ? String(r.reason) : "ok")),
      stores.map(() => "ok")
    );
    const applied = stores.flatMap(s => (s as any).relational.appliedSteps.map(describeStep) as string[]);
    assert.strictEqual(new Set(applied).size, applied.length, `no statement ran twice: ${applied.join(", ")}`);
    assert.ok((await this.columns(stores[0], "rel_post")).includes("summary"));
    assert.deepStrictEqual(
      (await this.versions()).map(v => v.appVersion),
      ["1.0.0", "2.0.0"]
    );
  }

  @test
  async typeChangeIsRefusedAndContractIsPartial() {
    const v1 = await this.start("relational", { appVersion: "1.0.0" });
    await useRepository(RelPost as any).create({ uuid: "p1", title: "a" } as any);
    useApplication().addModel("Rel/Post", RelPost, postVersion({ properties: { status: { type: "integer" } } }));
    await assert.rejects(
      () => this.start("relational-bad", { appVersion: "2.0.0" }),
      (err: any) => err instanceof WebdaError.FatalInitError && err.cause instanceof SchemaIncompatibleError
    );
    assert.strictEqual(await this.stores[1].schemaCheck(), 1);
    assert.ok(this.output.some(line => line.includes("[BLOCK] TYPE_CHANGED rel_post.status (live 1.0.0)")));
    // v2: a required field more, a field and a map less
    useApplication().addModel(
      "Rel/Post",
      RelPost,
      postVersion({
        properties: { summary: { type: "string" } },
        required: ["uuid", "title", "summary"],
        without: ["order", "reviewers"]
      })
    );
    const v2 = await this.start("relational-v2", { appVersion: "2.0.0" });
    assert.strictEqual(await v2.schemaRetire("1.0.0"), 0);
    this.output = [];
    assert.strictEqual(await v2.schemaContract(true), 0);
    const dry = this.output.join("\n");
    assert.ok(dry.includes(`ALTER TABLE "rel_post" DROP COLUMN "order";`), dry);
    assert.ok(dry.includes(`DROP TABLE IF EXISTS "rel_post_reviewers";`), dry);
    assert.ok(dry.includes("-- set not null rel_post.summary\n-- not supported by this engine"), dry);
    assert.strictEqual(await v2.schemaContract(false), 0);
    assert.ok(!(await this.columns(v2, "rel_post")).includes("order"));
    assert.deepStrictEqual(await this.columns(v2, "rel_post_reviewers"), []);
    assert.ok((await this.columns(v2, "rel_post")).includes("title"));
    // backfill
    await useRepository(RelPost as any).create({ uuid: "p2", title: "b" } as any);
    assert.strictEqual(await v2.schemaBackfill("rel_post", "title", "summary", 1), 0);
    assert.ok(this.output.some(line => line.includes("-- 2 row(s) of rel_post.summary filled from title")));
    const rows = await v2.getClient()!.query(`SELECT "summary" FROM rel_post ORDER BY "uuid"`);
    assert.deepStrictEqual(
      rows.rows.map(r => r.summary),
      ["a", "b"]
    );
    await v1.stop();
  }
}
