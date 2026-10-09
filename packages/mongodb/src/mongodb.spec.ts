import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import * as WebdaQL from "@webda/ql";
import { parse } from "@webda/ql";
import { MongoClient } from "mongodb";
import { checkCreateWithoutPrimaryKey, WebdaApplicationTest } from "@webda/core/lib/test";
import { EventRepository, MemoryRepository, StoreNotFoundError, UpdateConditionFailError, useModel } from "@webda/core";
import { MongoParameters, MongoRepository, MongoStore, mapExpression } from "./mongodb.service.js";

/** A model without metadata */
class Row {
  uuid: string;
  [key: string]: any;
  /**
   * @param data - initial data
   */
  constructor(data?: any) {
    Object.assign(this, data);
  }
}

/** Rows covering numbers, booleans, strings, missing fields, nulls and type mismatches (as the Postgres spec) */
const PARITY_ROWS = [
  { uuid: "r1", n: 1, s: "x", b: true, tags: ["x", 1] },
  { uuid: "r2", n: 5, s: "abc", b: false, tags: ["y"] },
  { uuid: "r3" },
  { uuid: "r4", n: "abc", s: 1, b: "true", tags: "x" },
  { uuid: "r5", s: null }
];
/** Queries whose results must be the same on every store */
const PARITY_QUERIES = [
  "n < 2",
  "n <= 1",
  "n = 1",
  "n != 1",
  "n > 1",
  "n >= 5",
  "n IN [1, 5]",
  "n = 'abc'",
  "b = TRUE",
  "b = FALSE",
  "b != TRUE",
  "s = 'x'",
  "s != 'x'",
  "s = 1",
  "s LIKE 'a%'",
  "s IS NULL",
  "n IS NOT NULL",
  "tags CONTAINS 'x'",
  "n < 2 OR b = TRUE"
];

const MONGO_URL = "mongodb://root:webda.io@localhost:37017";

/**
 * Simple model used to exercise the repository without the application metadata
 */
class Item {
  static Metadata = { Identifier: "Test/Item", Subclasses: [] as any[] };
  uuid: string;
  name?: string;
  count?: number;
  tags?: string[];
  items?: { id: string; value: number }[];
  /**
   * @param data - initial data
   */
  constructor(data?: any) {
    Object.assign(this, data);
  }
}

/**
 * Subclass to verify the class filter
 */
class SubItem extends Item {
  static Metadata = { Identifier: "Test/SubItem", Subclasses: [] as any[] };
}
Item.Metadata.Subclasses.push(SubItem);

/**
 * Unit tests that do not require a MongoDB server
 */
@suite
export class MongoParametersTest {
  @test
  params() {
    const env = process.env["WEBDA_MONGO_URL"];
    delete process.env["WEBDA_MONGO_URL"];
    try {
      assert.throws(() => new MongoParameters().load({}), /An URL is required for MongoDB service/);
      process.env["WEBDA_MONGO_URL"] = "mongodb://env";
      assert.strictEqual(new MongoParameters().load({}).mongoUrl, "mongodb://env");
    } finally {
      if (env === undefined) {
        delete process.env["WEBDA_MONGO_URL"];
      } else {
        process.env["WEBDA_MONGO_URL"] = env;
      }
    }
    const params = new MongoParameters().load({ mongoUrl: "", collection: "c" });
    assert.deepStrictEqual(params.options, {});
  }

