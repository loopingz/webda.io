import { EventRepository, WebdaError, useApplication, useCore, useModel, useRepository } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { RelationalRepository, SQLRepository, SchemaDriftError } from "@webda/sql";
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
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { __resetDatabases } from "./dbregistry.js";
import { SQLiteStore, SQLiteStoreParameters } from "./sqlitestore.service.js";
import { SQLiteRelationalParameters, SQLiteRelationalStore } from "./sqliterelationalstore.service.js";

@suite
export class SQLiteRelationalStoreTest extends WebdaApplicationTest {
  store!: SQLiteRelationalStore;
  extra: string[] = [];

  async beforeEach() {
    await super.beforeEach();
    registerRelationalFixtures(useApplication());
    this.store = await this.makeStore("relational", { database: { name: "rel" }, models: RELATIONAL_MODELS });
  }

  async afterEach() {
    await this.store?.stop();
    for (const name of this.extra) {
      delete useCore().getServices()[name];
    }
    this.extra = [];
    __resetDatabases();
    await super.afterEach();
  }

  /**
   * Register, resolve and init a store with typed parameters
   * @param name - the service name
   * @param params - the parameters
   * @returns the store
   */
  async makeStore(name: string, params: Record<string, any>): Promise<SQLiteRelationalStore> {
    if (name !== "relational") {
      this.extra.push(name);
    }
    const store = new SQLiteRelationalStore(name, new SQLiteRelationalParameters().load(params));
    this.registerService(store as any, name);
    return store.resolve().init();
  }

  /**
   * @param store - a store
   * @param table - a table
   * @returns its column names, empty when it does not exist
   */
  async columns(table: string, store: SQLiteRelationalStore = this.store): Promise<string[]> {
    return (await store.getClient()!.query(`PRAGMA table_info("${table}")`)).rows.map(r => r.name);
  }

  @test
  async initCreatesSchemaAndRoutesModels() {
    assert.ok((await this.columns("rel_post")).includes("title"));
    assert.ok((await this.columns("rel_post_tags")).includes("_position"));
    assert.strictEqual((await this.store.getClient()!.query("PRAGMA foreign_keys")).rows[0].foreign_keys, 1);
    const repo: any = useRepository(RelPost as any);
    assert.ok(repo instanceof EventRepository);
    assert.ok(repo.repository instanceof RelationalRepository);
    assert.strictEqual(this.store.handleModel(useModel("Rel/Dog")), 1);
    assert.strictEqual(this.store.handleModel(useModel("Webda/OwnerModel")), -1);
    assert.throws(
      () => this.store.getRepository(useModel("Webda/OwnerModel")),
      (err: any) => err instanceof WebdaError.CodeError && err.code === "MODEL_NOT_PLANNED"
    );
    assert.strictEqual(this.store.resolveTable(useModel("Rel/Dog")), "rel_animal");
    assert.strictEqual(this.store.resolveTableModel(useModel("Rel/Dog")), "Rel/Animal");
    assert.strictEqual(this.store.resolveTableModel(useModel("Webda/OwnerModel")), "Webda/OwnerModel");
    assert.deepStrictEqual(this.store.getRawTables(), []);
    assert.strictEqual(this.store.getSchemaPlan().version, 1);
    // The foreign keys are inline: the second init finds nothing to do
    await this.store.stop();
    await this.store.init();
    assert.strictEqual(await this.store.backfillTypes(), 0);
  }

