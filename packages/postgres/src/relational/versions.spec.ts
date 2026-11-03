import { ServiceParameters, WebdaError, useApplication, useCore, useModel, useRepository } from "@webda/core";
import type { Application, Store } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { SchemaIncompatibleError, SchemaRegistryError, SchemaVersion, describeStep } from "@webda/sql";
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
import pg from "pg";
import { dropRelationalTables, params } from "../../test/relational-helpers.js";
import { PostgresRelationalStore } from "../postgresrelationalstore.service.js";

/**
 * The multi-version registry of the relational store: two application versions on one database, the compatibility
 * check, the `schema check | contract | retire | backfill` commands, the online DDL
 */
@suite
export class PostgresSchemaVersionsTest extends WebdaApplicationTest {
  admin!: pg.Client;
  stores: PostgresRelationalStore[] = [];
  logs: string[] = [];
  output: string[] = [];
  consoleLog = console.log;

  async tweakApp(app: any) {
    await super.tweakApp(app);
    registerRelationalFixtures(app as Application);
  }

  async beforeEach() {
    await super.beforeEach();
    this.admin = new pg.Client(params.postgresqlServer);
    await this.admin.connect();
    await this.drop();
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
    this.post(relationalMetadata()["Rel/Post"]);
    // The Registry of the test application outlives the test
    for (const version of await this.versions()) {
      await useRepository(useModel("Webda/SchemaVersion") as any).delete(version.uuid as any);
    }
    await this.drop();
    await this.admin.end();
    await super.afterEach();
  }

  /**
   * Drop the fixture tables and the junction of v2
   */
  async drop(): Promise<void> {
    await this.admin.query(`DROP TABLE IF EXISTS "rel_post_categories" CASCADE`);
    await dropRelationalTables(this.admin);
  }

  /**
   * Register the metadata of Rel/Post the next store builds its plan from
   * @param meta - the metadata
   */
  post(meta: any): void {
    useApplication().addModel("Rel/Post", RelPost, meta);
  }

  /**
   * A store, resolved with its plan built from the current metadata, not initialized
   * @param name - the service name
   * @param extra - parameters
   * @returns the store
   */
  store(name: string, extra: Record<string, any> = {}): PostgresRelationalStore {
    const store = new PostgresRelationalStore(
      name,
      new ServiceParameters().load({ ...params, models: RELATIONAL_MODELS, schemaSync: "alter", ...extra }) as any
    );
    this.registerService(store, name);
    this.stores.push(store);
    store.resolve();
    // Every store of a test stands for the same store of another application version: one registry key, one lock
    (store as any).relational.versions.options.store = "relational";
    (store as any).relational.manager.options.name = "relational";
    const log = store.log.bind(store);
    store.log = (level: any, ...args: any[]) => {
      this.logs.push(`${level} ${args.join(" ")}`);
      log(level, ...args);
    };
    store.getSchemaPlan();
    return store;
  }

  /**
   * A store initialized with the current metadata
   * @param name - the service name
   * @param extra - parameters
   * @returns the store
   */
  async start(name: string, extra: Record<string, any> = {}): Promise<PostgresRelationalStore> {
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
   * @param table - a table
   * @returns its column names, empty when it does not exist
   */
  async columns(table: string): Promise<string[]> {
    const res = await this.admin.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [table]
    );
    return res.rows.map(r => r.column_name);
  }