  @test
  mapBooleanExpressions() {
    const name = new WebdaQL.ComparisonExpression("=", "name", "a");
    // Whole-filter constants
    assert.deepStrictEqual(mapExpression(new WebdaQL.BooleanExpression(false)), { $expr: false });
    assert.deepStrictEqual(mapExpression(new WebdaQL.BooleanExpression(true)), {});
    assert.deepStrictEqual(mapExpression(new WebdaQL.AndExpression([])), {});
    assert.deepStrictEqual(mapExpression(new WebdaQL.OrExpression([])), {});
    // FALSE merged inside an AND must not fail open
    assert.deepStrictEqual(mapExpression(new WebdaQL.QueryValidator("name = 'a'").merge("FALSE").getExpression()), {
      $expr: false
    });
    // TRUE inside an AND is neutral
    assert.deepStrictEqual(mapExpression(new WebdaQL.AndExpression([name, new WebdaQL.BooleanExpression(true)])), {
      name: "a"
    });
    // Constants inside an OR
    assert.deepStrictEqual(mapExpression(new WebdaQL.OrExpression([name, new WebdaQL.BooleanExpression(false)])), {
      $or: [{ name: "a" }, { $expr: false }]
    });
  }

  @test
  mapComparisons() {
    const map = (q: string) => mapExpression(WebdaQL.parse(q).filter);
    assert.deepStrictEqual(map("a = 1"), { a: 1 });
    assert.deepStrictEqual(map("a.b CONTAINS 'x'"), { "a.b": { $elemMatch: { $eq: "x" } } });
    assert.deepStrictEqual(map("a < 1"), { a: { $lt: 1 } });
    assert.deepStrictEqual(map("a > 1"), { a: { $gt: 1 } });
    assert.deepStrictEqual(map("a <= 1"), { a: { $lte: 1 } });
    assert.deepStrictEqual(map("a >= 1"), { a: { $gte: 1 } });
    assert.deepStrictEqual(map("a != 1"), { a: { $ne: 1 } });
    assert.deepStrictEqual(map("a IN [1, 2]"), { a: { $in: [1, 2] } });
    assert.ok(map("a LIKE 'b%'").a instanceof RegExp);
    assert.deepStrictEqual(map("a IS NULL"), { a: null });
    assert.deepStrictEqual(map("a.b IS NOT NULL"), { "a.b": { $ne: null } });
    // Two conditions on the same attribute must both apply
    assert.deepStrictEqual(map("a > 1 AND a < 5"), { $and: [{ a: { $gt: 1 } }, { a: { $lt: 5 } }] });
  }
}

/**
 * Tests against a live MongoDB (localhost:37017, as in CI)
 */
@suite
export class MongoStoreTest extends WebdaApplicationTest {
  store: MongoStore;
  repo: MongoRepository<any>;
  sub: MongoRepository<any>;

  async beforeEach() {
    await super.beforeEach();
    this.store = await this.registerService(
      new MongoStore(
        "mongo",
        new MongoParameters().load({ mongoUrl: MONGO_URL, collection: "webda_test", models: ["Webda/User"] })
      )
    )
      .resolve()
      .init();
    await this.store.__clean();
    const getCollection = () => this.store._connect();
    this.repo = new MongoRepository(Item as any, ["uuid"], getCollection);
    this.sub = new MongoRepository(SubItem as any, ["uuid"], getCollection);
  }

  async afterEach() {
    await this.store?.stop();
  }

