import {
  MemoryRepository,
  StoreNotFoundError,
  UpdateConditionFailError,
  WebdaError,
  useApplication,
  useModelMetadata
} from "@webda/core";
import {
  checkAggregation,
  checkCount,
  checkCountClassFilter,
  checkCreateWithoutPrimaryKey,
  WebdaApplicationTest
} from "@webda/core/lib/test";
import { escape } from "@webda/ql";
import { RelationalRepository, RelationalSchemaManager, runTransaction } from "@webda/sql";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import pg from "pg";
import {
  RelAggRow,
  RelAnimal,
  RelDog,
  RelNode,
  RelPair,
  RelPairRef,
  RelPost,
  RelTag,
  RelUser,
  registerRelationalFixtures
} from "@webda/sql/lib/test";
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
  repo(model: any, layout: Record<string, any> = {}): RelationalRepository<any> {
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
  /**
   * @param table - a table
   * @param where - a condition
   * @returns the rows
   */
  async rows(table: string, where = "TRUE"): Promise<any[]> {
    return (await this.client.query(`SELECT * FROM "${table}" WHERE ${where} ORDER BY 1`)).rows;
  }

  /**
   * Seed the users and tags the posts reference
   */
  async seedTargets(): Promise<void> {
    await this.insert("rel_user", { uuid: "u1", name: "alice", __type: "Rel/User" });
    await this.insert("rel_user", { uuid: "u2", name: "bob", __type: "Rel/User" });
    for (const t of ["t1", "t2", "t3"]) {
      await this.insert("rel_tag", { uuid: t, label: t, __type: "Rel/Tag" });
    }
  }

  @test
  async createUpdatePatchDeleteWithJunctions() {
    await this.seedTargets();
    const repo = this.repo(RelPost);
    const created = await repo.create({
      uuid: "p1",
      title: "T",
      views: 1,
      author: "u1",
      tags: ["t1", "t2"],
      contributors: [{ uuid: "u1", role: "x" }],
      reviewers: { lead: { uuid: "u2" } },
      k: 1
    });
    assert.ok(created instanceof RelPost);
    assert.deepStrictEqual(
      (await this.rows("rel_post_tags")).map(r => [r.tag, Number(r._position)]),
      [
        ["t1", 0],
        ["t2", 1]
      ]
    );
    assert.deepStrictEqual((await this.rows("rel_post_contributors"))[0].attributes, { role: "x" });
    assert.strictEqual((await this.rows("rel_post_reviewers"))[0].key, "lead");
    assert.deepStrictEqual((await this.rows("rel_post"))[0]._extra, { k: 1 });
    assert.strictEqual((await this.rows("rel_post"))[0].__type, "Rel/Post");
    await assert.rejects(() => repo.create({ uuid: "p1", title: "again" }), /Already exists: p1/);
    const post: any = await repo.get("p1");
    assert.deepStrictEqual(post.tags, ["t1", "t2"]);
    assert.deepStrictEqual(post.contributors, [{ uuid: "u1", role: "x" }]);
    assert.deepStrictEqual(post.reviewers, { lead: { uuid: "u2" } });
    // Full update: junctions replaced, the extra column merged
    await repo.update({ uuid: "p1", title: "T2", tags: ["t2"], contributors: [], reviewers: {} });
    assert.deepStrictEqual(
      (await this.rows("rel_post_tags")).map(r => r.tag),
      ["t2"]
    );
    assert.deepStrictEqual(await this.rows("rel_post_contributors"), []);
    assert.deepStrictEqual((await this.rows("rel_post"))[0]._extra, { k: 1 }, "extra keys survive a full update");
    assert.strictEqual((await this.rows("rel_post"))[0].views, null, "a column of the projection is replaced");
    // Patch: only the given columns, extra merged, a junction attribute replaced
    await repo.patch("p1", { views: 3, newKey: true });
    const patched = (await this.rows("rel_post"))[0];
    assert.strictEqual(Number(patched.views), 3);
    assert.strictEqual(patched.title, "T2");
    assert.deepStrictEqual(patched._extra, { k: 1, newKey: true });
    await repo.patch("p1", { tags: [] });
    assert.deepStrictEqual(await this.rows("rel_post_tags"), []);
    await repo.patch("p1", { tags: ["t3", "t1"] });
    assert.deepStrictEqual(((await repo.get("p1")) as any).tags, ["t3", "t1"]);
    await repo.delete("p1");
    assert.deepStrictEqual(await this.rows("rel_post"), []);
    assert.deepStrictEqual(await this.rows("rel_post_tags"), []);
    await repo.delete("p1");
  }

  @test
  async writeConditionsAndNotFound() {
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "T", views: 1 });
    await assert.rejects(() => repo.update({ uuid: "p1", title: "x" }, "views", 99), UpdateConditionFailError);
    await assert.rejects(() => repo.patch("p1", { title: "x" }, "views", 99), UpdateConditionFailError);
    await assert.rejects(() => repo.patch("zz", { title: "x" }), UpdateConditionFailError);
    await assert.rejects(() => repo.removeAttribute("zz", "title"), StoreNotFoundError);
    await assert.rejects(() => repo.removeAttribute("p1", "title", "views", 99), UpdateConditionFailError);
    await assert.rejects(() => repo.delete("p1", "views", 99), UpdateConditionFailError);
    await repo.update({ uuid: "p1", title: "y", views: 1 }, "views", 1);
    await repo.patch("p1", { title: "z" }, "title", "y");
    await repo.patch("p1", { title: "w" }, "author", undefined);
    assert.strictEqual(((await repo.get("p1")) as any).title, "w");
    await repo.delete("p1", "title", "w");
    assert.strictEqual(await repo.exists("p1"), false);
  }

  @test
  async datesRoundTripAndCondition() {
    const repo = this.repo(RelPost);
    const date = new Date("2024-05-06T07:08:09.123Z");
    await repo.create({ uuid: "p1", title: "T", _lastUpdate: date, _creationDate: "2024-05-06T07:08:09.123Z" });
    const post: any = await repo.get("p1");
    assert.strictEqual(post._lastUpdate, "2024-05-06T07:08:09.123Z");
    assert.strictEqual(post._creationDate, "2024-05-06T07:08:09.123Z");
    await repo.update(
      { uuid: "p1", title: "T2", _lastUpdate: new Date("2024-05-07T00:00:00.000Z") },
      "_lastUpdate",
      date
    );
    await assert.rejects(() => repo.update({ uuid: "p1", title: "T3" }, "_lastUpdate", date), UpdateConditionFailError);
    await repo.patch("p1", { title: "T4" }, "_lastUpdate", "2024-05-07T00:00:00.000Z");
    assert.strictEqual(((await repo.get("p1")) as any).title, "T4");
  }

  @test
  async removeAttributeOnColumnExtraAndJunction() {
    await this.seedTargets();
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "T", tags: ["t1"], k: 1, other: 2 });
    await repo.removeAttribute("p1", "title");
    await repo.removeAttribute("p1", "k");
    await repo.removeAttribute("p1", "tags");
    const post: any = await repo.get("p1");
    assert.strictEqual(post.title, undefined);
    assert.strictEqual(post.k, undefined);
    assert.strictEqual(post.other, 2);
    assert.deepStrictEqual(post.tags, []);
    await assert.rejects(() => repo.removeAttribute("zz", "tags"), StoreNotFoundError);
  }

  @test
  async incrementKeepsNumbers() {
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "T", views: 7, score: 1 });
    await repo.incrementAttributes("p1", { views: 2, score: 0.5 } as any);
    await repo.incrementAttributes("p1", [{ property: "order", value: 3 }, "views"] as any);
    const post: any = await repo.get("p1");
    assert.strictEqual(post.views, 10);
    assert.strictEqual(post.score, 1.5);
    assert.strictEqual(post.order, 3, "a NULL counter starts at 0");
    assert.ok(post._lastUpdate);
    await assert.rejects(() => repo.incrementAttributes("p1", { title: 1 } as any), WebdaError.BadRequest);
    await assert.rejects(() => repo.incrementAttributes("zz", { views: 1 } as any), StoreNotFoundError);
  }

  @test
  async collectionOpsOnJsonAndJunction() {
    await this.seedTargets();
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "T", files: [{ name: "f0" }], tags: ["t1", "t2"] });
    // JSON array column
    await repo.upsertItemToCollection("p1", "files" as any, { name: "f5" }, 5);
    await repo.upsertItemToCollection("p1", "files" as any, { name: "f1" }, 1);
    await repo.upsertItemToCollection("p1", "files" as any, { name: "f0b" }, 0);
    assert.deepStrictEqual(((await repo.get("p1")) as any).files, [{ name: "f0b" }, { name: "f1" }]);
    await assert.rejects(
      () => repo.upsertItemToCollection("p1", "files" as any, { name: "x" }, undefined, "name", "f1"),
      UpdateConditionFailError
    );
    await assert.rejects(
      () => repo.deleteItemFromCollection("p1", "files" as any, 1, "name", "nope"),
      UpdateConditionFailError
    );
    await repo.deleteItemFromCollection("p1", "files" as any, 1, "name", "f1");
    assert.deepStrictEqual(((await repo.get("p1")) as any).files, [{ name: "f0b" }]);
    await repo.upsertItemToCollection("p1", "files" as any, { name: "f9" });
    assert.deepStrictEqual(((await repo.get("p1")) as any).files, [{ name: "f0b" }, { name: "f9" }]);
    assert.ok(((await repo.get("p1")) as any)._lastUpdate);
    await assert.rejects(() => repo.upsertItemToCollection("zz", "files" as any, { name: "x" }), StoreNotFoundError);
    // Junction: append, delete and renumber, replace at a position with a condition on the key
    await repo.upsertItemToCollection("p1", "tags" as any, "t3");
    assert.deepStrictEqual(((await repo.get("p1")) as any).tags, ["t1", "t2", "t3"]);
    await assert.rejects(() => repo.upsertItemToCollection("p1", "tags" as any, "t1"), WebdaError.Conflict);
    await assert.rejects(
      () => repo.deleteItemFromCollection("p1", "tags" as any, 1, "uuid", "t3"),
      UpdateConditionFailError
    );
    await repo.deleteItemFromCollection("p1", "tags" as any, 1, "uuid", "t2");
    assert.deepStrictEqual(((await repo.get("p1")) as any).tags, ["t1", "t3"]);
    assert.deepStrictEqual((await this.rows("rel_post_tags")).map(r => Number(r._position)).sort(), [0, 1]);
    await assert.rejects(
      () => repo.upsertItemToCollection("p1", "tags" as any, "t2", 1, "uuid", "nope"),
      UpdateConditionFailError
    );
    await repo.upsertItemToCollection("p1", "tags" as any, "t2", 1, "uuid", "t3");
    assert.deepStrictEqual(((await repo.get("p1")) as any).tags, ["t1", "t2"]);
    await repo.upsertItemToCollection("p1", "tags" as any, "t3", 5);
    assert.deepStrictEqual(((await repo.get("p1")) as any).tags, ["t1", "t2", "t3"], "an index beyond the end appends");
    await assert.rejects(() => repo.deleteItemFromCollection("p1", "tags" as any, 7), StoreNotFoundError);
    await assert.rejects(() => repo.upsertItemToCollection("zz", "tags" as any, "t1"), StoreNotFoundError);
    // Scalar columns are not collections
    await assert.rejects(() => repo.upsertItemToCollection("p1", "title" as any, "x"), WebdaError.BadRequest);
    await assert.rejects(() => repo.deleteItemFromCollection("p1", "title" as any, 0), WebdaError.BadRequest);
  }

  @test
  async updateManyOnColumnsJsonAndExtra() {
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "a", published: true, views: 5, meta: { keep: 1 } });
    await repo.create({ uuid: "p2", title: "b", published: true, views: 6 });
    await repo.create({ uuid: "p3", title: "c", published: false, views: 7 });
    assert.strictEqual(
      await repo.updateMany("UPDATE SET views = 0, meta.level = 3 WHERE published = TRUE AND views < 6 LIMIT 1"),
      1
    );
    const p1: any = await repo.get("p1");
    assert.strictEqual(p1.views, 0);
    assert.deepStrictEqual(p1.meta, { keep: 1, level: 3 });
    // Unknown fields are refused by the statement parser, like every store with model metadata
    await assert.rejects(() => repo.updateMany("UPDATE SET k = 'x'"), /Unknown assignment field/);
    assert.strictEqual(((await repo.get("p2")) as any).views, 6);
    assert.strictEqual(await repo.updateMany("UPDATE SET meta.r = :r, published = FALSE WHERE views > 5", { r: 1 }), 2);
    assert.deepStrictEqual(((await repo.get("p3")) as any).meta, { r: 1 });
    assert.strictEqual(await repo.updateMany("UPDATE SET meta.a.b = 1 WHERE uuid = 'p2'"), 1);
    assert.deepStrictEqual(((await repo.get("p2")) as any).meta, { r: 1, a: { b: 1 } });
    await assert.rejects(() => repo.updateMany("UPDATE SET meta.a = 1, meta.b = 2"), WebdaError.BadRequest);
    await assert.rejects(() => repo.updateMany("UPDATE SET tags = 'x'"), WebdaError.BadRequest);
    await assert.rejects(() => repo.updateMany("UPDATE SET title.x = 'x'"), WebdaError.BadRequest);
    await assert.rejects(() => repo.updateMany("UPDATE SET uuid = 'x'"), /primary key/);
    assert.strictEqual(await repo.deleteMany("DELETE WHERE published = FALSE LIMIT 2"), 2);
    assert.strictEqual((await repo.query("")).results.length, 1);
  }

  @test
  async junctionWritesAreTransactional() {
    await this.seedTargets();
    const repo = this.repo(RelPost);
    await assert.rejects(() => repo.create({ uuid: "p1", title: "T", tags: ["t1", "missing"] }), WebdaError.BadRequest);
    assert.deepStrictEqual(await this.rows("rel_post"), []);
    assert.deepStrictEqual(await this.rows("rel_post_tags"), []);
    await repo.create({ uuid: "p1", title: "T", tags: ["t1"] });
    await assert.rejects(() => repo.update({ uuid: "p1", title: "T", tags: ["missing"] }), WebdaError.BadRequest);
    assert.deepStrictEqual(((await repo.get("p1")) as any).tags, ["t1"], "a failed update leaves the junction rows");
  }

  @test
  async foreignKeyOnInsertIsBadRequest() {
    await this.seedTargets();
    const repo = this.repo(RelPost);
    await assert.rejects(
      () => repo.create({ uuid: "p9", title: "t", author: "nobody" }),
      (err: any) => err instanceof WebdaError.BadRequest && err.message.includes("Rel/Post.author")
    );
    await repo.create({ uuid: "p9", title: "t", author: "u1" });
    await assert.rejects(() => repo.patch("p9", { author: "nobody" }), WebdaError.BadRequest);
    await assert.rejects(() => this.repo(RelUser).delete("u1"), WebdaError.Conflict);
  }

  @test
  async parentWritesKeepTheChildType() {
    const animals = this.repo(RelAnimal);
    const dogs = this.repo(RelDog);
    await dogs.create(new RelDog({ uuid: "d2", kind: "dog" }));
    await dogs.create({ uuid: "d3", kind: "dog", bark: true });
    await animals.create({ uuid: "a1", kind: "cat" });
    // An instance read through the parent, and plain data
    await animals.update(await animals.get("d2"));
    await animals.update({ uuid: "d3", kind: "wolf" });
    await animals.patch("a1", { kind: "lion" });
    assert.deepStrictEqual(await this.uuids(dogs, ""), ["d2", "d3"]);
    const types = (await this.rows("rel_animal")).map(r => [r.uuid, r.__type]);
    assert.deepStrictEqual(types, [
      ["a1", "Rel/Animal"],
      ["d2", "Rel/Dog"],
      ["d3", "Rel/Dog"]
    ]);
    assert.strictEqual(((await dogs.get("d3")) as any).bark, true, "a parent write only touches its own projection");
    // An instance of a class writes its own type
    await animals.update(new RelAnimal({ uuid: "d3", kind: "x" }));
    assert.deepStrictEqual(await this.uuids(dogs, ""), ["d2"]);
  }

  @test
  async bulkStaysInTheModelHierarchy() {
    const animals = this.repo(RelAnimal);
    const dogs = this.repo(RelDog);
    await animals.create({ uuid: "a1", kind: "cat" });
    await dogs.create({ uuid: "d1", kind: "dog" });
    assert.strictEqual(await dogs.updateMany("UPDATE SET kind = 'x'"), 1);
    assert.strictEqual(((await animals.get("a1")) as any).kind, "cat");
    assert.strictEqual(await dogs.deleteMany("DELETE"), 1);
    assert.strictEqual(await animals.exists("a1"), true);
    await dogs.create({ uuid: "d2" });
    assert.strictEqual((await animals.query("")).results.length, 2, "the parent sees its subclasses");
    assert.strictEqual(await animals.deleteMany("DELETE"), 2);
    await checkCountClassFilter(
      animals as any,
      dogs as any,
      async (repo: any, uuid) => void (await repo.create(new (repo.getRootModel())({ uuid })))
    );
  }

  @test
  async createWithoutPrimaryKeyPersistsGeneratedUuid() {
    await checkCreateWithoutPrimaryKey([this.repo(RelTag)], {
      data: () => ({ label: "x" }),
      readStored: async key => (await this.rows("rel_tag", `uuid = '${key}'`))[0]
    });
  }

  @test
  async countConformance() {
    await checkCount(this.repo(RelAggRow) as any, { native: true });
  }

  @test
  async aggregationConformance() {
    await checkAggregation(this.repo(RelAggRow) as any, { native: true });
  }

  @test
  async queryParityWithMemory() {
    const repo = this.repo(RelPost);
    const memory = new MemoryRepository<any>(RelPost as any, ["uuid"]);
    const rows = [
      { uuid: "r1", views: 1, title: "x", published: true, meta: ["x", 1] },
      { uuid: "r2", views: 5, title: "abc", published: false, meta: ["y"] },
      { uuid: "r3" },
      { uuid: "r4", title: "1", meta: "x" },
      { uuid: "r5", title: null }
    ];
    for (const row of rows) {
      await repo.create({ ...row });
      await memory.create({ ...row });
    }
    const queries = [
      "views < 2",
      "views <= 1",
      "views = 1",
      "views != 1",
      "views > 1",
      "views >= 5",
      "views IN [1, 5]",
      "views = 'abc'",
      "views = '1'",
      "published = TRUE",
      "published = FALSE",
      "published != TRUE",
      "title = 'x'",
      "title != 'x'",
      "title = 1",
      "title LIKE 'a%'",
      "title IS NULL",
      "views IS NOT NULL",
      "meta CONTAINS 'x'",
      "views < 2 OR published = TRUE"
    ];
    const uuids = async (r: any, q: string) => (await r.query(q)).results.map((o: any) => o.uuid).sort();
    for (const query of queries) {
      assert.deepStrictEqual(await uuids(repo, query), await uuids(memory, query), query);
    }
  }

  @test
  async cleanEmptiesTableAndJunctions() {
    await this.seedTargets();
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "T", tags: ["t1"] });
    await repo.__clean();
    assert.deepStrictEqual(await this.rows("rel_post"), []);
    assert.deepStrictEqual(await this.rows("rel_post_tags"), []);
    assert.strictEqual((await this.rows("rel_tag")).length, 3);
  }
  @test
  async remainingBranches() {
    await this.seedTargets();
    const repo = this.repo(RelPost);
    assert.strictEqual(await repo.backfillTypes(), 0);
    await repo.create({ uuid: "p1", title: "T", tags: ["t1"], meta: { a: 1 } });
    // Junction removal honours the write condition
    await assert.rejects(() => repo.removeAttribute("p1", "tags", "title", "nope"), UpdateConditionFailError);
    await repo.removeAttribute("p1", "tags", "title", "T");
    assert.deepStrictEqual(((await repo.get("p1")) as any).tags, []);
    // A composite reference is removed as a whole, an unknown field without extra column cannot be
    const refs = this.repo(RelPairRef);
    await this.insert("rel_pair", { a: "x", b: "y", __type: "Rel/Pair" });
    await refs.create({ uuid: "r1", pair: "x_y" });
    await refs.removeAttribute("r1", "pair");
    assert.strictEqual(((await refs.get("r1")) as any).pair, undefined);
    await assert.rejects(
      () => this.repo(RelPost, { extraColumn: false }).removeAttribute("p1", "zz"),
      WebdaError.BadRequest
    );
    // An append with a write condition never matches
    await assert.rejects(
      () => repo.upsertItemToCollection("p1", "tags" as any, "t2", undefined, "uuid", "t1"),
      UpdateConditionFailError
    );
    // A whole JSON column assignment, and counters on a table without _lastUpdate
    assert.strictEqual(await repo.updateMany("UPDATE SET meta = 'str' WHERE uuid = 'p1'"), 1);
    assert.strictEqual(((await repo.get("p1")) as any).meta, "str");
    const agg = this.repo(RelAggRow);
    await agg.create({ uuid: "a1", score: 1 });
    await agg.incrementAttributes("a1", { score: 2 } as any);
    assert.strictEqual(((await agg.get("a1")) as any).score, 3);
    // Attribute mapping of typed and JSON columns as JSON values
    assert.strictEqual(repo.mapJsonAttribute(["views"]), 'to_jsonb("views")');
    assert.strictEqual(repo.mapJsonAttribute(["meta", "a"]), `"meta"#>'{a}'`);
    // A patch without data only checks the row exists
    await repo.patch("p1", undefined as any);
    await assert.rejects(() => repo.patch("zz", undefined as any), UpdateConditionFailError);
    // Counter list entries default to 1
    await repo.create({ uuid: "p2", title: "T", views: 1 });
    await repo.incrementAttributes("p2", [{ property: "views" }] as any);
    assert.strictEqual(((await repo.get("p2")) as any).views, 2);
    // Object items in a simple link array, and an unconditioned JSON item delete
    await repo.upsertItemToCollection("p2", "tags" as any, { uuid: "t3" } as any);
    assert.deepStrictEqual(((await repo.get("p2")) as any).tags, ["t3"]);
    await repo.upsertItemToCollection("p2", "files" as any, { name: "f0" });
    await repo.deleteItemFromCollection("p2", "files" as any, 0);
    assert.deepStrictEqual(((await repo.get("p2")) as any).files, []);
    await assert.rejects(() => repo.deleteItemFromCollection("zz", "files" as any, 0), StoreNotFoundError);
    // A foreign key the plan does not know (added by a DBA) is still reported as a bad request, by its name
    await this.client.query(
      `ALTER TABLE rel_pairref ADD CONSTRAINT dba_fk FOREIGN KEY (pair_a) REFERENCES rel_tag (uuid)`
    );
    await assert.rejects(
      () => refs.create({ uuid: "r2", pair: "zz_y" }),
      (err: any) => err instanceof WebdaError.BadRequest && err.message.includes("dba_fk")
    );
  }

  @test
  async compositeKeyOwnerJunction() {
    await this.seedTargets();
    const pairs = this.repo(RelPair);
    await pairs.create({ a: "x", b: "y", label: "l", tags: ["t1", "t2"] });
    const pair: any = await pairs.get({ a: "x", b: "y" });
    assert.deepStrictEqual(pair.tags, ["t1", "t2"]);
    assert.deepStrictEqual(
      (await this.rows("rel_pair_tags")).map(r => [r.pair_a, r.pair_b, r.tag]),
      [
        ["x", "y", "t1"],
        ["x", "y", "t2"]
      ]
    );
    await pairs.upsertItemToCollection({ a: "x", b: "y" }, "tags" as any, "t3");
    await pairs.deleteItemFromCollection({ a: "x", b: "y" }, "tags" as any, 0);
    assert.deepStrictEqual(((await pairs.get({ a: "x", b: "y" })) as any).tags, ["t2", "t3"]);
    assert.strictEqual(await pairs.deleteMany("DELETE WHERE label = 'l' LIMIT 1"), 1);
    assert.deepStrictEqual(await this.rows("rel_pair_tags"), []);
  }
  @test
  async parentPatchWritesSubclassColumns() {
    const animals = this.repo(RelAnimal);
    const dogs = this.repo(RelDog);
    await dogs.create({ uuid: "d1", kind: "dog", bark: true });
    await animals.patch("d1", { bark: false });
    assert.strictEqual(((await dogs.get("d1")) as any).bark, false, "the patched column is written");
    await animals.update({ uuid: "d1", kind: "dog", bark: true });
    assert.strictEqual(((await dogs.get("d1")) as any).bark, true);
    assert.deepStrictEqual((await this.rows("rel_animal"))[0]._extra, {}, "a table column never lands in _extra");
    await animals.removeAttribute("d1", "bark");
    assert.strictEqual(((await dogs.get("d1")) as any).bark, undefined, "nothing resurrects the removed column");
  }

  @test
  async dateColumnsRoundTrip() {
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "T", day: "2024-01-02" });
    await repo.create({ uuid: "p2", title: "T", day: new Date("2024-03-04T23:30:00.000Z") });
    assert.strictEqual(((await repo.get("p1")) as any).day, "2024-01-02");
    assert.strictEqual(((await repo.get("p2")) as any).day, "2024-03-04");
    assert.strictEqual(
      (await this.client.query(`SELECT day::text AS d FROM rel_post WHERE uuid = 'p1'`)).rows[0].d,
      "2024-01-02"
    );
    assert.deepStrictEqual(await this.uuids(repo, "day >= '2024-02-01'"), ["p2"]);
  }

  @test
  async timeColumnsMatchNothingOnNonDateText() {
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "T", _lastUpdate: "2024-05-06T07:08:09.123Z", day: "2024-05-06" });
    await repo.create({ uuid: "p2", title: "T" });
    // A text that is no date matches nothing instead of raising, `!=` matches everything
    assert.deepStrictEqual(await this.uuids(repo, "_lastUpdate = 'abc'"), []);
    assert.deepStrictEqual(await this.uuids(repo, "_lastUpdate != 'abc'"), ["p1", "p2"]);
    assert.deepStrictEqual(await this.uuids(repo, "_lastUpdate > 'abc'"), []);
    assert.deepStrictEqual(await this.uuids(repo, "day = 'abc'"), []);
    assert.deepStrictEqual(await this.uuids(repo, "day < 'abc'"), []);
    // Dates compare natively, LIKE sees the ISO text
    assert.deepStrictEqual(await this.uuids(repo, "_lastUpdate = '2024-05-06T07:08:09.123Z'"), ["p1"]);
    assert.deepStrictEqual(await this.uuids(repo, "_lastUpdate LIKE '2024-05-06T07%'"), ["p1"]);
    assert.deepStrictEqual(await this.uuids(repo, "_lastUpdate LIKE '%.123Z'"), ["p1"]);
    assert.deepStrictEqual(await this.uuids(repo, "day >= '2024-05-06'"), ["p1"]);
    assert.deepStrictEqual(await this.uuids(repo, "day LIKE '2024-05%'"), ["p1"]);
  }

  @test
  async duplicatesTellRowJunctionAndUniqueIndexApart() {
    await this.seedTargets();
    const users = this.repo(RelUser);
    const posts = this.repo(RelPost);
    await users.create({ uuid: "u3", email: "a@b" });
    await assert.rejects(() => users.create({ uuid: "u3", email: "other" }), /^Error: Already exists: u3$/);
    // The `@Unique` index of the fixture
    await assert.rejects(
      () => users.create({ uuid: "u4", email: "a@b" }),
      (err: any) => err instanceof WebdaError.Conflict && err.message === "Rel/User: email must be unique"
    );
    assert.strictEqual(await users.exists("u4"), false);
    await users.create({ uuid: "u4", email: "c@d" });
    await assert.rejects(() => users.update({ uuid: "u4", email: "a@b" }), WebdaError.Conflict);
    await assert.rejects(() => users.patch("u4", { email: "a@b" }), WebdaError.Conflict);
    await assert.rejects(
      () => posts.create({ uuid: "p1", title: "T", tags: ["t1", "t1"] }),
      (err: any) => err instanceof WebdaError.BadRequest && err.message === "Rel/Post.tags holds a key twice"
    );
    assert.strictEqual(await posts.exists("p1"), false, "the row insert is rolled back with its junction");
    await posts.create({ uuid: "p1", title: "T", tags: ["t1"] });
    await assert.rejects(() => posts.patch("p1", { tags: ["t2", "t2"] }), WebdaError.BadRequest);
    assert.deepStrictEqual(((await posts.get("p1")) as any).tags, ["t1"]);
  }

  @test
  async patchRoundTripsItsData() {
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "T", views: 1, meta: { a: 1 } });
    // Undefined values are not patched, dates serialize, an enumerable __type is never trusted
    await repo.patch("p1", {
      views: undefined,
      title: "T2",
      _lastUpdate: new Date("2024-05-06T07:08:09.123Z"),
      __type: "Rel/Dog"
    } as any);
    const post: any = await repo.get("p1");
    assert.strictEqual(post.views, 1);
    assert.strictEqual(post.title, "T2");
    assert.strictEqual(post._lastUpdate, "2024-05-06T07:08:09.123Z");
    assert.ok(post instanceof RelPost);
    // What has a toJSON is patched as it serializes
    await repo.patch("p1", { title: "ignored", toJSON: () => ({ title: "T3", meta: { b: 2 } }) } as any);
    const again: any = await repo.get("p1");
    assert.strictEqual(again.title, "T3");
    assert.deepStrictEqual(again.meta, { b: 2 });
  }

  @test
  async linksArrayMixingKeysAndObjects() {
    await this.seedTargets();
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "T", contributors: ["u1", { uuid: "u2", role: "x" }] });
    assert.deepStrictEqual(((await repo.get("p1")) as any).contributors, [{ uuid: "u1" }, { uuid: "u2", role: "x" }]);
    await repo.update({ uuid: "p1", title: "T", contributors: [{ uuid: "u2", role: "y" }, "u1"] });
    assert.deepStrictEqual(((await repo.get("p1")) as any).contributors, [{ uuid: "u2", role: "y" }, { uuid: "u1" }]);
  }

  @test
  async cleanDeletesSelfReferencesInOneTransaction() {
    const nodes = this.repo(RelNode);
    await nodes.create({ uuid: "n1" });
    await nodes.create({ uuid: "n2", parentNode: "n1" });
    await nodes.patch("n1", { parentNode: "n2" });
    await nodes.__clean();
    assert.deepStrictEqual(await this.rows("rel_node"), []);
  }

  @test
  async jsonItemConditionAtAnIndexAndUnknownUniqueIndex() {
    const repo = this.repo(RelPost);
    await repo.create({ uuid: "p1", title: "T", files: [{ name: "f0" }, { name: "f1" }] });
    await assert.rejects(
      () => repo.upsertItemToCollection("p1", "files" as any, { name: "x" }, 1, "name", "nope"),
      UpdateConditionFailError
    );
    await repo.upsertItemToCollection("p1", "files" as any, { name: "f1b" }, 1, "name", "f1");
    assert.deepStrictEqual(((await repo.get("p1")) as any).files, [{ name: "f0" }, { name: "f1b" }]);
    // A unique index the plan does not know (added by a DBA) is a conflict named after what the engine reports
    await this.client.query(`CREATE UNIQUE INDEX dba_uq ON rel_tag (label)`);
    const tags = this.repo(RelTag);
    await tags.create({ uuid: "t1", label: "same" });
    await assert.rejects(
      () => tags.create({ uuid: "t2", label: "same" }),
      (err: any) =>
        err instanceof WebdaError.Conflict && /^Rel\/Tag: unique constraint (dba_uq|label) violated$/.test(err.message)
    );
  }
}
