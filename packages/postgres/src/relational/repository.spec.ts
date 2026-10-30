import { WebdaError, useApplication, useModel, useModelMetadata } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { escape } from "@webda/ql";
import { RelationalRepository, RelationalSchemaManager, runTransaction } from "@webda/sql";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import pg from "pg";
import {
  RelAnimal,
  RelDog,
  RelPairRef,
  RelPost,
  RelUser,
  registerRelationalFixtures
} from "../../test/relational-models.js";
import { PostgresRelationalDialect } from "./dialect.js";
import { dropRelationalTables, fixtureMetadata, knownMetadata, params } from "../../test/relational-helpers.js";

/**
 * RelationalRepository against a local PostgreSQL, without a store: the manager creates the schema, rows are seeded
 * with explicit INSERTs
 */
@suite
export class RelationalRepositoryTest extends WebdaApplicationTest {
  client!: pg.Client;
  manager!: RelationalSchemaManager;
  dialect = new PostgresRelationalDialect();

  async beforeEach() {
    await super.beforeEach();
    registerRelationalFixtures(useApplication());
    this.client = new pg.Client(params.postgresqlServer);
    await this.client.connect();
    await dropRelationalTables(this.client);
    this.manager = new RelationalSchemaManager({
      name: "relational",
      dialect: this.dialect,
      layout: {},
      log: () => {}
    });
    this.manager.build(fixtureMetadata(), knownMetadata());
    await this.manager.sync(this.client, "create");
  }

  async afterEach() {
    await dropRelationalTables(this.client);
    await this.client.end();
    await super.afterEach();
  }

  /**
   * @param model - a fixture model class
   * @param layout - alternative layout (rebuilds the plan, the tables are not recreated)
   * @returns its repository
   */
  repo<T extends any>(model: T, layout: Record<string, any> = {}): RelationalRepository<any> {
    const meta = useModelMetadata(model as any);
    let manager = this.manager;
    if (Object.keys(layout).length) {
      manager = new RelationalSchemaManager({ name: "relational", dialect: this.dialect, layout, log: () => {} });
      manager.build(fixtureMetadata(), knownMetadata());
    }
    return new RelationalRepository<any>(model as any, meta.PrimaryKey, {
      plan: manager.plan!,
      table: manager.tableOf(meta.Identifier)!,
      client: this.client,
      transact: fn => runTransaction(this.client, fn),
      dialect: this.dialect,
      separator: meta.PrimaryKeySeparator
    });
  }

