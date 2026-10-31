import { EventRepository, WebdaError, useCore, useModel, useRepository } from "@webda/core";
import type { Application } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { RelationalRepository, SchemaDriftError } from "@webda/sql";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import pg from "pg";
import { dropRelationalTables, params } from "../test/relational-helpers.js";
import {
  RELATIONAL_MODELS,
  RelAnimal,
  RelCycleA,
  RelCycleB,
  RelDog,
  RelPost,
  RelTag,
  RelUser,
  registerRelationalFixtures
} from "@webda/sql/lib/test";
import { PostgresRelationalParameters, PostgresRelationalStore } from "./postgresrelationalstore.service.js";
import { PostgresParameters, PostgresStore } from "./postgresstore.service.js";
import { PostgresRepository } from "./sqlstore.js";

@suite
export class PostgresRelationalStoreTest extends WebdaApplicationTest {
  store!: PostgresRelationalStore;
  admin!: pg.Client;
  extra: string[] = [];

  async tweakApp(app: any) {
    await super.tweakApp(app);
    registerRelationalFixtures(app as Application);
  }

  async beforeEach() {
    await super.beforeEach();
    this.admin = new pg.Client(params.postgresqlServer);
    await this.admin.connect();
    await dropRelationalTables(this.admin);
    this.store = await this.addService(
      PostgresRelationalStore,
      { ...params, models: RELATIONAL_MODELS } as any,
      "relational"
    );
  }

