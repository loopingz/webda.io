import { useApplication } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { RelationalSchemaManager, SchemaDriftError } from "@webda/sql";
import { SchemaBuildError } from "@webda/sql-schema";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import pg from "pg";
import { registerRelationalFixtures } from "../../test/relational-models.js";
import { dropRelationalTables, fixtureMetadata, knownMetadata, params } from "../../test/relational-helpers.js";
import { PostgresRelationalDialect } from "./dialect.js";

@suite
export class RelationalSchemaManagerTest extends WebdaApplicationTest {
  client!: pg.Client;
  logs: [string, string][] = [];
  manager!: RelationalSchemaManager;

  async beforeEach() {
    await super.beforeEach();
    registerRelationalFixtures(useApplication());
    this.client = new pg.Client(params.postgresqlServer);
    await this.client.connect();
    await dropRelationalTables(this.client);
    this.logs = [];
    this.manager = new RelationalSchemaManager({
      name: "relational",
      dialect: new PostgresRelationalDialect(),
      layout: {},
      log: (level, message) => this.logs.push([level, message])
    });
  }

  async afterEach() {
    await dropRelationalTables(this.client);
    await this.client.end();
    await super.afterEach();
  }

  /**
   * @param table - a table
   * @returns its columns with their types
   */
  async columns(table: string): Promise<Record<string, string>> {
    const res = await this.client.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [table]
    );
    return Object.fromEntries(
      res.rows.map(r => [
        r.column_name,
        r.character_maximum_length ? `${r.data_type}(${r.character_maximum_length})` : r.data_type
      ])
    );
  }

  /**
   * @param table - a table
   * @returns its constraints: name → [type, delete action, deferrable]
   */
  async constraints(table: string): Promise<Record<string, [string, string, boolean]>> {
    const res = await this.client.query(
      `SELECT con.conname, con.contype, con.confdeltype, con.condeferrable FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid WHERE c.relname = $1`,
      [table]
    );
    return Object.fromEntries(res.rows.map(r => [r.conname, [r.contype, r.confdeltype, r.condeferrable]]));
  }

  @test
  async createRendersTypedTablesKeysAndJunctions() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    const steps = await this.manager.sync(this.client, "create");
    assert.ok(steps.length > 0);
    const post = await this.columns("rel_post");
    assert.strictEqual(post.title, "character varying(200)");
    assert.strictEqual(post.views, "bigint");
    assert.strictEqual(post.score, "double precision");
    assert.strictEqual(post.published, "boolean");
    assert.strictEqual(post.meta, "jsonb");
    assert.strictEqual(post._creationDate, "timestamp with time zone");
    assert.strictEqual(post.__type, "text");
    assert.strictEqual(post._extra, "jsonb");
    assert.strictEqual(post.tags, undefined, "a junction attribute has no column");
    const comment = await this.constraints("rel_comment");
    const fk = Object.entries(comment).find(([, [type]]) => type === "f");
    assert.ok(fk, "comment.post has a foreign key");
    assert.deepStrictEqual(fk![1], ["f", "c", true], "ON DELETE CASCADE, deferrable");
    const tags = await this.columns("rel_post_tags");
    assert.deepStrictEqual(Object.keys(tags), ["post", "tag", "_position"]);
    const tagsPk = Object.values(await this.constraints("rel_post_tags")).filter(([type]) => type === "p");
    assert.strictEqual(tagsPk.length, 1);
    assert.deepStrictEqual(await this.columns("rel_dog"), {}, "a subclass has no table of its own");
    assert.strictEqual((await this.columns("rel_animal")).bark, "boolean");
    const pairref = await this.columns("rel_pairref");
    assert.strictEqual(pairref.pair_a, "text");
    assert.strictEqual(pairref.pair_b, "text");
    assert.ok(
      Object.values(await this.constraints("rel_post")).some(([type]) => type === "c"),
      "enum check"
    );
  }

  @test
  async crossStoreLinkHasNoForeignKey() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    await this.manager.sync(this.client, "create");
    const fks = Object.entries(await this.constraints("rel_comment")).filter(([, [type]]) => type === "f");
    assert.strictEqual(fks.length, 1, "only the parent link has a foreign key");
    const indexes = await this.client.query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'rel_comment'`);
    assert.ok(
      indexes.rows.some(r => r.indexdef.includes("(moderator)")),
      "the cross-store link is indexed"
    );
    const warnings = this.logs.filter(
      ([level, message]) => level === "WARN" && message.includes("CROSS_STORE_REFERENCE")
    );
    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0][1].includes("Rel/Comment"));
  }

  @test
  async syncIsIdempotentAndAlterOnlyAdds() {
    const models = fixtureMetadata();
    this.manager.build(models, knownMetadata());
    await this.manager.sync(this.client, "create");
    assert.deepStrictEqual(await this.manager.sync(this.client, "create"), []);
    // The model loses a field: the column stays
    const post = models.find(m => m.Identifier === "Rel/Post");
    const { views, ...remaining } = post.Schemas.Stored.properties;
    const without = (properties: any) => ({
      ...post,
      Schemas: { Stored: { ...post.Schemas.Stored, properties } }
    });
    this.manager.build(
      models.map(m => (m === post ? without(remaining) : m)),
      knownMetadata()
    );
    this.logs = [];
    assert.deepStrictEqual(await this.manager.sync(this.client, "alter"), []);
    assert.strictEqual((await this.columns("rel_post")).views, "bigint");
    assert.ok(
      this.logs.some(([level, message]) => level === "WARN" && message.includes("rel_post.views is not in the plan"))
    );
    // The model gains a field: the column is added, nullable
    this.manager.build(
      models.map(m => (m === post ? without({ ...remaining, views, summary: { type: "string" } }) : m)),
      knownMetadata()
    );
    const steps = await this.manager.sync(this.client, "alter");
    assert.deepStrictEqual(
      steps.map(s => s.kind),
      ["addColumn"]
    );
    const nullable = await this.client.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'rel_post' AND column_name = 'summary'`
    );
    assert.strictEqual(nullable.rows[0].is_nullable, "YES");
    // create mode reports what alter would add
    this.manager.build(
      models.map(m =>
        m === post ? without({ ...remaining, views, summary: { type: "string" }, more: { type: "integer" } }) : m
      ),
      knownMetadata()
    );
    this.logs = [];
    assert.deepStrictEqual(await this.manager.sync(this.client, "create"), []);
    assert.ok(this.logs.some(([, message]) => message.includes("rel_post.more is missing")));
  }

  @test
  async validateThrowsOnDrift() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    await this.manager.sync(this.client, "create");
    assert.deepStrictEqual(await this.manager.sync(this.client, "validate"), []);
    await this.client.query(`ALTER TABLE rel_post ALTER COLUMN views TYPE text`);
    await assert.rejects(
      () => this.manager.sync(this.client, "validate"),
      (err: any) => err instanceof SchemaDriftError && err.message.includes("rel_post.views")
    );
    await this.client.query(`DROP TABLE rel_tag CASCADE`);
    await assert.rejects(
      () => this.manager.sync(this.client, "validate"),
      (err: any) => err instanceof SchemaDriftError && err.message.includes("create table rel_tag")
    );
    assert.deepStrictEqual(await this.manager.sync(this.client, "none"), []);
    assert.deepStrictEqual(await this.columns("rel_tag"), {}, "validate and none never write");
  }

  @test
  async createStatementsAndDiff() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    const statements = this.manager.createStatements();
    const sql = statements.join(";\n");
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "rel_post"'));
    assert.ok(sql.includes('FOREIGN KEY ("post")'));
    assert.ok(!/DROP|NOT NULL/.test(sql));
    const diff = await this.manager.diff(this.client);
    assert.deepStrictEqual(diff.statements, statements);
    assert.deepStrictEqual(diff.drift, []);
    await this.manager.sync(this.client, "create");
    const after = await this.manager.diff(this.client);
    assert.deepStrictEqual(after, { steps: [], drift: [], statements: [] });
  }

  @test
  async cycleAndSelfReferenceCreate() {
    this.manager.build(fixtureMetadata(), knownMetadata());
    await this.manager.sync(this.client, "create");
    const fks = async (table: string) =>
      Object.values(await this.constraints(table)).filter(([type]) => type === "f").length;
    assert.strictEqual(await fks("rel_node"), 1);
    assert.strictEqual(await fks("rel_cyclea"), 1);
    assert.strictEqual(await fks("rel_cycleb"), 1);
    // Deferred constraints: a cycle inserts in one transaction
    await this.client.query("BEGIN");
    await this.client.query(`INSERT INTO rel_cyclea ("uuid", "other") VALUES ('a', 'b')`);
    await this.client.query(`INSERT INTO rel_cycleb ("uuid", "other") VALUES ('b', 'a')`);
    await this.client.query("COMMIT");
    assert.strictEqual((await this.client.query(`SELECT count(*)::int AS n FROM rel_cyclea`)).rows[0].n, 1);
  }

  @test
  async buildErrorsPropagate() {
    const models = fixtureMetadata();
    const animal = models.find(m => m.Identifier === "Rel/Animal");
    const dog = models.find(m => m.Identifier === "Rel/Dog");
    const conflicting = {
      ...dog,
      Schemas: {
        Stored: { ...dog.Schemas.Stored, properties: { ...dog.Schemas.Stored.properties, kind: { type: "integer" } } }
      }
    };
    assert.throws(
      () =>
        this.manager.build(
          models.map(m => (m === dog ? conflicting : m)),
          knownMetadata()
        ),
      SchemaBuildError
    );
    assert.ok(animal);
    assert.strictEqual(this.manager.plan, undefined);
    assert.throws(() => this.manager.createStatements(), /not built/);
    assert.strictEqual(this.manager.tableOf("Rel/Post"), undefined);
  }
}