  @test
  async crud() {
    const item = await this.repo.create({ uuid: "i1", name: "first", count: 1 });
    assert.ok(item instanceof Item);
    await assert.rejects(() => this.repo.create({ uuid: "i1" }), /Already exists: i1/);
    // create without save does not persist
    await this.repo.create({ uuid: "i2" }, false);
    assert.strictEqual(await this.repo.exists("i2"), false);
    assert.strictEqual(await this.repo.exists("i1"), true);

    const got = await this.repo.get("i1");
    assert.ok(got instanceof Item);
    assert.strictEqual(got.name, "first");
    assert.strictEqual(got.__type, "Test/Item");
    assert.ok(!Object.keys(got).includes("__type"));
    await assert.rejects(() => this.repo.get("unknown"), /Not found: unknown/);

    await this.repo.update({ uuid: "i1", name: "second", count: 1 }, "name", "first");
    assert.strictEqual((await this.repo.get("i1")).name, "second");
    await assert.rejects(
      () => this.repo.update({ uuid: "i1", name: "third" }, "name", "first"),
      UpdateConditionFailError
    );

    await this.repo.patch("i1", { count: 5, _id: "ignored" } as any);
    await this.repo.patch("i1", { name: "patched" }, "count", 5);
    let current = await this.repo.get("i1");
    assert.strictEqual(current.count, 5);
    assert.strictEqual(current.name, "patched");
    await assert.rejects(() => this.repo.patch("i1", { name: "no" }, "count", 3), UpdateConditionFailError);

    await this.repo.removeAttribute("i1", "name");
    assert.strictEqual((await this.repo.get("i1")).name, undefined);
    await assert.rejects(() => this.repo.removeAttribute("i1", "count", "count", 1), UpdateConditionFailError);
    await assert.rejects(() => this.repo.removeAttribute("unknown", "count"), StoreNotFoundError);

    await this.repo.incrementAttributes("i1", ["count", { property: "count", value: 2 }] as any);
    assert.strictEqual((await this.repo.get("i1")).count, 7);
    await this.repo.incrementAttributes("i1", { count: -2 } as any);
    current = await this.repo.get("i1");
    assert.strictEqual(current.count, 5);
    await assert.rejects(() => this.repo.incrementAttributes("unknown", ["count"] as any), StoreNotFoundError);
    await assert.rejects(
      () => this.repo.incrementAttributes("i1", ["count"] as any, "count", 0),
      UpdateConditionFailError
    );

    await assert.rejects(() => this.repo.delete("i1", "count", 0), UpdateConditionFailError);
    await this.repo.delete("i1", "count", 5);
    assert.strictEqual(await this.repo.exists("i1"), false);
    // Deleting an unknown item without condition is silent
    await this.repo.delete("i1");
  }

  @test
  async collections() {
    await this.repo.create({ uuid: "c1" });
    await this.repo.upsertItemToCollection("c1", "items", { id: "a", value: 1 });
    await this.repo.upsertItemToCollection("c1", "items", { id: "b", value: 2 });
    await this.repo.upsertItemToCollection("c1", "items", { id: "b2", value: 3 }, 1, "id", "b");
    assert.deepStrictEqual((await this.repo.get("c1")).items, [
      { id: "a", value: 1 },
      { id: "b2", value: 3 }
    ]);
    await this.repo.upsertItemToCollection("c1", "items", { id: "a2", value: 4 }, 0);
    await assert.rejects(
      () => this.repo.upsertItemToCollection("c1", "items", { id: "x", value: 0 }, 1, "id", "b"),
      UpdateConditionFailError
    );
    await assert.rejects(
      () => this.repo.upsertItemToCollection("unknown", "items", { id: "x", value: 0 }),
      StoreNotFoundError
    );

    await assert.rejects(
      () => this.repo.deleteItemFromCollection("c1", "items", 0, "id", "a"),
      UpdateConditionFailError
    );
    await this.repo.deleteItemFromCollection("c1", "items", 0, "id", "a2");
    assert.deepStrictEqual((await this.repo.get("c1")).items, [{ id: "b2", value: 3 }]);
    await this.repo.deleteItemFromCollection("c1", "items", 0);
    assert.deepStrictEqual((await this.repo.get("c1")).items, []);
    await assert.rejects(() => this.repo.deleteItemFromCollection("unknown", "items", 0), StoreNotFoundError);
  }

  @test
  async queryIsNull() {
    const collection = await this.store._connect();
    // A null field, a missing field and a value
    await collection.insertMany(<any[]>[
      { _id: "null", uuid: "null", name: null },
      { _id: "missing", uuid: "missing" },
      { _id: "set", uuid: "set", name: "set" }
    ]);
    const uuids = async (query: string) => (await this.repo.query(query)).results.map(r => r.uuid).sort();
    assert.deepStrictEqual(await uuids("name IS NULL"), ["missing", "null"]);
    assert.deepStrictEqual(await uuids("name IS NOT NULL"), ["set"]);
    assert.deepStrictEqual(await uuids("name IS NULL AND uuid = 'null'"), ["null"]);
  }