  async afterEach() {
    await this.store?.stop();
    // Services registered by a test must not reach the next one
    for (const name of this.extra) {
      delete useCore().getServices()[name];
    }
    this.extra = [];
    await dropRelationalTables(this.admin);
    await this.admin.end();
    await super.afterEach();
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

  /**
   * Add a second store with the given parameters
   * @param name - the service name
   * @param extra - parameters
   * @returns the store
   */
  async another(name: string, extra: Record<string, any>): Promise<PostgresRelationalStore> {
    this.extra.push(name);
    return this.addService(PostgresRelationalStore, { ...params, models: RELATIONAL_MODELS, ...extra } as any, name);
  }

  @test
  async initCreatesSchemaAndRoutesModels() {
    assert.ok((await this.columns("rel_post")).includes("title"));
    assert.ok((await this.columns("rel_post_tags")).includes("_position"));
    const repo: any = useRepository(RelPost as any);
    assert.ok(repo instanceof EventRepository);
    assert.ok(repo.repository instanceof RelationalRepository);
    assert.strictEqual(this.store.handleModel(useModel("Rel/Post")), 0);
    assert.strictEqual(this.store.handleModel(useModel("Rel/Dog")), 1, "subclasses are claimed through the hierarchy");
    assert.strictEqual(this.store.handleModel(useModel("Webda/OwnerModel")), -1);
    assert.throws(
      () => this.store.getRepository(useModel("Webda/OwnerModel")),
      (err: any) => err instanceof WebdaError.CodeError && err.code === "MODEL_NOT_PLANNED"
    );
    assert.strictEqual(this.store.resolveTable(useModel("Rel/Dog")), "rel_animal");
    assert.strictEqual(this.store.resolveTableModel(useModel("Rel/Dog")), "Rel/Animal");
    assert.deepStrictEqual(this.store.getRawTables(), []);
    assert.strictEqual(this.store.getSchemaPlan().version, 1);
  }

  @test
  async registryAndSharedTableRefusal() {
    const registry = useCore().getService("Registry");
    try {
      await assert.rejects(
        () => this.addService(PostgresRelationalStore, { ...params, models: RELATIONAL_MODELS } as any, "Registry"),
        (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_STORE_AS_REGISTRY"
      );
    } finally {
      this.registerService(registry, "Registry");
    }
    assert.throws(
      () => new PostgresRelationalParameters().load({ ...params, table: "shared" }),
      (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_SHARED_TABLE"
    );
    const defaults = new PostgresRelationalParameters().load({ ...params });
    assert.strictEqual(defaults.schemaSync, "create");
    assert.strictEqual(defaults.columnNaming, "preserve");
    assert.strictEqual(defaults.extraColumn, "_extra");
    assert.strictEqual(defaults.foreignKeys, true);
    assert.strictEqual(defaults.numericAsDecimal, false);
  }

  @test
  async crudThroughTheStoreEmitsEvents() {
    const users = useRepository(RelUser as any);
    const tags = useRepository(RelTag as any);
    const posts = useRepository(RelPost as any);
    const seen: string[] = [];
    for (const name of ["Created", "Patched", "Deleted"]) {
      posts.on(name as any, () => seen.push(name));
    }
    await users.create({ uuid: "u1", name: "alice" } as any);
    await tags.create({ uuid: "t1", label: "x" } as any);
    const post: any = await posts.create({ uuid: "p1", title: "Hello", author: "u1", tags: ["t1"], extra: 1 } as any);
    assert.ok(post instanceof RelPost);
    await posts.patch("p1" as any, { views: 2 } as any);
    const loaded: any = await posts.get("p1" as any);
    assert.strictEqual(loaded.views, 2);
    assert.deepStrictEqual(loaded.tags, ["t1"]);
    assert.strictEqual(loaded.extra, 1);
    assert.strictEqual((await posts.query("author = 'u1'")).results.length, 1);
    await posts.delete("p1" as any);
    assert.deepStrictEqual(seen, ["Created", "Patched", "Deleted"]);
    await assert.rejects(
      () => users.delete("u1" as any).then(() => posts.create({ uuid: "p2", title: "x", author: "u1" } as any)),
      WebdaError.BadRequest
    );
  }

  @test
  async subclassesShareTheRootTable() {
    const animals = useRepository(RelAnimal as any);
    const dogs = useRepository(RelDog as any);
    await dogs.create({ uuid: "d1", kind: "dog", bark: true } as any);
    await animals.create({ uuid: "a1", kind: "cat" } as any);
    assert.strictEqual((await animals.query("")).results.length, 2);
    const onlyDogs = (await dogs.query("")).results;
    assert.strictEqual(onlyDogs.length, 1);
    assert.ok(onlyDogs[0] instanceof RelDog);
    assert.deepStrictEqual(await this.columns("rel_dog"), []);
  }

  @test
  async schemaSyncModes() {
    await this.store.stop();
    await dropRelationalTables(this.admin);
    const none = await this.another("none", { schemaSync: "none" });
    assert.deepStrictEqual(await this.columns("rel_post"), []);
    await none.stop();
    const create = await this.another("create", { schemaSync: "create" });
    assert.ok((await this.columns("rel_post")).includes("views"));
    await create.stop();
    // alter adds a missing column (a field the live table does not have yet)
    await this.admin.query(`ALTER TABLE rel_post DROP COLUMN views`);
    const alter = await this.another("alter", { schemaSync: "alter" });
    assert.ok((await this.columns("rel_post")).includes("views"));
    await alter.stop();
    // validate refuses drift and writes nothing
    await this.admin.query(`ALTER TABLE rel_post ALTER COLUMN views TYPE text`);
    await assert.rejects(() => this.another("validate", { schemaSync: "validate" }), SchemaDriftError);
  }

  @test
  async transactUsesPoolOrMutex() {
    const tags = useRepository(RelTag as any);
    await tags.create({ uuid: "t1", label: "x" } as any);
    const posts = useRepository(RelPost as any);
    // Single client: the mutex serializes the junction transactions
    await Promise.all([
      posts.create({ uuid: "p1", title: "a", tags: ["t1"] } as any),
      posts.create({ uuid: "p2", title: "b", tags: ["t1"] } as any)
    ]);
    assert.strictEqual((await this.admin.query(`SELECT count(*)::int AS n FROM rel_post_tags`)).rows[0].n, 2);
    await this.store.stop();
    // Pool: each transaction takes its own connection
    const pooled = await this.another("pooled", { usePool: true, schemaSync: "none" });
    const pooledPosts = pooled.getRepository(useModel("Rel/Post"));
    await Promise.all([
      pooledPosts.create({ uuid: "p3", title: "c", tags: ["t1"] } as any),
      pooledPosts.create({ uuid: "p4", title: "d", tags: ["t1"] } as any)
    ]);
    assert.strictEqual((await this.admin.query(`SELECT count(*)::int AS n FROM rel_post_tags`)).rows[0].n, 4);
    assert.ok((pooled.getClient() as pg.Pool).totalCount <= 2);
    await pooled.stop();
  }

  @test
  async schemaCommand() {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...args: any[]) => void lines.push(args.join(" "));
    try {
      assert.strictEqual(await this.store.schema(true), 0);
      assert.ok(lines.join("\n").includes('CREATE TABLE IF NOT EXISTS "rel_post"'));
      lines.length = 0;
      assert.strictEqual(await this.store.schema(false, false, true), 0);
      assert.strictEqual(JSON.parse(lines.join("\n")).version, 1);
      lines.length = 0;
      assert.strictEqual(await this.store.schema(), 0);
      assert.ok(lines.some(l => l.startsWith("rel_post:") && l.includes("title")));
      lines.length = 0;
      assert.strictEqual(await this.store.schema(false, true), 0, "no diff after init");
      assert.deepStrictEqual(lines, ["-- database matches the plan"]);
      await this.admin.query(`ALTER TABLE rel_post DROP COLUMN views`);
      lines.length = 0;
      assert.strictEqual(await this.store.schema(false, true), 0, "an addable column is not drift");
      assert.ok(lines.some(l => l.includes('ADD COLUMN IF NOT EXISTS "views"')));
      await this.admin.query(`ALTER TABLE rel_post ALTER COLUMN published TYPE text`);
      lines.length = 0;
      assert.strictEqual(await this.store.schema(false, true), 1, "drift returns 1");
      assert.ok(lines.some(l => l.startsWith("-- ") && l.includes("rel_post.published")));
    } finally {
      console.log = log;
    }
  }

  @test
  async transactionsDoNotSwallowConcurrentWrites() {
    const tags = useRepository(RelTag as any);
    const posts = useRepository(RelPost as any);
    await tags.create({ uuid: "t1", label: "x" } as any);
    // A junction transaction that fails at COMMIT (deferred FK) runs while plain writes arrive on the same client
    const [failed] = await Promise.all([
      posts.create({ uuid: "p1", title: "a", tags: ["t1", "missing"] } as any).then(
        () => undefined,
        err => err
      ),
      tags.create({ uuid: "t9", label: "y" } as any),
      tags.create({ uuid: "t8", label: "z" } as any)
    ]);
    assert.ok(failed instanceof WebdaError.BadRequest, String(failed));
    assert.strictEqual(await posts.exists("p1" as any), false);
    assert.strictEqual(await tags.exists("t9" as any), true, "a concurrent write survives the rollback");
    assert.strictEqual(await tags.exists("t8" as any), true);
    // A plain write failing while a transaction is open must not abort the transaction
    const [dup, created] = await Promise.all([
      tags.create({ uuid: "t1", label: "dup" } as any).then(
        () => undefined,
        err => err
      ),
      posts.create({ uuid: "p2", title: "b", tags: ["t1"] } as any).then(() => "ok")
    ]);
    assert.match(String(dup), /Already exists/);
    assert.strictEqual(created, "ok");
    assert.deepStrictEqual(((await posts.get("p2" as any)) as any).tags, ["t1"]);
  }

  @test
  tableOverridesMustBeLowercaseIdentifiers() {
    assert.throws(
      () => new PostgresRelationalParameters().load({ ...params, tables: { "Rel/Post": "Posts" } }),
      (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_TABLE_NAME"
    );
    assert.throws(
      () => new PostgresRelationalParameters().load({ ...params, tables: { "Rel/Post": "a$$b" } }),
      (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_TABLE_NAME"
    );
    assert.deepStrictEqual(
      new PostgresRelationalParameters().load({ ...params, tables: { "Rel/Post": "blog_posts" } }).tables,
      {
        "Rel/Post": "blog_posts"
      }
    );
  }

  @test
  async emptyStoreHasNoTables() {
    await this.store.stop();
    await dropRelationalTables(this.admin);
    const empty = await this.another("empty", { models: undefined });
    assert.deepStrictEqual(empty.getSchemaPlan().tables, []);
    assert.deepStrictEqual(await empty.importFromJsonb(useCore().getService("Registry") as any), []);
    assert.deepStrictEqual(await this.columns("rel_post"), []);
    await empty.stop();
  }

  @test
  async stoppedStoreHasNoClient() {
    const tags = useRepository(RelTag as any);
    await tags.create({ uuid: "t1", label: "x" } as any);
    await this.store.stop();
    await assert.rejects(() => tags.get("t1" as any), /No SQL client/);
    await this.store.init();
    assert.strictEqual(await tags.exists("t1" as any), true);
  }

  @test
  async cleanEmptiesEveryTable() {
    const tags = useRepository(RelTag as any);
    await tags.create({ uuid: "t1", label: "x" } as any);
    await useRepository(RelPost as any).create({ uuid: "p1", title: "a", tags: ["t1"] } as any);
    await this.store.__clean();
    for (const table of ["rel_post", "rel_post_tags", "rel_tag"]) {
      assert.strictEqual((await this.admin.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, table);
    }
  }

  @test
  async cleanDeletesCyclesInOneTransaction() {
    const as = useRepository(RelCycleA as any);
    const bs = useRepository(RelCycleB as any);
    await as.create({ uuid: "a1" } as any);
    await bs.create({ uuid: "b1", other: "a1" } as any);
    await as.patch("a1" as any, { other: "b1" } as any);
    await this.store.__clean();
    for (const table of ["rel_cyclea", "rel_cycleb"]) {
      assert.strictEqual((await this.admin.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, table);
    }
  }

  @test
  async taggedIndexesAreCreated() {
    const indexes = (
      await this.admin.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('rel_user', 'rel_post')`)
    ).rows;
    const def = (name: string) => indexes.find(i => i.indexname === name)?.indexdef;
    assert.match(def("uq_rel_user_email")!, /UNIQUE INDEX .* \(email\)/);
    assert.match(def("idx_rel_post_byAuthorDay")!, /\(author, day\)/);
    assert.ok(def("idx_rel_post_author"), "the composite index replaces no plain one");
  }

  /**
   * Replace the Registry with a JSONB PostgresStore for one test
   * @param tables - its table overrides
   * @param fn - the test
   */
  async withJsonRegistry(
    tables: Record<string, string>,
    fn: (registry: PostgresStore) => Promise<void>
  ): Promise<void> {
    const previous = useCore().getService("Registry");
    const registry = new PostgresStore("Registry", new PostgresParameters().load({ ...params, tables }));
    this.registerService(registry as any, "Registry");
    try {
      await registry.resolve().init();
      await fn(registry);
    } finally {
      await registry.stop();
      this.registerService(previous, "Registry");
      await this.admin.query(
        `DROP TABLE IF EXISTS ${[...Object.values(tables), "webda_ownermodel"].map(t => `"${t}"`).join(", ")} CASCADE`
      );
    }
  }

  @test
  async registryServesUnlistedModelsAndForeignKeysToJsonb() {
    await this.store.stop();
    await dropRelationalTables(this.admin);
    await this.withJsonRegistry({}, async registry => {
      const fk = await this.another("fk", { foreignKeysToJsonb: true });
      // A model the relational store does not list is served by the Registry, through its JSONB repository
      const owners: any = useRepository(useModel("Webda/OwnerModel"));
      assert.ok(owners.repository instanceof PostgresRepository);
      assert.strictEqual(fk.handleModel(useModel("Webda/OwnerModel")), -1);
      assert.strictEqual(fk.jsonTableOf(registry, useModel("Webda/OwnerModel")), "webda_ownermodel");
      assert.strictEqual(fk.jsonTableOf(fk, useModel("Rel/Post")), undefined, "never to a relational store");
      // The link to it is a real foreign key to the uuid of the JSONB table, created with the schema
      const constraints = (
        await this.admin.query(
          `SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE conname = 'fk_rel_comment_moderator'`
        )
      ).rows;
      assert.deepStrictEqual(constraints, [{ target: "webda_ownermodel" }]);
      assert.deepStrictEqual(await this.columns("webda_ownermodel"), ["uuid", "data"]);
      await useRepository(RelPost as any).create({ uuid: "p1", title: "T" } as any);
      const comments = useRepository(useModel("Rel/Comment"));
      await assert.rejects(
        () => comments.create({ uuid: "c1", post: "p1", moderator: "nobody" } as any),
        (err: any) => err instanceof WebdaError.BadRequest && err.message.includes("Rel/Comment.moderator")
      );
      await owners.create({ uuid: "o1", name: "owner" });
      await comments.create({ uuid: "c1", post: "p1", moderator: "o1" } as any);
      await assert.rejects(() => owners.delete("o1"), /violates foreign key/);
      await fk.stop();
      // Without the option, or with a shared JSONB table, the link is a column and an index only
      await dropRelationalTables(this.admin);
      const plain = await this.another("plain", {});
      assert.strictEqual(
        (
          await this.admin.query(
            `SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'fk_rel_comment_moderator'`
          )
        ).rows[0].n,
        0
      );
      (registry.getParameters() as any).table = "shared";
      assert.strictEqual(plain.jsonTableOf(registry, useModel("Webda/OwnerModel")), undefined);
      await plain.stop();
    });
  }

  @test
  async importFromJsonbPromotesModels() {
    const tables = { "Rel/User": "json_rel_user", "Rel/Tag": "json_rel_tag", "Rel/Post": "json_rel_post" };
    await this.withJsonRegistry(tables, async registry => {
      const json = (model: any) => registry.getRepository(useModel(model));
      await json("Rel/User").create({ uuid: "u1", name: "alice", email: "a@b" } as any);
      await json("Rel/Tag").create({ uuid: "t1", label: "x" } as any);
      await json("Rel/Post").create({ uuid: "p1", title: "T", author: "u1", tags: ["t1"], extra: 1 } as any);
      await json("Rel/Post").create({ uuid: "p2", title: "T2", contributors: [{ uuid: "u1", role: "r" }] } as any);
      // Already in the relational table: skipped
      await useRepository(RelTag as any).create({ uuid: "t1", label: "old" } as any);
      // Links in any direction: one transaction with deferred foreign keys
      const reports = await this.store.importFromJsonb(registry, {
        models: ["Rel/Post", "Rel/User", "Rel/Tag"],
        purge: true
      });
      assert.deepStrictEqual(reports, [
        { model: "Rel/User", imported: 1, skipped: 0 },
        { model: "Rel/Post", imported: 2, skipped: 0 },
        { model: "Rel/Tag", imported: 0, skipped: 1 }
      ]);
      const post: any = await useRepository(RelPost as any).get("p1" as any);
      assert.ok(post instanceof RelPost);
      assert.strictEqual(post.author, "u1");
      assert.deepStrictEqual(post.tags, ["t1"]);
      assert.strictEqual(post.extra, 1);
      assert.deepStrictEqual(((await useRepository(RelPost as any).get("p2" as any)) as any).contributors, [
        { uuid: "u1", role: "r" }
      ]);
      assert.strictEqual(((await useRepository(RelTag as any).get("t1" as any)) as any).label, "old");
      for (const table of Object.values(tables)) {
        assert.strictEqual((await this.admin.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, table);
      }
      // A failure rolls the whole import back
      await json("Rel/Post").create({ uuid: "p3", title: "T3", author: "nobody" } as any);
      await json("Rel/Post").create({ uuid: "p4", title: "T4" } as any);
      await assert.rejects(() => this.store.importFromJsonb(registry, { models: ["Rel/Post"] }), WebdaError.BadRequest);
      assert.strictEqual(await useRepository(RelPost as any).exists("p4" as any), false);
      await json("Rel/Post").delete("p3" as any);
      // The command prints the reports; on a pool the import joins withTransaction
      const pooled = await this.another("pooled", { usePool: true, schemaSync: "none" });
      const lines: string[] = [];
      const log = console.log;
      console.log = (...args: any[]) => void lines.push(args.join(" "));
      try {
        assert.strictEqual(await pooled.import("Rel/Post, Rel/Tag", "Registry"), 0);
      } finally {
        console.log = log;
      }
      assert.deepStrictEqual(lines, ["Rel/Post: 1 imported, 0 skipped", "Rel/Tag: 0 imported, 0 skipped"]);
      assert.strictEqual(await useRepository(RelPost as any).exists("p4" as any), true);
      await pooled.stop();
      // Refusals: the source, a model not listed, a model whose JSONB table is the relational one (every table root
      // by default: Rel/AggRow is stored in rel_aggrow by both)
      await assert.rejects(
        () => this.store.importFromJsonb(this.store),
        (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_IMPORT_SOURCE"
      );
      await assert.rejects(
        () => this.store.import("", "Authentication"),
        (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_IMPORT_SOURCE"
      );
      await assert.rejects(
        () => this.store.importFromJsonb(registry, { models: ["Webda/OwnerModel"] }),
        (err: any) => err instanceof WebdaError.CodeError && err.code === "MODEL_NOT_PLANNED"
      );
      await assert.rejects(
        () => this.store.importFromJsonb(registry),
        (err: any) =>
          err instanceof WebdaError.CodeError &&
          err.code === "RELATIONAL_IMPORT_TABLE" &&
          err.message.includes("Rel/AggRow is stored by Registry in rel_aggrow")
      );
    });
  }
}