  @test
  async twoVersionsShareTheDatabase() {
    const v1 = await this.start("relational", { appVersion: "1.0.0" });
    assert.ok(
      this.logs.some(l => l.includes("Registry is in memory")),
      "a memory registry is announced"
    );
    const users = v1.getRepository(RelUser as any);
    const tags = v1.getRepository(RelTag as any);
    const postsV1 = v1.getRepository(RelPost as any);
    await users.create({ uuid: "u1", name: "alice" } as any);
    await tags.create({ uuid: "t1", label: "x" } as any);
    await postsV1.create({ uuid: "p1", title: "Hello", author: "u1", tags: ["t1"], v1only: "kept" } as any);
    // v2 adds a field, a link and a ManyToMany: alter adds the column, the reference and the junction
    this.post(postVersion(POST_V2));
    const v2 = await this.start("relational-v2", { appVersion: "2.0.0" });
    const applied = (v2 as any).relational.appliedSteps.map(describeStep);
    assert.deepStrictEqual(applied.filter((s: string) => !s.startsWith("create index")).sort(), [
      "add column rel_post.editor",
      "add column rel_post.summary",
      "add foreign key fk_rel_post_categories_post",
      "add foreign key fk_rel_post_categories_tag",
      "add foreign key fk_rel_post_editor",
      "create table rel_post_categories"
    ]);
    assert.ok(applied.some((s: string) => s === "create index idx_rel_post_editor"));
    assert.ok(
      this.logs.some(l => l.includes("add foreign key fk_rel_post_editor (online)")),
      "validated after the DDL"
    );
    assert.ok(
      this.logs.some(l => l.includes("create index idx_rel_post_editor (online)")),
      "built concurrently"
    );
    const validated = await this.admin.query(
      `SELECT convalidated FROM pg_constraint WHERE conname = 'fk_rel_post_editor'`
    );
    assert.strictEqual(validated.rows[0].convalidated, true);
    const nullable = await this.admin.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'rel_post' AND column_name = 'summary'`
    );
    assert.strictEqual(nullable.rows[0].is_nullable, "YES");
    // v2 reads the row of v1: the new fields are absent
    const postsV2 = v2.getRepository(RelPost as any);
    const fromV1: any = await postsV2.get("p1" as any);
    assert.strictEqual(fromV1.title, "Hello");
    assert.strictEqual(fromV1.summary, undefined);
    assert.deepStrictEqual(fromV1.categories ?? [], []);
    assert.strictEqual(fromV1.v1only, "kept");
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
    // v1 replaces the row with its own projection: the columns and the extra keys of v2 survive
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
    const seenByV1: any = await postsV1.get("p1" as any);
    assert.strictEqual(seenByV1.summary, undefined, "v1 does not see the columns of v2");
    // Both versions are live in the Registry, with the instance heartbeat
    const versions = await this.versions();
    assert.deepStrictEqual(
      versions.map(v => [v.appVersion, v.status, v.store]),
      [
        ["1.0.0", "LIVE", "relational"],
        ["2.0.0", "LIVE", "relational"]
      ]
    );
    const registered = (v1 as any).relational.version as SchemaVersion;
    assert.strictEqual(registered.uuid, `relational:1.0.0:${registered.planHash}`);
    assert.ok(registered.instances[useCore().getInstanceId()] instanceof Date);
    const before = registered.lastHeartbeat.getTime();
    await new Promise(resolve => setTimeout(resolve, 5));
    await (v1 as any).relational.versions.heartbeat(registered);
    const [heartbeated] = await this.versions();
    assert.ok(heartbeated.lastHeartbeat.getTime() > before);
    assert.ok(heartbeated.isLive(60000));
    assert.strictEqual(heartbeated.isLive(0, new Date(heartbeated.lastHeartbeat.getTime() + 1)), false);
    // The same version starting again heartbeats its entry instead of creating one
    this.post(relationalMetadata()["Rel/Post"]);
    const again = await this.start("relational-again", { appVersion: "1.0.0" });
    assert.strictEqual((await this.versions()).length, 2);
    assert.strictEqual((again as any).relational.version.uuid, registered.uuid);
  }

  @test
  async concurrentInitsAcrossTwoVersionsIssueTheDdlOnce() {
    const stores = [this.store("c1", { appVersion: "1.0.0" }), this.store("c2", { appVersion: "1.0.0" })];
    this.post(postVersion(POST_V2));
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
    assert.ok(applied.includes("create table rel_post"));
    assert.ok(applied.includes("add column rel_post.summary") || applied.includes("create table rel_post_categories"));
    assert.ok((await this.columns("rel_post")).includes("summary"));
    assert.ok((await this.columns("rel_post_categories")).includes("_position"));
    assert.deepStrictEqual(
      (await this.versions()).map(v => v.appVersion),
      ["1.0.0", "2.0.0"]
    );
  }

  @test
  async typeChangeIsRefusedWhileTheOldVersionIsLive() {
    await this.start("relational", { appVersion: "1.0.0" });
    this.post(postVersion({ properties: { status: { type: "integer" }, summary: { type: "string" } } }));
    const refused = this.store("relational-v2", { appVersion: "2.0.0" });
    await assert.rejects(
      () => refused.init(),
      (err: any) => {
        assert.ok(err instanceof WebdaError.FatalInitError, "the application does not start");
        const cause = err.cause as SchemaIncompatibleError;
        assert.ok(cause instanceof SchemaIncompatibleError);
        assert.strictEqual(cause.getResponseCode(), 409);
        assert.strictEqual(cause.store, "relational");
        assert.deepStrictEqual(
          cause.changes.map(c => [c.code, c.table, c.column, c.version]),
          [["TYPE_CHANGED", "rel_post", "status", "1.0.0"]]
        );
        assert.ok(cause.message.includes("rel_post.status"), cause.message);
        assert.ok(cause.message.includes("live version 1.0.0"), cause.message);
        assert.ok(cause.message.includes("recipe: add a new field"), cause.message);
        return true;
      }
    );
    assert.ok(!(await this.columns("rel_post")).includes("summary"), "the database is untouched");
    assert.strictEqual((await this.versions()).length, 1, "the refused version is not registered");
    // schema check: the same table, for CI
    assert.strictEqual(await refused.schemaCheck(), 1);
    assert.ok(this.output.some(line => line.includes("[BLOCK] TYPE_CHANGED rel_post.status (live 1.0.0)")));
    assert.strictEqual(await refused.schemaCheck(undefined, true), 0, "--force-incompatible");
    assert.ok(this.output.some(line => line.includes("[WARN forced] TYPE_CHANGED")));
    this.output = [];
    assert.strictEqual(await refused.schemaCheck("1.0.0", false, true), 1, "--against an application version");
    const json = JSON.parse(this.output.join("\n"));
    assert.strictEqual(json.appVersion, "2.0.0");
    assert.strictEqual(json.changes.filter((c: any) => c.category === "BLOCK").length, 1);
    assert.strictEqual(await refused.schemaCheck("9.9.9"), 2, "--against an unknown version");
    // The escape hatch: the changes are forced and recorded, by column or by model attribute
    this.post(
      postVersion({
        properties: { status: { type: "integer" }, summary: { type: "string" } },
        without: ["author"],
        links: [{ attribute: "author", model: "Rel/Tag", type: "LINK" }]
      })
    );
    const forced = await this.start("relational-forced", {
      appVersion: "2.0.0",
      allowIncompatible: ["rel_post.status", "Rel/Post.author"]
    });
    assert.ok(this.logs.some(l => l.includes("[WARN forced] TYPE_CHANGED rel_post.status")));
    assert.ok(this.logs.some(l => l.includes("[WARN forced] RELATION_TARGET_CHANGED Rel/Post")));
    assert.deepStrictEqual((forced as any).relational.version.forced, ["rel_post.status", "Rel/Post.author"]);
    assert.ok((await this.columns("rel_post")).includes("summary"));
    // Every live version is compared, the forced one included (its plan differs from the refused one)
    this.output = [];
    assert.strictEqual(await refused.schemaCheck(undefined, false, true), 1);
    const afterForce = JSON.parse(this.output.join("\n"));
    assert.strictEqual(afterForce.live.length, 2);
    assert.deepStrictEqual(
      afterForce.changes.filter((c: any) => c.category !== "SAFE").map((c: any) => [c.code, c.version]),
      [
        ["TYPE_CHANGED", "1.0.0"],
        ["RELATION_TARGET_CHANGED", "2.0.0"]
      ]
    );
    this.output = [];
    assert.strictEqual(await forced.schemaCheck(), 0, "the parameter forces the check too");
    assert.ok(this.output.some(line => line.includes("[WARN forced]")));
  }

  @test
  async heartbeatRunsOnAnInterval() {
    // Nothing registered yet: nothing to compare with
    const unregistered = this.store("relational-first", { appVersion: "0.9.0" });
    assert.strictEqual(await unregistered.schemaCheck(), 0);
    assert.ok(
      this.output.some(line => line.endsWith("against no live version")),
      this.output.join("\n")
    );
    const store = await this.start("relational", { appVersion: "1.0.0", versionHeartbeat: 0.01 });
    const registered = (store as any).relational.version as SchemaVersion;
    const first = registered.lastHeartbeat.getTime();
    await new Promise(resolve => setTimeout(resolve, 60));
    const [beat] = await this.versions();
    assert.ok(beat.lastHeartbeat.getTime() > first, "the interval patched the heartbeat");
    assert.deepStrictEqual(Object.keys(beat.instances), [useCore().getInstanceId()]);
    // An old instance is dropped from the map, a failing patch is only logged
    const repository: any = useRepository(useModel("Webda/SchemaVersion") as any);
    const patch = repository.patch;
    repository.patch = () => Promise.reject(new Error("patch failed"));
    try {
      registered.instances.old = new Date(0);
      await new Promise(resolve => setTimeout(resolve, 40));
      assert.ok(this.logs.some(l => l.includes("heartbeat failed: patch failed")));
      assert.strictEqual(registered.instances.old, undefined);
    } finally {
      repository.patch = patch;
    }
    await store.stop();
    assert.strictEqual((store as any).relational.heartbeat, undefined);
    const silent = await this.start("relational-silent", { appVersion: "1.0.0", versionHeartbeat: 0 });
    assert.strictEqual((silent as any).relational.heartbeat, undefined, "versionHeartbeat 0 starts no interval");
    this.output = [];
    assert.strictEqual(await store.schemaCheck(), 0, "a version alone matches itself");
    assert.ok(this.output.some(line => line === "-- no change"));
    // A command initializes the Registry when it is not running (resolved phase)
    const registry = useCore().getService<Store>("Registry");
    await registry.stop();
    assert.notStrictEqual(registry.getState(), "running");
    assert.strictEqual(await store.schemaCheck(), 0);
    assert.strictEqual(registry.getState(), "running");
  }

  @test
  async registryUnavailableFailsClosed() {
    const repository: any = useRepository(useModel("Webda/SchemaVersion") as any);
    const query = repository.query;
    repository.query = () => Promise.reject(new Error("registry down"));
    try {
      await assert.rejects(
        () => this.start("relational", { appVersion: "1.0.0" }),
        (err: any) => {
          assert.ok(err instanceof WebdaError.FatalInitError);
          assert.ok(err.cause instanceof SchemaRegistryError);
          assert.strictEqual(err.cause.code, "SCHEMA_REGISTRY_UNAVAILABLE");
          assert.ok(err.message.includes("registry down"));
          return true;
        }
      );
      assert.deepStrictEqual(await this.columns("rel_post"), [], "no DDL ran");
    } finally {
      repository.query = query;
    }
    // The registration is part of the DDL transaction: a registry write failure rolls the DDL back
    const create = repository.create;
    repository.create = () => Promise.reject(new Error("registry write failed"));
    try {
      await assert.rejects(
        () => this.start("relational-rollback", { appVersion: "1.0.0" }),
        (err: any) => err.cause instanceof SchemaRegistryError && err.message.includes("registry write failed")
      );
      assert.deepStrictEqual(await this.columns("rel_post"), [], "the DDL is rolled back");
    } finally {
      repository.create = create;
    }
    // Listing the registry model in a relational store is refused
    assert.throws(
      () => this.store("wrong", { models: [...RELATIONAL_MODELS, "Webda/SchemaVersion"] }),
      (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_SCHEMA_VERSION_MODEL"
    );
    // Other init errors pass through
    await assert.rejects(
      () => this.start("relational-bad", { postgresqlServer: { ...params.postgresqlServer, password: "wrong" } }),
      (err: any) => !(err instanceof WebdaError.FatalInitError)
    );
  }

  @test
  async liveColumnsAreNotDriftAndEveryModeRegisters() {
    const v1 = await this.start("relational", { appVersion: "1.0.0", schemaSync: "create" });
    // v2 drops a field: the column of v1 is not drift
    this.post(postVersion({ without: ["order"] }));
    this.logs = [];
    await this.start("relational-validate", { appVersion: "2.0.0", schemaSync: "validate" });
    const v2none = await this.start("relational-none", { appVersion: "2.0.0", schemaSync: "none" });
    assert.ok(!this.logs.some(l => l.includes("rel_post.order is not in the plan")));
    assert.deepStrictEqual(
      (await this.versions()).map(v => v.appVersion),
      ["1.0.0", "2.0.0"],
      "validate and none register the version"
    );
    assert.strictEqual((v2none as any).relational.version.appVersion, "2.0.0");
    // The DBA's column is
    await this.admin.query(`ALTER TABLE rel_post ADD COLUMN dba text`);
    const v2alter = await this.start("relational-alter", { appVersion: "2.0.0" });
    assert.ok(this.logs.some(l => l.includes("rel_post.dba is not in the plan")));
    assert.ok(!this.logs.some(l => l.includes("rel_post.order is not in the plan")));
    // The command diff reads the live versions too
    this.output = [];
    assert.strictEqual(await v2alter.schema(false, true), 1, "the DBA column is drift");
    assert.ok(this.output.some(line => line.includes("rel_post.dba")));
    assert.ok(!this.output.some(line => line.includes("rel_post.order")));
    await v1.stop();
  }

  @test
  async contractAfterRetire() {
    await this.start("relational", { appVersion: "1.0.0" });
    const posts = useRepository(RelPost as any);
    await posts.create({ uuid: "p1", title: "a" } as any);
    await posts.create({ uuid: "p2", title: "b" } as any);
    // v2: a required field more, a field and a map less
    this.post(
      postVersion({
        properties: { summary: { type: "string" } },
        required: ["uuid", "title", "summary"],
        without: ["order", "reviewers"]
      })
    );
    const v2 = await this.start("relational-v2", { appVersion: "2.0.0" });
    // While v1 is live: only the NOT NULL both versions require, nothing dropped
    this.output = [];
    assert.strictEqual(await v2.schemaContract(true), 0);
    assert.deepStrictEqual(
      this.output.filter(line => line.startsWith("-- ")),
      ["-- live: 2.0.0, 1.0.0; retired or expired: 0 version(s)", "-- set not null rel_post.title"]
    );
    // v1 retired: its field, its junction and the NOT NULL are proposed
    this.output = [];
    assert.strictEqual(await v2.schemaRetire("1.0.0"), 0);
    assert.ok(this.output[0].startsWith("retired relational:1.0.0:"));
    assert.strictEqual(await v2.schemaRetire("1.0.0"), 0, "retiring twice is fine");
    assert.strictEqual(await v2.schemaRetire("nope"), 1);
    assert.strictEqual((await this.versions()).find(v => v.appVersion === "1.0.0")?.status, "RETIRED");
    await this.admin.query(
      `ALTER TABLE rel_post ADD CONSTRAINT fk_manual FOREIGN KEY ("author") REFERENCES rel_user ("uuid") NOT VALID`
    );
    this.output = [];
    assert.strictEqual(await v2.schemaContract(true), 0);
    const dry = this.output.join("\n");
    assert.ok(dry.includes(`ALTER TABLE "rel_post" DROP COLUMN IF EXISTS "order";`), dry);
    assert.ok(dry.includes(`DROP TABLE IF EXISTS "rel_post_reviewers";`), dry);
    assert.ok(dry.includes(`ALTER TABLE "rel_post" ALTER COLUMN "summary" SET NOT NULL;`), dry);
    assert.ok(dry.includes(`ALTER TABLE "rel_post" ALTER COLUMN "title" SET NOT NULL;`), dry);
    assert.ok(dry.includes(`ALTER TABLE "rel_post" VALIDATE CONSTRAINT "fk_manual";`), dry);
    assert.ok((await this.columns("rel_post")).includes("order"), "a dry run writes nothing");
    // Applied: the null summaries skip their NOT NULL
    this.logs = [];
    assert.strictEqual(await v2.schemaContract(false), 0);
    assert.ok(this.logs.some(l => l.includes("set not null rel_post.summary skipped: 2 null row(s)")));
    assert.ok(!(await this.columns("rel_post")).includes("order"));
    assert.deepStrictEqual(await this.columns("rel_post_reviewers"), []);
    const nullable = await this.admin.query(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'rel_post' AND column_name IN ('title', 'summary')`
    );
    assert.deepStrictEqual(Object.fromEntries(nullable.rows.map(r => [r.column_name, r.is_nullable])), {
      title: "NO",
      summary: "YES"
    });
    const validated = await this.admin.query(`SELECT convalidated FROM pg_constraint WHERE conname = 'fk_manual'`);
    assert.strictEqual(validated.rows[0].convalidated, true);
    // Only the skipped NOT NULL is left, until the column is filled
    this.output = [];
    assert.strictEqual(await v2.schemaContract(true), 0);
    assert.deepStrictEqual(
      this.output.filter(line => line.startsWith("-- ") && !line.startsWith("-- live")),
      ["-- set not null rel_post.summary"]
    );
    assert.strictEqual(await v2.schemaBackfill("rel_post", "title", "summary"), 0);
    assert.strictEqual(await v2.schemaContract(false), 0);
    this.output = [];
    assert.strictEqual(await v2.schemaContract(true), 0);
    assert.ok(this.output.some(line => line === "-- nothing to contract"));
  }

  @test
  async backfillCopiesAColumnByBatches() {
    this.post(postVersion({ properties: { headline: { type: "string" } } }));
    const store = await this.start("relational", { appVersion: "2.0.0" });
    const posts = useRepository(RelPost as any);
    for (let i = 0; i < 5; i++) {
      await posts.create({ uuid: `p${i}`, title: `t${i}` } as any);
    }
    await posts.create({ uuid: "done", title: "x", headline: "already" } as any);
    assert.strictEqual(await store.schemaBackfill("rel_post", "title", "headline", 2), 0);
    assert.ok(this.output.some(line => line.includes("-- 5 row(s) of rel_post.headline filled from title")));
    const rows = await this.admin.query(`SELECT "uuid", "headline" FROM rel_post ORDER BY "uuid"`);
    assert.deepStrictEqual(
      rows.rows.map(r => r.headline),
      ["already", "t0", "t1", "t2", "t3", "t4"]
    );
    this.output = [];
    assert.strictEqual(await store.schemaBackfill("rel_post", "title", "headline"), 0);
    assert.ok(this.output.some(line => line.includes("-- 0 row(s)")));
    await assert.rejects(() => store.schemaBackfill("nope", "title", "headline"), /Table nope is not in the plan/);
    await assert.rejects(() => store.schemaBackfill("rel_post", "nope", "headline"), /Column rel_post.nope/);
  }

  @test
  async failedConcurrentIndexIsLeftOut() {
    await this.start("relational", { appVersion: "1.0.0" });
    await useRepository(RelUser as any).create({ uuid: "u1" } as any);
    const posts = useRepository(RelPost as any);
    await posts.create({ uuid: "p1", title: "a", author: "u1" } as any);
    await posts.create({ uuid: "p2", title: "b", author: "u1" } as any);
    // v2 makes the author link one-to-one: the unique index is built concurrently and fails on the duplicates
    this.post(postVersion({ links: [{ attribute: "editor", model: "Rel/User", type: "LINK", oneToOne: true }] }));
    await this.admin.query(`ALTER TABLE rel_post ADD COLUMN "editor" text`);
    await this.admin.query(`UPDATE rel_post SET "editor" = 'u1'`);
    this.logs = [];
    await this.start("relational-v2", { appVersion: "2.0.0" });
    assert.ok(
      this.logs.some(l => l.includes("UNIQUE_INDEX_ADDED")),
      this.logs.join("\n")
    );
    assert.ok(
      this.logs.some(l => l.includes("create index uq_rel_post_editor failed online and is left out")),
      this.logs.join("\n")
    );
    const indexes = await this.admin.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'rel_post'`);
    assert.ok(!indexes.rows.some(r => r.indexname === "uq_rel_post_editor"), "the invalid index is dropped");
  }
}