  @test
  async bulkStatements() {
    for (let i = 0; i < 6; i++) {
      await this.repo.create({ uuid: `b${i}`, name: i % 2 ? "odd" : "even", count: i });
    }
    await this.sub.create({ uuid: "s1", name: "odd", count: 100 });
    const events = new EventRepository(Item as any, ["uuid"], this.repo as any);
    const seen: string[] = [];
    for (const name of ["Delete", "Deleted", "Patch", "Patched", "Update", "Updated", "PartialUpdated"]) {
      events.on(name as any, () => seen.push(name));
    }
    // query / iterate are SELECT only
    for (const statement of ["DELETE", "UPDATE SET name = 'x'", "SELECT name"]) {
      await assert.rejects(() => this.repo.query(statement), WebdaQL.WebdaQLError, statement);
    }
    // UPDATE: several fields, dotted target, bound parameters; the WHERE field changes
    assert.strictEqual(
      await events.updateMany("UPDATE SET name = :n, profile.level = :l WHERE name = 'odd' AND count < :max", {
        n: "even",
        l: 3,
        max: 10
      }),
      3
    );
    const b1: any = await this.repo.get("b1");
    assert.strictEqual(b1.name, "even");
    assert.deepStrictEqual(b1.profile, { level: 3 });
    // The subclass row is reached through the parent repository (class filter), only by the WHERE
    assert.strictEqual(((await this.sub.get("s1")) as any).name, "odd");
    // LIMIT
    assert.strictEqual(await events.updateMany("UPDATE SET count = 0 WHERE count > 0 AND count < 3 LIMIT 5"), 2);
    assert.strictEqual(await events.updateMany("UPDATE SET name = 'limited' WHERE count < 100 LIMIT 1"), 1);
    assert.strictEqual((await this.repo.query("name = 'limited'")).results.length, 1);
    assert.strictEqual((await this.repo.query("count = 0")).results.length, 3);
    await assert.rejects(() => events.updateMany("UPDATE SET uuid = 'x'"), /primary key/);
    await assert.rejects(() => events.updateMany("UPDATE SET __type = 'x'"), /private field/);
    // DELETE with LIMIT, with WHERE, without WHERE (the subclass repository only sees its own rows)
    assert.strictEqual(await events.deleteMany("DELETE WHERE count = ? LIMIT 2", [0]), 2);
    assert.strictEqual(await events.deleteMany("DELETE WHERE count >= 3 AND count < 100"), 3);
    assert.strictEqual(await this.sub.deleteMany("DELETE"), 1);
    assert.strictEqual((await this.repo.query("")).results.length, 1);
    assert.strictEqual(await events.deleteMany("DELETE LIMIT 0"), 0);
    assert.deepStrictEqual(seen, [], "bulk statements emit no per-object event");
  }

  @test
  async queryParityWithMemory() {
    const getCollection = () => this.store._connect();
    const repo = new MongoRepository(Row as any, ["uuid"], getCollection);
    const memory = new MemoryRepository<any>(Row as any, ["uuid"]);
    for (const row of PARITY_ROWS) {
      await repo.create({ ...row });
      await memory.create(new Row({ ...row }));
    }
    const uuids = async (r: any, q: string) => (await r.query(q)).results.map((o: any) => o.uuid).sort();
    for (const query of PARITY_QUERIES) {
      assert.deepStrictEqual(await uuids(repo, query), await uuids(memory, query), query);
    }
  }

