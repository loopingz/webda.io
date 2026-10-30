import { useApplication } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { RelationalSchemaManager, SchemaDriftError } from "@webda/sql";
import { fixtureMetadata, knownMetadata, registerRelationalFixtures } from "@webda/sql/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { __resetDatabases, acquireDatabase, releaseDatabase } from "../dbregistry.js";
import type { SQLiteHandle } from "../dbregistry.js";
import { SQLiteRelationalDialect } from "./dialect.js";

@suite
export class SQLiteRelationalSchemaManagerTest extends WebdaApplicationTest {
  handle!: SQLiteHandle;
  logs: [string, string][] = [];
  manager!: RelationalSchemaManager;

  async beforeEach() {
    await super.beforeEach();
    registerRelationalFixtures(useApplication());
    this.handle = await acquireDatabase({ database: { name: "relmanager" } }, "test");
    this.handle.db.exec("PRAGMA foreign_keys = ON");
    this.logs = [];
    this.manager = new RelationalSchemaManager({
      name: "relational",
      dialect: new SQLiteRelationalDialect(),
      layout: {},
      log: (level, message) => this.logs.push([level, message])
    });
  }

  async afterEach() {
    releaseDatabase(this.handle);
    __resetDatabases();
    await super.afterEach();
  }

  /**
   * @param table - a table
   * @returns its declared column types
   */
  async columns(table: string): Promise<Record<string, string>> {
    const res = await this.handle.client.query(`PRAGMA table_info("${table}")`);
    return Object.fromEntries(res.rows.map(r => [r.name, r.type]));
  }

  /**
   * @param table - a table
   * @returns its foreign keys: referenced table and delete action per column
   */
  async foreignKeys(table: string): Promise<[string, string, string][]> {
    const res = await this.handle.client.query(`PRAGMA foreign_key_list("${table}")`);
    return res.rows.map(r => [r.from, r.table, r.on_delete]);
  }