  /**
   * @param table - a table
   * @param row - column values
   */
  async insert(table: string, row: Record<string, unknown>): Promise<void> {
    const columns = Object.keys(row);
    await this.client.query(
      `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(row).map(v => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v))
    );
  }

  /**
   * Seed four posts
   */
  async seedPosts(): Promise<void> {
    await this.insert("rel_user", { uuid: "u1", name: "alice", __type: "Rel/User" });
    await this.insert("rel_tag", { uuid: "t1", label: "a", __type: "Rel/Tag" });
    await this.insert("rel_tag", { uuid: "t2", label: "b", __type: "Rel/Tag" });
    await this.insert("rel_post", {
      uuid: "p1",
      title: "Alpha",
      views: 7,
      published: true,
      status: "draft",
      order: 2,
      meta: { a: 1 },
      _extra: { k: "v" },
      _creationDate: new Date("2024-01-02T03:04:05.000Z"),
      author: "u1",
      __type: "Rel/Post"
    });
    await this.insert("rel_post", {
      uuid: "p2",
      title: "Beta",
      views: 3,
      published: false,
      order: 1,
      __type: "Rel/Post"
    });
    await this.insert("rel_post", {
      uuid: "p3",
      title: "Alps",
      views: 12,
      published: true,
      order: 3,
      meta: null,
      __type: "Rel/Post"
    });
    await this.insert("rel_post", {
      uuid: "p4",
      title: "Gamma",
      published: false,
      order: 0,
      meta: { a: 2 },
      __type: "Rel/Post"
    });
    await this.insert("rel_post_tags", { post: "p1", tag: "t1", _position: 0 });
    await this.insert("rel_post_tags", { post: "p1", tag: "t2", _position: 1 });
    await this.insert("rel_post_reviewers", { post: "p1", user: "u1", key: "lead", attributes: { since: 2020 } });
  }

  /**
   * @param repo - a repository
   * @param query - a WebdaQL query
   * @returns the sorted uuids
   */
  async uuids(repo: RelationalRepository<any>, query: string): Promise<string[]> {
    return (await repo.query(query)).results.map((r: any) => r.uuid).sort();
  }

  @test
  async getDecodesTypedColumnsExtraAndJunctions() {
    await this.seedPosts();
    const post: any = await this.repo(RelPost).get("p1");
    assert.ok(post instanceof RelPost);
    assert.strictEqual(post.views, 7);
    assert.strictEqual(post.published, true);
    assert.deepStrictEqual(post.meta, { a: 1 });
    assert.strictEqual(post.k, "v", "the extra column is merged");
    assert.deepStrictEqual(post.tags, ["t1", "t2"]);
    assert.deepStrictEqual(post.reviewers, { lead: { uuid: "u1", since: 2020 } });
    assert.deepStrictEqual(post.contributors, []);
    assert.strictEqual(post._creationDate, "2024-01-02T03:04:05.000Z");
    assert.strictEqual(post.author, "u1");
    assert.ok(!Object.keys(post).includes("_extra"));
    assert.ok(!Object.keys(post).includes("__type"));
    assert.strictEqual(Object.getOwnPropertyDescriptor(post, "__type")?.value, "Rel/Post");
  }

  @test
  async getNotFoundAndExists() {
    await this.seedPosts();
    const repo = this.repo(RelPost);
    await assert.rejects(() => repo.get("zz"), /Not found: zz/);
    assert.strictEqual(await repo.exists("p1"), true);
    assert.strictEqual(await repo.exists("zz"), false);
    assert.strictEqual(await repo.exists({ uuid: "p2" }), true);
  }

  @test
  async queryOnColumnsJsonAndExtra() {
    await this.seedPosts();
    const repo = this.repo(RelPost);
    assert.deepStrictEqual(await this.uuids(repo, "views > 5"), ["p1", "p3"]);
    assert.deepStrictEqual(await this.uuids(repo, "title LIKE 'Al%'"), ["p1", "p3"]);
    assert.deepStrictEqual(await this.uuids(repo, "published = TRUE"), ["p1", "p3"]);
    assert.deepStrictEqual(await this.uuids(repo, "status IN ['draft', 'other']"), ["p1"]);
    assert.deepStrictEqual(await this.uuids(repo, "meta.a = 1"), ["p1"]);
    assert.deepStrictEqual(await this.uuids(repo, "meta.a > 1"), ["p4"]);
    assert.deepStrictEqual(await this.uuids(repo, "k = 'v'"), ["p1"]);
    assert.deepStrictEqual(await this.uuids(repo, "author = 'u1'"), ["p1"]);
    assert.deepStrictEqual(await this.uuids(repo, "views IS NULL"), ["p4"]);
    assert.deepStrictEqual(await this.uuids(repo, "views IS NOT NULL AND published = FALSE"), ["p2"]);
    const page = await repo.query("ORDER BY views DESC LIMIT 2");
    assert.deepStrictEqual(
      page.results.map((r: any) => r.uuid),
      ["p3", "p1"]
    );
    assert.strictEqual(page.continuationToken, "2");
    const next = await repo.query({
      ...(await import("@webda/ql")).parse("ORDER BY views DESC LIMIT 2"),
      continuationToken: "2"
    } as any);
    assert.deepStrictEqual(
      next.results.map((r: any) => r.uuid),
      ["p2", "p4"]
    );
    assert.strictEqual(next.continuationToken, "4");
    const items: string[] = [];
    for await (const item of repo.iterate("published = TRUE ORDER BY views ASC LIMIT 1")) {
      items.push(item.uuid);
    }
    assert.deepStrictEqual(items, ["p1", "p3"]);
  }

  @test
  async reservedWordColumnsInQueries() {
    await this.seedPosts();
    const repo = this.repo(RelPost);
    assert.deepStrictEqual(await this.uuids(repo, "order > 1"), ["p1", "p3"]);
    const ordered = await repo.query("order >= 0 ORDER BY order ASC");
    assert.deepStrictEqual(
      ordered.results.map((r: any) => r.uuid),
      ["p4", "p2", "p1", "p3"]
    );
    assert.deepStrictEqual(await repo.count("order = 2"), { value: 1, relation: "eq", native: true });
  }

  @test
  async apostropheAndWildcardsOnColumns() {
    await this.insert("rel_post", { uuid: "q1", title: "l'été 100%", __type: "Rel/Post" });
    await this.insert("rel_post", { uuid: "q2", title: "b", __type: "Rel/Post" });
    const repo = this.repo(RelPost);
    assert.deepStrictEqual(await this.uuids(repo, "title = 'l''été 100%'"), ["q1"]);
    assert.deepStrictEqual(await this.uuids(repo, "title LIKE 'l''%'"), ["q1"]);
    assert.deepStrictEqual(await this.uuids(repo, "title LIKE '%\\%'"), ["q1"]);
    assert.deepStrictEqual(await this.uuids(repo, escape(["title = ", ""], ["x' OR 1=1 --"])), []);
    assert.deepStrictEqual(await this.uuids(repo, escape(["title = ", ""], ["l'été 100%"])), ["q1"]);
    assert.strictEqual((await this.client.query(`SELECT count(*)::int AS n FROM rel_post`)).rows[0].n, 2);
  }

  @test
  async jsonNullAndSqlNull() {
    await this.insert("rel_post", { uuid: "n1", title: "a", meta: null, __type: "Rel/Post" });
    await this.client.query(
      `INSERT INTO rel_post ("uuid", "title", "meta", "__type") VALUES ('n2', 'b', 'null'::jsonb, 'Rel/Post')`
    );
    await this.insert("rel_post", { uuid: "n3", title: "c", meta: { a: "x" }, __type: "Rel/Post" });
    const repo = this.repo(RelPost);
    assert.deepStrictEqual(await this.uuids(repo, "meta IS NULL"), ["n1", "n2"]);
    assert.deepStrictEqual(await this.uuids(repo, "meta.a = 'x'"), ["n3"]);
    assert.deepStrictEqual(await this.uuids(repo, "meta.a IS NULL"), ["n1", "n2"]);
    // pg decodes a JSON null like a SQL NULL: both read as an absent field
    const n2: any = await repo.get("n2");
    assert.strictEqual(n2.meta, undefined);
    assert.ok(!("meta" in n2));
  }

  @test
  async unsupportedAttributesAreRejected() {
    const posts = this.repo(RelPost);
    await assert.rejects(() => posts.query("tags CONTAINS 't1'"), WebdaError.BadRequest);
    await assert.rejects(() => posts.query("title CONTAINS 'x'"), WebdaError.BadRequest);
    await assert.rejects(() => this.repo(RelPairRef).query("pair = 'x_y'"), WebdaError.BadRequest);
    await assert.rejects(() => this.repo(RelPost, { extraColumn: false }).query("unknown = 1"), WebdaError.BadRequest);
    await assert.rejects(() => posts.query("ORDER BY tags ASC"), WebdaError.BadRequest);
    assert.deepStrictEqual(await this.uuids(posts, "unknown = 1"), [], "an unknown field reads the extra column");
  }

  @test
  async classFilterOnTypeColumn() {
    await this.insert("rel_animal", { uuid: "a1", kind: "cat", __type: "Rel/Animal" });
    await this.insert("rel_animal", { uuid: "d1", kind: "dog", bark: true, __type: "Rel/Dog" });
    await this.insert("rel_animal", { uuid: "old", kind: "fish" });
    const animals = this.repo(RelAnimal);
    const dogs = this.repo(RelDog);
    assert.deepStrictEqual(await this.uuids(animals, ""), ["a1", "d1", "old"]);
    assert.deepStrictEqual(await this.uuids(dogs, ""), ["d1"]);
    const dog: any = (await dogs.query("")).results[0];
    assert.ok(dog instanceof RelDog);
    assert.strictEqual(dog.bark, true);
    const viaParent: any = await animals.get("d1");
    assert.ok(viaParent instanceof RelDog, "a subclass row loads as the subclass through the parent");
    assert.deepStrictEqual(await animals.count(), { value: 3, relation: "eq", native: true });
    assert.deepStrictEqual(await dogs.count(), { value: 1, relation: "eq", native: true });
    assert.deepStrictEqual(await animals.count("", undefined, { max: 2 }), { value: 2, relation: "gte", native: true });
  }

  @test
  async aggregationOnTypedAndJsonColumns() {
    await this.seedPosts();
    const repo = this.repo(RelPost);
    repo.configureAggregation({ fallback: "allow" });
    const total = await repo.aggregate({
      metrics: { n: { count: "*" }, views: { sum: "views" }, hi: { max: "title" } }
    } as any);
    assert.deepStrictEqual(total.rows, [{ n: 4, views: 22, hi: "Gamma" }]);
    assert.strictEqual(total.native, true);
    const grouped = await repo.aggregate({
      groupBy: ["published"],
      metrics: { n: { count: "*" }, a: { max: "meta.a" }, first: { min: "_creationDate" } },
      orderBy: [{ key: "published", direction: "ASC" }]
    } as any);
    assert.deepStrictEqual(grouped.rows, [
      { published: false, n: 2, a: 2, first: null },
      { published: true, n: 2, a: 1, first: "2024-01-02T03:04:05.000Z" }
    ]);
  }

  @test
  async foreignKeyErrorsAreMapped() {
    await this.seedPosts();
    await assert.rejects(
      () => this.repo(RelUser).deleteMany("DELETE WHERE uuid = 'u1'"),
      (err: any) => err instanceof WebdaError.Conflict && err.message.includes("Rel/Post.author")
    );
    assert.strictEqual(await this.repo(RelUser).exists("u1"), true);
    assert.strictEqual(await this.repo(RelPost).deleteMany("DELETE WHERE uuid = 'p4'"), 1);
  }
}