  @test
  async forgedStatementObjectsCannotInject() {
    for (const uuid of ["a", "b", "c"]) {
      await this.repo.create({ uuid, name: uuid });
    }
    const forged: [string, (q: any) => void][] = [
      ["DELETE WHERE uuid = 'nope'", q => ((q.filter.attribute = ["$where"]), (q.filter.value = "true"))],
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.value = { $ne: "nope" })],
      ["DELETE WHERE uuid IN ['nope']", q => (q.filter.value = [{ $ne: "nope" }])],
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.attribute = ["name", "$"])],
      ["UPDATE SET name = 'x'", q => (q.assignments = [{ field: "$inc", value: 1 }])],
      ["UPDATE SET name = 'x'", q => (q.assignments = [{ field: "name", value: { $gt: "" } }])]
    ];
    for (const [statement, change] of forged) {
      const q: any = parse(statement);
      change(q);
      await assert.rejects(
        () => (q.type === "DELETE" ? this.repo.deleteMany(q) : this.repo.updateMany(q)),
        WebdaQL.WebdaQLError,
        `${statement} ${change}`
      );
      if (q.type === "DELETE") {
        await assert.rejects(() => this.repo.query({ ...q, type: "SELECT" }), WebdaQL.WebdaQLError, statement);
      }
    }
    assert.strictEqual((await this.repo.query("")).results.length, 3, "nothing was deleted");
    // LIMIT 0 affects nothing, also through PrependCondition
    assert.strictEqual(await this.repo.deleteMany(WebdaQL.PrependCondition("DELETE LIMIT 0", "name = 'a'")), 0);
    assert.strictEqual(await this.repo.updateMany("UPDATE SET name = 'z' LIMIT 0"), 0);
    // A child repository never reaches its parent's rows
    await this.sub.create({ uuid: "s1", name: "a" });
    assert.strictEqual(await this.sub.updateMany("UPDATE SET name = 'sub'"), 1);
    assert.strictEqual(((await this.repo.get("a")) as any).name, "a");
    assert.strictEqual(await this.sub.deleteMany("DELETE WHERE name = 'sub' LIMIT 5"), 1);
    assert.strictEqual((await this.repo.query("")).results.length, 3);
    // Arrays are indexed
    await this.repo.create({ uuid: "t", tags: ["t1", "t2"] });
    assert.strictEqual(await this.repo.updateMany("UPDATE SET tags.0 = 'n' WHERE uuid = 't'"), 1);
    assert.deepStrictEqual(((await this.repo.get("t")) as any).tags, ["n", "t2"]);
  }

  @test
  async parentWritesKeepTheChildType() {
    await this.sub.create({ uuid: "s1", name: "a" });
    await this.sub.create({ uuid: "s2", name: "b" });
    await this.sub.create({ uuid: "s3", name: "c" });
    // Plain data (ModelRef.update), with a forged `__type` key, and an instance read through the parent
    await this.repo.update({ uuid: "s1", name: "plain" });
    await this.repo.update({ uuid: "s2", name: "forged", __type: "Test/Item" });
    await this.repo.update(await this.repo.get("s3"));
    assert.deepStrictEqual((await this.sub.query("")).results.map((r: any) => r.uuid).sort(), ["s1", "s2", "s3"]);
    assert.strictEqual(((await this.sub.get("s1")) as any).name, "plain");
    const docs = await (await this.store._connect()).find({}).toArray();
    assert.deepStrictEqual(
      docs.map(d => d.__type),
      ["Test/SubItem", "Test/SubItem", "Test/SubItem"]
    );
    // A legacy document stays unstamped, a `$` value stays data
    await (await this.store._connect()).insertOne({ _id: <any>"legacy", uuid: "legacy" });
    await this.repo.update({ uuid: "legacy", name: "$name" });
    const legacy: any = await (await this.store._connect()).findOne({ _id: <any>"legacy" });
    assert.strictEqual(legacy.__type, undefined);
    assert.strictEqual(legacy.name, "$name");
    await (await this.store._connect()).deleteOne({ _id: <any>"legacy" });
    // An instance of a class writes its own type
    await this.repo.update(new Item({ uuid: "s1" }));
    assert.deepStrictEqual((await this.sub.query("")).results.map((r: any) => r.uuid).sort(), ["s2", "s3"]);
  }

  @test
  async query() {
    for (let i = 0; i < 10; i++) {
      await this.repo.create({ uuid: `q${i}`, name: `name${i}`, count: i, tags: i % 2 ? ["odd"] : ["even"] });
    }
    await this.sub.create({ uuid: "s1", name: "sub", count: 100 });
    // Legacy document without __type is considered as the repository model
    await (await this.store._connect()).insertOne({ _id: <any>"legacy", uuid: "legacy", count: 200 });

    let res = await this.repo.query("count >= 5 AND count < 8");
    assert.deepStrictEqual(res.results.map(r => r.uuid).sort(), ["q5", "q6", "q7"]);
    res = await this.repo.query("tags CONTAINS 'odd' ORDER BY count DESC LIMIT 2");
    assert.deepStrictEqual(
      res.results.map(r => r.uuid),
      ["q9", "q7"]
    );
    assert.strictEqual(res.continuationToken, "2");
    res = await this.repo.query(`tags CONTAINS 'odd' ORDER BY count DESC LIMIT 2 OFFSET '${res.continuationToken}'`);
    assert.deepStrictEqual(
      res.results.map(r => r.uuid),
      ["q5", "q3"]
    );
    res = await this.repo.query("name LIKE 'name1%'");
    assert.deepStrictEqual(
      res.results.map(r => r.uuid),
      ["q1"]
    );
    res = await this.repo.query("FALSE");
    assert.strictEqual(res.results.length, 0);
    // Parent sees subclasses and legacy documents
    res = await this.repo.query("count >= 100");
    assert.deepStrictEqual(res.results.map(r => r.uuid).sort(), ["legacy", "s1"]);
    assert.ok(res.results.find(r => r.uuid === "s1") instanceof Item);
    // Subclass only sees its own documents (and legacy ones)
    res = await this.sub.query("");
    assert.deepStrictEqual(res.results.map(r => r.uuid).sort(), ["legacy", "s1"]);

    // Iterate goes through all pages
    const all = [];
    for await (const item of this.repo.iterate("count < 10 LIMIT 3")) {
      all.push(item.uuid);
    }
    assert.strictEqual(all.length, 10);
  }

  @test
  async storeIntegration() {
    const User = useModel("Webda/User");
    const repo = this.store.getRepository(User);
    assert.ok(repo instanceof EventRepository);
    assert.strictEqual(this.store.getRepository(User), repo, "repository should be cached");
    const user = await repo.create(<any>{ uuid: "u1", email: "u1@webda.io" });
    assert.strictEqual((await repo.get("u1" as any)).email, "u1@webda.io");
    assert.strictEqual(user.uuid, "u1");
    const res = await repo.query("email = 'u1@webda.io'");
    assert.strictEqual(res.results.length, 1);
  }

  @test
  async createWithoutPrimaryKeyPersistsGeneratedUuid() {
    // Check both the EventRepository returned by the store and the underlying MongoRepository
    const User = useModel("Webda/User");
    await checkCreateWithoutPrimaryKey(
      [this.store.getRepository(User), new MongoRepository(User, ["uuid"], () => this.store._connect())],
      {
        data: i => ({ email: `gen${i}@webda.io` }),
        readStored: async key => (await (await this.store._connect()).findOne({ _id: <any>key })) ?? undefined
      }
    );
  }

  @test
  async stopAndReconnect() {
    await this.store.stop();
    assert.strictEqual(this.store._client, undefined);
    // Stop twice is safe
    await this.store.stop();
    // Repository reconnects lazily
    await this.repo.create({ uuid: "r1" });
    assert.ok(await this.repo.exists("r1"));
    // Data is in the configured database
    const client = await new MongoClient(MONGO_URL).connect();
    try {
      assert.strictEqual(
        await client
          .db()
          .collection("webda_test")
          .countDocuments({ _id: <any>"r1" }),
        1
      );
    } finally {
      await client.close();
    }
  }
}