  @test
  async createRendersTypedTablesKeysAndJunctions() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    const steps = await this.manager.sync(this.handle.client, "create");
    assert.ok(steps.length > 0);
    assert.ok(!steps.some(s => s.kind === "addForeignKey"), "foreign keys are inline");
    const post = await this.columns("rel_post");
    assert.strictEqual(post.title, "VARCHAR(200)");
    assert.strictEqual(post.views, "BIGINT");
    assert.strictEqual(post.score, "REAL");
    assert.strictEqual(post.published, "BOOLEAN");
    assert.strictEqual(post.meta, "JSON");
    assert.strictEqual(post._creationDate, "TIMESTAMPTZ");
    assert.strictEqual(post.day, "DATE");
    assert.strictEqual(post.__type, "TEXT");
    assert.strictEqual(post._extra, "JSON");
    assert.strictEqual(post.tags, undefined);
    assert.deepStrictEqual(await this.foreignKeys("rel_comment"), [["post", "rel_post", "CASCADE"]]);
    const tags = await this.columns("rel_post_tags");
    assert.deepStrictEqual(Object.keys(tags), ["post", "tag", "_position"]);
    const pk = (await this.handle.client.query(`PRAGMA table_info("rel_post_tags")`)).rows.filter(r => r.pk > 0);
    assert.strictEqual(pk.length, 2, "composite primary key of the junction");
    assert.deepStrictEqual(await this.columns("rel_dog"), {});
    assert.strictEqual((await this.columns("rel_animal")).bark, "BOOLEAN");
    assert.strictEqual((await this.columns("rel_pairref")).pair_a, "TEXT");
    const create = (await this.handle.client.query(`SELECT sql FROM sqlite_master WHERE name = 'rel_post'`)).rows[0]
      .sql;
    assert.ok(create.includes(`CHECK ("status" IN ('draft', 'published'))`), "enum check");
    assert.ok(create.includes("DEFERRABLE INITIALLY DEFERRED"));
  }

  @test
  async crossStoreLinkHasNoForeignKey() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    await this.manager.sync(this.handle.client, "create");
    assert.deepStrictEqual(
      (await this.foreignKeys("rel_comment")).map(([from]) => from),
      ["post"]
    );
    const indexes = (await this.handle.client.query(`PRAGMA index_list("rel_comment")`)).rows.map(r => r.name);
    const indexed = [];
    for (const name of indexes) {
      indexed.push(...(await this.handle.client.query(`PRAGMA index_info("${name}")`)).rows.map(r => r.name));
    }
    assert.ok(indexed.includes("moderator"), "the cross-store link is indexed");
    const warnings = this.logs.filter(
      ([level, message]) => level === "WARN" && message.includes("CROSS_STORE_REFERENCE")
    );
    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0][1].includes("Rel/Comment.moderator"));
  }

  @test
  async syncIsIdempotentAndAlterOnlyAdds() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    await this.manager.sync(this.handle.client, "create");
    assert.deepStrictEqual(await this.manager.sync(this.handle.client, "create"), []);
    assert.deepStrictEqual(await this.manager.sync(this.handle.client, "alter"), []);
    await this.handle.client.query(`ALTER TABLE rel_post DROP COLUMN views`);
    this.logs = [];
    const steps = await this.manager.sync(this.handle.client, "alter");
    assert.deepStrictEqual(
      steps.map(s => s.kind),
      ["addColumn"]
    );
    assert.strictEqual((await this.columns("rel_post")).views, "BIGINT");
    const notnull = (await this.handle.client.query(`PRAGMA table_info("rel_post")`)).rows.find(
      r => r.name === "views"
    );
    assert.strictEqual(notnull.notnull, 0);
    // A table recreated without its foreign key: alter cannot add it, it is reported
    await this.handle.client.query(`DROP TABLE rel_node`);
    await this.handle.client.query(
      `CREATE TABLE rel_node ("uuid" TEXT, "parentNode" TEXT, "__type" TEXT, "_extra" JSON, CONSTRAINT "rel_node_pkey" PRIMARY KEY ("uuid"))`
    );
    this.logs = [];
    const again = await this.manager.sync(this.handle.client, "alter");
    assert.deepStrictEqual(
      again.map(s => s.kind),
      ["createIndex", "createIndex"]
    );
    assert.ok(
      this.logs.some(([level, message]) => level === "WARN" && message.includes("cannot be added to rel_node"))
    );
    assert.deepStrictEqual(await this.foreignKeys("rel_node"), []);
  }

  @test
  async validateThrowsOnDrift() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    await this.manager.sync(this.handle.client, "create");
    assert.deepStrictEqual(await this.manager.sync(this.handle.client, "validate"), []);
    await this.handle.client.query(`ALTER TABLE rel_post DROP COLUMN views`);
    await this.handle.client.query(`ALTER TABLE rel_post ADD COLUMN views TEXT`);
    await assert.rejects(
      () => this.manager.sync(this.handle.client, "validate"),
      (err: any) => err instanceof SchemaDriftError && err.message.includes("rel_post.views is TEXT, expected bigint")
    );
    await this.handle.client.query(`DROP TABLE rel_tag`);
    await assert.rejects(
      () => this.manager.sync(this.handle.client, "validate"),
      (err: any) => err instanceof SchemaDriftError && err.message.includes("create table rel_tag")
    );
    assert.deepStrictEqual(await this.manager.sync(this.handle.client, "none"), []);
    assert.deepStrictEqual(await this.columns("rel_tag"), {}, "validate and none never write");
  }

  @test
  async createStatementsAndDiff() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    const statements = this.manager.createStatements();
    const sql = statements.join(";\n");
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "rel_post"'));
    assert.ok(sql.includes('FOREIGN KEY ("post") REFERENCES "rel_post" ("uuid") ON DELETE CASCADE'));
    assert.ok(!/DROP|NOT NULL|ADD CONSTRAINT/.test(sql));
    const diff = await this.manager.diff(this.handle.client);
    assert.deepStrictEqual(diff.statements, statements);
    await this.manager.sync(this.handle.client, "create");
    assert.deepStrictEqual(await this.manager.diff(this.handle.client), { steps: [], drift: [], statements: [] });
  }

  @test
  async cycleAndSelfReferenceInsertInOneTransaction() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    await this.manager.sync(this.handle.client, "create");
    assert.strictEqual((await this.foreignKeys("rel_node")).length, 1);
    assert.strictEqual((await this.foreignKeys("rel_cyclea")).length, 1);
    const client = this.handle.client;
    await client.query("BEGIN");
    await client.query(`INSERT INTO rel_cyclea ("uuid", "other") VALUES ('a', 'b')`);
    await client.query(`INSERT INTO rel_cycleb ("uuid", "other") VALUES ('b', 'a')`);
    await client.query("COMMIT");
    assert.strictEqual((await client.query(`SELECT count(*) AS n FROM rel_cyclea`)).rows[0].n, 1);
    // Enforced: a dangling reference fails at COMMIT
    await client.query("BEGIN");
    await client.query(`INSERT INTO rel_node ("uuid", "parentNode") VALUES ('n1', 'missing')`);
    await assert.rejects(() => client.query("COMMIT"), /FOREIGN KEY constraint failed/);
    await client.query("ROLLBACK").catch(() => undefined);
  }
}