  @test
  async registryAndParameterRefusals() {
    const registry = useCore().getService("Registry");
    try {
      await assert.rejects(
        () => this.makeStore("Registry", { database: { name: "rel" }, models: RELATIONAL_MODELS }),
        (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_STORE_AS_REGISTRY"
      );
    } finally {
      this.registerService(registry, "Registry");
    }
    assert.throws(
      () => new SQLiteRelationalParameters().load({ table: "shared" }),
      (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_SHARED_TABLE"
    );
    assert.throws(
      () => new SQLiteRelationalParameters().load({ tables: { "Rel/Post": "Posts" } }),
      (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_TABLE_NAME"
    );
    const defaults = new SQLiteRelationalParameters().load({});
    assert.strictEqual(defaults.schemaSync, "create");
    assert.strictEqual(defaults.extraColumn, "_extra");
    assert.strictEqual(defaults.foreignKeys, true);
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
    const post: any = await posts.create({
      uuid: "p1",
      title: "Hello",
      author: "u1",
      tags: ["t1"],
      extra: 1,
      published: true
    } as any);
    assert.ok(post instanceof RelPost);
    await posts.patch("p1" as any, { views: 2 } as any);
    const loaded: any = await posts.get("p1" as any);
    assert.strictEqual(loaded.views, 2);
    assert.strictEqual(loaded.published, true);
    assert.deepStrictEqual(loaded.tags, ["t1"]);
    assert.strictEqual(loaded.extra, 1);
    assert.strictEqual((await posts.query("author = 'u1' AND published = TRUE")).results.length, 1);
    await posts.delete("p1" as any);
    assert.deepStrictEqual(seen, ["Created", "Patched", "Deleted"]);
    // Foreign keys are enforced: unknown author on insert, referenced user on delete
    await assert.rejects(
      () => posts.create({ uuid: "p2", title: "x", author: "nobody" } as any),
      WebdaError.BadRequest
    );
    await posts.create({ uuid: "p2", title: "x", author: "u1" } as any);
    await assert.rejects(() => users.delete("u1" as any), WebdaError.Conflict);
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
    assert.strictEqual((onlyDogs[0] as any).bark, true);
    assert.deepStrictEqual(await this.columns("rel_dog"), []);
  }

  @test
  async schemaSyncModes() {
    await this.store.stop();
    __resetDatabases();
    const none = await this.makeStore("none", {
      database: { name: "modes" },
      models: RELATIONAL_MODELS,
      schemaSync: "none"
    });
    assert.deepStrictEqual(await this.columns("rel_post", none), []);
    const create = await this.makeStore("create", { database: { name: "modes" }, models: RELATIONAL_MODELS });
    assert.ok((await this.columns("rel_post", create)).includes("views"));
    const client = create.getClient()!;
    // alter adds a missing column, and reports a missing foreign key it cannot add
    await client.query(`ALTER TABLE rel_post DROP COLUMN views`);
    await client.query(`DROP TABLE rel_node`);
    await client.query(
      `CREATE TABLE rel_node ("uuid" TEXT, "parentNode" TEXT, "__type" TEXT, "_extra" JSON, CONSTRAINT "rel_node_pkey" PRIMARY KEY ("uuid"))`
    );
    const alter = await this.makeStore("alter", {
      database: { name: "modes" },
      models: RELATIONAL_MODELS,
      schemaSync: "alter"
    });
    assert.ok((await this.columns("rel_post", alter)).includes("views"));
    // validate refuses the drift
    await client.query(`ALTER TABLE rel_post DROP COLUMN views`);
    await client.query(`ALTER TABLE rel_post ADD COLUMN views TEXT`);
    await assert.rejects(
      () =>
        this.makeStore("validate", { database: { name: "modes" }, models: RELATIONAL_MODELS, schemaSync: "validate" }),
      (err: any) =>
        err instanceof SchemaDriftError &&
        err.message.includes("rel_post.views") &&
        err.message.includes("recreate the table")
    );
    await none.stop();
    await create.stop();
    await alter.stop();
  }

  @test
  async transactionsDoNotSwallowConcurrentWrites() {
    const tags = useRepository(RelTag as any);
    const posts = useRepository(RelPost as any);
    await tags.create({ uuid: "t1", label: "x" } as any);
    const [failed] = await Promise.all([
      posts.create({ uuid: "p1", title: "a", tags: ["t1", "missing"] } as any).then(
        () => undefined,
        err => err
      ),
      tags.create({ uuid: "t9", label: "y" } as any),
      tags.create({ uuid: "t8", label: "z" } as any)
    ]);
    assert.ok(failed instanceof WebdaError.BadRequest, String(failed));
    assert.ok(failed.message.includes("a foreign key"), failed.message);
    assert.strictEqual(await posts.exists("p1" as any), false);
    assert.strictEqual(await tags.exists("t9" as any), true);
    assert.strictEqual(await tags.exists("t8" as any), true);
    const [dup, created] = await Promise.all([
      tags.create({ uuid: "t1", label: "dup" } as any).then(
        () => undefined,
        err => err
      ),
      posts.create({ uuid: "p2", title: "b", tags: ["t1"] } as any).then(() => "ok")
    ]);
    assert.match(String(dup), /Already exists/);
    assert.strictEqual(created, "ok");
  }

  @test
  async storesSharingADatabaseSerializeWrites() {
    await this.store.stop();
    __resetDatabases();
    const a = await this.makeStore("a", { database: { name: "shared" }, models: ["Rel/User"] });
    const b = await this.makeStore("b", { database: { name: "shared" }, models: ["Rel/Post", "Rel/Tag"] });
    assert.strictEqual(a.getHandle(), b.getHandle());
    const users = a.getRepository(useModel("Rel/User"));
    const tags = b.getRepository(useModel("Rel/Tag"));
    const posts = b.getRepository(useModel("Rel/Post"));
    await tags.create({ uuid: "t1", label: "x" } as any);
    // The junction target FK fails at COMMIT in store b while store a writes on the same handle
    const [failed] = await Promise.all([
      posts.create({ uuid: "p1", title: "a", tags: ["t1", "missing"] } as any).then(
        () => undefined,
        err => err
      ),
      users.create({ uuid: "u1", name: "alice" } as any)
    ]);
    assert.ok(failed instanceof WebdaError.BadRequest, String(failed));
    assert.strictEqual(await users.exists("u1" as any), true, "the other store's write survives the rollback");
    assert.strictEqual(await posts.exists("p1" as any), false);
    await a.stop();
    await b.stop();
  }

  @test
  async jsonStoreOnTheSameHandleIsSerializedAndForeignKeysEnforced() {
    await this.store.stop();
    __resetDatabases();
    // The JSON store opens the database first, the relational store joins it
    const json = new SQLiteStore(
      "json",
      new SQLiteStoreParameters().load({ database: { name: "mixed" }, models: ["Webda/OwnerModel"] })
    );
    this.registerService(json as any, "json");
    this.extra.push("json");
    await json.resolve().init();
    const relational = await this.makeStore("rel2", { database: { name: "mixed" }, models: RELATIONAL_MODELS });
    assert.strictEqual(json.getHandle(), relational.getHandle());
    assert.strictEqual((await json.getClient()!.query("PRAGMA foreign_keys")).rows[0].foreign_keys, 1);
    assert.notStrictEqual(
      json.getClient(),
      json.getHandle()!.client,
      "the JSON store statements go through the handle mutex"
    );
    const owners = json.getRepository(useModel("Webda/OwnerModel"));
    const tags = relational.getRepository(useModel("Rel/Tag"));
    const posts = relational.getRepository(useModel("Rel/Post"));
    await tags.create({ uuid: "t1", label: "x" } as any);
    const [failed] = await Promise.all([
      posts.create({ uuid: "p1", title: "a", tags: ["t1", "missing"] } as any).then(
        () => undefined,
        err => err
      ),
      owners.create({ uuid: "o1", name: "owner" } as any)
    ]);
    assert.ok(failed instanceof WebdaError.BadRequest, String(failed));
    assert.strictEqual(await owners.exists("o1" as any), true, "the JSON store's write survives the rollback");
    await relational.stop();
    await json.stop();
    assert.strictEqual(json.getClient(), undefined, "a stopped store has no client");
  }

  @test
  async schemaCommand() {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...args: any[]) => void lines.push(args.join(" "));
    try {
      assert.strictEqual(await this.store.schema(true), 0);
      assert.ok(lines.join("\n").includes('CREATE TABLE IF NOT EXISTS "rel_post"'));
      assert.ok(lines.join("\n").includes("FOREIGN KEY"));
      lines.length = 0;
      assert.strictEqual(await this.store.schema(false, false, true), 0);
      assert.strictEqual(JSON.parse(lines.join("\n")).version, 1);
      lines.length = 0;
      assert.strictEqual(await this.store.schema(), 0);
      assert.ok(lines.some(l => l.startsWith("rel_post:")));
      lines.length = 0;
      assert.strictEqual(await this.store.schema(false, true), 0);
      assert.deepStrictEqual(lines, ["-- database matches the plan"]);
      await this.store.getClient()!.query(`ALTER TABLE rel_post DROP COLUMN views`);
      lines.length = 0;
      assert.strictEqual(await this.store.schema(false, true), 0);
      assert.ok(lines.some(l => l.includes('ADD COLUMN "views"')));
    } finally {
      console.log = log;
    }
  }

  @test
  async stoppedStoreHasNoClient() {
    const tags = useRepository(RelTag as any);
    await tags.create({ uuid: "t1", label: "x" } as any);
    await this.store.stop();
    await assert.rejects(() => tags.get("t1" as any), /No SQL client/);
    await this.store.init();
    assert.strictEqual(await tags.exists("t1" as any), false, "an in-memory database is dropped at the last release");
  }

  @test
  async cleanEmptiesEveryTable() {
    const tags = useRepository(RelTag as any);
    await tags.create({ uuid: "t1", label: "x" } as any);
    await useRepository(RelPost as any).create({ uuid: "p1", title: "a", tags: ["t1"] } as any);
    await this.store.__clean();
    for (const table of ["rel_post", "rel_post_tags", "rel_tag"]) {
      assert.strictEqual(
        (await this.store.getClient()!.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n,
        0,
        table
      );
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
      assert.strictEqual((await this.store.getClient()!.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n, 0);
    }
  }

  @test
  async taggedIndexesAreCreated() {
    const indexes = (await this.store.getClient()!.query(`SELECT name, sql FROM sqlite_master WHERE type = 'index'`))
      .rows;
    const sql = (name: string) => indexes.find(i => i.name === name)?.sql;
    assert.match(sql("uq_rel_user_email")!, /UNIQUE INDEX .* \("email"\)/);
    assert.match(sql("idx_rel_post_byAuthorDay")!, /\("author", "day"\)/);
  }

  @test
  async registryServesUnlistedModelsForeignKeysToJsonbAndImport() {
    await this.store.stop();
    __resetDatabases();
    const previous = useCore().getService("Registry");
    const tables = { "Rel/User": "json_rel_user", "Rel/Tag": "json_rel_tag", "Rel/Post": "json_rel_post" };
    const registry = new SQLiteStore(
      "Registry",
      new SQLiteStoreParameters().load({ database: { name: "mixed" }, tables })
    );
    this.registerService(registry as any, "Registry");
    try {
      await registry.resolve().init();
      const fk = await this.makeStore("fk", {
        database: { name: "mixed" },
        models: RELATIONAL_MODELS,
        foreignKeysToJsonb: true
      });
      // A model the relational store does not list is served by the Registry, through its JSON repository
      const owners: any = useRepository(useModel("Webda/OwnerModel"));
      assert.ok(owners.repository instanceof SQLRepository && !(owners.repository instanceof RelationalRepository));
      assert.strictEqual(fk.jsonTableOf(registry, useModel("Webda/OwnerModel")), "webda_ownermodel");
      assert.strictEqual(fk.jsonTableOf(fk, useModel("Rel/Post")), undefined, "never to a relational store");
      // The link to it is a real foreign key to the uuid of the JSON table, created with the schema
      const client = fk.getClient()!;
      const fks = (await client.query(`PRAGMA foreign_key_list("rel_comment")`)).rows.map(
        r => `${r.from}->${r.table}.${r.to}`
      );
      assert.ok(fks.includes("moderator->webda_ownermodel.uuid"), fks.join(", "));
      assert.deepStrictEqual(await this.columns("webda_ownermodel", fk), ["uuid", "data"]);
      await useRepository(RelPost as any).create({ uuid: "p1", title: "T" } as any);
      const comments = useRepository(useModel("Rel/Comment"));
      await assert.rejects(
        () => comments.create({ uuid: "c1", post: "p1", moderator: "nobody" } as any),
        WebdaError.BadRequest
      );
      await owners.create({ uuid: "o1", name: "owner" });
      await comments.create({ uuid: "c1", post: "p1", moderator: "o1" } as any);
      // Another database, or a shared JSON table: no foreign key
      const elsewhere = new SQLiteStore("elsewhere", new SQLiteStoreParameters().load({ database: { name: "other" } }));
      assert.strictEqual(fk.jsonTableOf(elsewhere, useModel("Webda/OwnerModel")), undefined);
      (registry.getParameters() as any).table = "shared";
      assert.strictEqual(fk.jsonTableOf(registry, useModel("Webda/OwnerModel")), undefined);
      delete (registry.getParameters() as any).table;
      // Promotion: rows of the JSON tables move to the relational ones, links kept, in one transaction
      const json = (model: any) => registry.getRepository(useModel(model));
      await json("Rel/User").create({ uuid: "u1", name: "alice" } as any);
      await json("Rel/Tag").create({ uuid: "t1", label: "x" } as any);
      await json("Rel/Post").create({ uuid: "p2", title: "T2", author: "u1", tags: ["t1"] } as any);
      await json("Rel/Post").create({ uuid: "p1", title: "already" } as any);
      const reports = await fk.importFromJsonb(registry, { models: ["Rel/Post", "Rel/User", "Rel/Tag"], purge: true });
      assert.deepStrictEqual(reports, [
        { model: "Rel/User", imported: 1, skipped: 0 },
        { model: "Rel/Post", imported: 1, skipped: 1 },
        { model: "Rel/Tag", imported: 1, skipped: 0 }
      ]);
      const post: any = await useRepository(RelPost as any).get("p2" as any);
      assert.strictEqual(post.author, "u1");
      assert.deepStrictEqual(post.tags, ["t1"]);
      assert.strictEqual(((await useRepository(RelPost as any).get("p1" as any)) as any).title, "T");
      for (const table of Object.values(tables)) {
        assert.strictEqual((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n, 0, table);
      }
      // A failure rolls the whole import back; the command prints the reports
      await json("Rel/Post").create({ uuid: "p3", title: "T3", author: "nobody" } as any);
      await json("Rel/Post").create({ uuid: "p4", title: "T4" } as any);
      await assert.rejects(() => fk.importFromJsonb(registry, { models: ["Rel/Post"] }), WebdaError.BadRequest);
      assert.strictEqual(await useRepository(RelPost as any).exists("p4" as any), false);
      await json("Rel/Post").delete("p3" as any);
      const lines: string[] = [];
      const log = console.log;
      console.log = (...args: any[]) => void lines.push(args.join(" "));
      try {
        assert.strictEqual(await fk.import("Rel/Post", "Registry"), 0);
      } finally {
        console.log = log;
      }
      assert.deepStrictEqual(lines, ["Rel/Post: 1 imported, 0 skipped"]);
      await assert.rejects(
        () => fk.import("", "Authentication"),
        (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_IMPORT_SOURCE"
      );
      await assert.rejects(
        () => fk.importFromJsonb(registry, { models: ["Rel/Comment"] }),
        (err: any) => err instanceof WebdaError.CodeError && err.code === "RELATIONAL_IMPORT_TABLE"
      );
      await fk.stop();
      // A relational store on another database references no JSON table: the link stays a plain column
      const apart = await this.makeStore("apart", {
        database: { name: "apart" },
        models: RELATIONAL_MODELS,
        foreignKeysToJsonb: true
      });
      const apartFks = (await apart.getClient()!.query(`PRAGMA foreign_key_list("rel_comment")`)).rows.map(r => r.from);
      assert.ok(!apartFks.includes("moderator"), apartFks.join(", "));
      assert.ok((await this.columns("rel_comment", apart)).includes("moderator"));
    } finally {
      await registry.stop();
      this.registerService(previous, "Registry");
    }
  }
}
