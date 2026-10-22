import { EventRepository, MemoryRepository, UpdateConditionFailError, useModel } from "@webda/core";
import {
  checkAggregation,
  checkCount,
  checkCountClassFilter,
  checkCreateWithoutPrimaryKey,
  WebdaApplicationTest
} from "@webda/core/lib/test";
import { AndExpression, escape, parse, PrependCondition, WebdaQLError } from "@webda/ql";
import { SQLRepository } from "@webda/sql";
import { AggA, AggB, Animal, Cat, Dog, PARITY_QUERIES, PARITY_ROWS, Row } from "@webda/sql/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetDatabases } from "./dbregistry.js";
import { SQLiteDialect } from "./dialect.js";
import SQLiteStore, { SQLiteStoreParameters } from "./sqlitestore.service.js";

/**
 * The SQLite store suite: run once in memory and once on a file (the two @suite subclasses)
 */
abstract class SQLiteStoreSuite extends WebdaApplicationTest {
  store!: SQLiteStore;

  abstract readonly mode: "memory" | "file";

  abstract connection(name: string): Partial<SQLiteStoreParameters>;

  async beforeEach() {
    await super.beforeEach();
    this.store = await this.makeStore("smoke", {
      ...this.connection("smoke"),
      table: "smoke_idents",
      models: ["Webda/OwnerModel"]
    });
    await this.store.__clean();
  }

  /**
   * Register, resolve and init a store with typed parameters (the module loader is not involved in these specs)
   * @param name - the service name
   * @param params - the parameters
   * @returns the store
   */
  async makeStore(name: string, params: Record<string, any>): Promise<SQLiteStore> {
    const store = new SQLiteStore(name, new SQLiteStoreParameters().load(params));
    this.registerService(store as any, name);
    return store.resolve().init();
  }

  async afterEach() {
    await this.store?.stop();
    __resetDatabases();
    await super.afterEach();
  }

  /**
   * A repository on the store database without events, like the Postgres smoke tests
   * @param model - the model class
   * @param table - the table
   * @param tableModel - the table model
   * @returns the repository
   */
  repo(model: any = Row, table = "smoke_idents", tableModel?: string): SQLRepository<any> {
    return new SQLRepository<any>(
      model,
      ["uuid"],
      this.store.getClient()!,
      table,
      undefined,
      undefined,
      tableModel,
      new SQLiteDialect()
    );
  }

  /**
   * @returns the store client
   */
  client() {
    return this.store.getClient()!;
  }

  @test
  async createTableOnInit() {
    const res = await this.client().query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'smoke_idents'`
    );
    assert.strictEqual(res.rowCount, 1);
  }

  @test
  async checkTableIsIdempotentAndSkippedWithoutAutoCreate() {
    await this.store.checkTable();
    await this.store.checkTable();
    const tables = async () =>
      (await this.client().query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'smoke%'`)).rows
        .map(r => r.name)
        .sort();
    assert.deepStrictEqual(await tables(), ["smoke_idents"]);
    this.store.getParameters().autoCreateTable = false;
    await this.store.ensureTable(this.repo(Row, "smoke_other"));
    assert.deepStrictEqual(await tables(), ["smoke_idents"], "no DDL without autoCreateTable");
    this.store.getParameters().autoCreateTable = true;
    await this.store.ensureTable(this.repo(Row, "smoke_other"));
    assert.deepStrictEqual(await tables(), ["smoke_idents", "smoke_other"]);
  }

  @test
  async collectionIndexBeyondTheEndAppends() {
    const repo = this.repo();
    await repo.create({ uuid: "a", files: [{ name: "f0" }] });
    await repo.upsertItemToCollection("a", "files", { name: "f5" }, 5);
    await repo.upsertItemToCollection("a", "files", { name: "f1" }, 1);
    await repo.upsertItemToCollection("a", "files", { name: "f0b" }, 0);
    assert.deepStrictEqual(((await repo.get("a")) as any).files, [{ name: "f0b" }, { name: "f1" }]);
    // An append with a write condition never matches, like the other stores
    await assert.rejects(
      () => repo.upsertItemToCollection("a", "files", { name: "x" }, undefined, "name", "f1"),
      UpdateConditionFailError
    );
    await assert.rejects(
      () => repo.deleteItemFromCollection("a", "files", 1, "name", "nope"),
      UpdateConditionFailError
    );
    await repo.deleteItemFromCollection("a", "files", 1, "name", "f1");
    assert.deepStrictEqual(((await repo.get("a")) as any).files, [{ name: "f0b" }]);
  }

  @test
  async cleanTruncatesAllRows() {
    await this.client().query(`INSERT INTO smoke_idents(uuid,data) VALUES(?1, ?2)`, ["a", JSON.stringify({ x: 1 })]);
    await this.store.__clean();
    assert.strictEqual((await this.client().query(`SELECT count(*) AS n FROM smoke_idents`)).rows[0].n, 0);
  }

  @test
  async createWithoutPrimaryKeyPersistsGeneratedUuid() {
    await checkCreateWithoutPrimaryKey(
      [this.store.getRepository(useModel("Webda/OwnerModel")), this.store.getRepositories()[0]],
      {
        data: () => ({ _type: "google" }),
        readStored: async key => {
          const row = (await this.client().query(`SELECT data FROM smoke_idents WHERE uuid=?1`, [key])).rows[0];
          return row ? JSON.parse(row.data) : undefined;
        }
      }
    );
  }

  @test
  async crudAndWriteConditions() {
    const repo = this.repo();
    await repo.create({ uuid: "a", n: 1, s: "x" });
    await assert.rejects(() => repo.create({ uuid: "a" }), /Already exists: a/);
    assert.strictEqual(await repo.exists("a"), true);
    assert.strictEqual(await repo.exists("zz"), false);
    await repo.patch("a", { n: 2, profile: { k: 1 } });
    await repo.patch("a", { profile: { other: 2 } });
    assert.deepStrictEqual(
      { ...(await repo.get("a")) },
      { uuid: "a", n: 2, s: "x", profile: { other: 2 } },
      "patch replaces top-level keys"
    );
    await assert.rejects(() => repo.patch("a", { n: 3 }, "n", 99));
    await repo.update({ uuid: "a", n: 3 }, "n", 2);
    await repo.removeAttribute("a", "s");
    await assert.rejects(() => repo.removeAttribute("zz", "s"));
    await repo.incrementAttributes("a", { n: 2, counter: 5 } as any);
    const row: any = await repo.get("a");
    assert.strictEqual(row.n, 5);
    assert.strictEqual(row.counter, 5);
    assert.strictEqual(row.s, undefined);
    assert.ok(row._lastUpdate);
    await repo.delete("a", "n", 5);
    await assert.rejects(() => repo.get("a"), /Not found/);
  }

  @test
  async queryIsNull() {
    for (const [uuid, data] of [
      ["null", { uuid: "null", email: null }],
      ["missing", { uuid: "missing" }],
      ["set", { uuid: "set", email: "set@webda.io" }]
    ] as const) {
      await this.client().query(`INSERT INTO smoke_idents(uuid,data) VALUES(?1, ?2)`, [uuid, JSON.stringify(data)]);
    }
    const repo = this.store.getRepository(useModel("Webda/OwnerModel"));
    const uuids = async (query: string) => (await repo.query(query)).results.map((r: any) => r.uuid).sort();
    assert.deepStrictEqual(await uuids("email IS NULL"), ["missing", "null"]);
    assert.deepStrictEqual(await uuids("email IS NOT NULL"), ["set"]);
    assert.deepStrictEqual(await uuids("email IS NULL AND uuid = 'null'"), ["null"]);
  }

  @test
  async aggregationConformance() {
    const repo = this.repo(Row, "agg_rows");
    await repo.setupTable();
    await checkAggregation(repo as any, { native: true });
  }

  @test
  async countConformance() {
    const repo = this.repo(Row, "count_rows");
    await repo.setupTable();
    await checkCount(repo as any, { native: true });
  }

  @test
  async countStaysInTheModelHierarchy() {
    await checkCountClassFilter(
      this.repo(Animal, "smoke_idents") as any,
      this.repo(Dog, "smoke_idents") as any,
      async (repo: any, uuid) => void (await repo.create(new (repo.getRootModel())({ uuid })))
    );
  }

  @test
  async aggregationSQLValidatesTheQuery() {
    const repo: any = this.repo(class {}, "t");
    assert.throws(
      () =>
        repo.buildAggregationSQL({
          filter: new AndExpression([]),
          groupBy: [],
          metrics: { 'n" FROM t; DROP TABLE t; --': { fn: "COUNT" } }
        }),
      WebdaQLError
    );
  }

  @test
  async likeIsCaseSensitive() {
    const repo = this.repo();
    await repo.create({ uuid: "a", s: "Abc" });
    await repo.create({ uuid: "b", s: "abc" });
    assert.deepStrictEqual(
      (await repo.query("s LIKE 'a%'")).results.map((r: any) => r.uuid),
      ["b"]
    );
    assert.deepStrictEqual((await repo.query("s LIKE '_bc'")).results.map((r: any) => r.uuid).sort(), ["a", "b"]);
  }

  @test
  async rawMigrationAccess() {
    const repo = this.repo();
    for (const uuid of ["a", "b", "c"]) await repo.create({ uuid });
    const page = await this.store.rawPages("smoke_idents", 2);
    assert.deepStrictEqual(
      page.rows.map(r => r.key),
      ["a", "b"]
    );
    assert.strictEqual(page.continuationToken, "b");
    const last = await this.store.rawPages("smoke_idents", 2, "b");
    assert.deepStrictEqual(
      last.rows.map(r => r.key),
      ["c"]
    );
    assert.strictEqual(last.continuationToken, undefined);
    await this.store.rawPatch("smoke_idents", "a", { __type: "Webda/User" });
    await assert.rejects(() => this.store.rawPatch("smoke_idents", "zz", { x: 1 }), /not found/);
    await assert.rejects(() => this.store.rawPages("other", 2), /Unknown table/);
    const counts = await this.store.countStoredTypes(100);
    assert.strictEqual(counts.tables.smoke_idents["Webda/User"], 1);
  }

  @test
  async rawPagesMarksNonObjectDocumentsUnreadable() {
    await this.client().query("INSERT INTO smoke_idents (uuid, data) VALUES (?1, ?2)", ["broken", "123"]);
    const page = await this.store.rawPages("smoke_idents", 10);
    assert.deepStrictEqual(page.rows, [{ table: "smoke_idents", key: "broken", data: {}, unreadable: true }]);
  }

  @test
  async getRepositoryWrapsInEventRepository() {
    assert.ok(this.store.getRepository(useModel("Webda/OwnerModel")) instanceof EventRepository);
    assert.ok(this.store.getRepositories().every(r => r instanceof SQLRepository));
  }

  @test
  async apostropheInValues() {
    const c = this.client();
    const name = "l'été.png";
    const injection = "x' OR 1=1 --";
    await c.query(`INSERT INTO smoke_idents(uuid,data) VALUES(?1, ?2)`, ["a", JSON.stringify({ uuid: "a", name })]);
    await c.query(`INSERT INTO smoke_idents(uuid,data) VALUES(?1, ?2)`, [
      "b",
      JSON.stringify({ uuid: "b", name: "b" })
    ]);
    const pgRepo = this.store.getRepositories()[0];
    // Collection items are written with the value inside: append then replace
    await pgRepo.upsertItemToCollection("a", "files", { name, hash: injection });
    await pgRepo.upsertItemToCollection("a", "files", { name: "o'brien.txt", hash: "h2" });
    await pgRepo.upsertItemToCollection("a", "files", { name: "it's.txt", hash: "h3" }, 1, "hash", "h2");
    const stored = JSON.parse((await c.query(`SELECT data FROM smoke_idents WHERE uuid=?1`, ["a"])).rows[0].data);
    assert.deepStrictEqual(stored.files, [
      { name, hash: injection },
      { name: "it's.txt", hash: "h3" }
    ]);
    // The other row was not touched by the injection attempt
    assert.strictEqual(
      JSON.parse((await c.query(`SELECT data FROM smoke_idents WHERE uuid=?1`, ["b"])).rows[0].data).files,
      undefined
    );
    // Querying on the value matches exactly, through both escaping forms
    const repo = this.store.getRepository(useModel("Webda/OwnerModel"));
    const uuids = async (query: string) => (await repo.query(query)).results.map((r: any) => r.uuid).sort();
    assert.deepStrictEqual(await uuids(escape(["name = ", ""], [name])), ["a"]);
    assert.deepStrictEqual(await uuids("name = 'l''été.png'"), ["a"]);
    assert.deepStrictEqual(await uuids("name LIKE 'l''%'"), ["a"]);
    assert.deepStrictEqual(await uuids(escape(["name = ", ""], [injection])), []);
  }

  @test
  async bulkStatements() {
    /** A model without metadata: no field list to validate against */
    class Row {
      uuid: string;
      name?: string;
      count?: number;
      profile?: any;
      /**
       * @param data - initial data
       */
      constructor(data?: any) {
        Object.assign(this, data);
      }
    }
    const repo = this.repo(Row, "smoke_idents");
    for (let i = 0; i < 6; i++) {
      await repo.create({ uuid: `b${i}`, name: i % 2 ? "odd" : "even", count: i, profile: { keep: i } });
    }
    // query / iterate are SELECT only
    for (const statement of ["DELETE", "UPDATE SET name = 'x'", "SELECT name"]) {
      await assert.rejects(() => repo.query(statement), WebdaQLError, statement);
    }
    // UPDATE: several fields, dotted targets (existing and missing parents), bound parameters, quotes
    assert.strictEqual(
      await repo.updateMany(
        "UPDATE SET name = :n, profile.level = :l, profile.deep.flag = TRUE, extra.a.b = 'it''s' WHERE name = 'odd' AND count < :max",
        { n: "even", l: 3, max: 10 }
      ),
      3
    );
    const b1: any = await repo.get("b1");
    assert.strictEqual(b1.name, "even");
    assert.deepStrictEqual(b1.profile, { keep: 1, level: 3, deep: { flag: true } });
    assert.deepStrictEqual(b1.extra, { a: { b: "it's" } });
    assert.deepStrictEqual(((await repo.get("b0")) as any).profile, { keep: 0 });
    // LIMIT
    assert.strictEqual(await repo.updateMany("UPDATE SET count = 0 WHERE count > 0 AND count < 3 LIMIT 5"), 2);
    assert.strictEqual(await repo.updateMany("UPDATE SET name = 'limited' LIMIT 1"), 1);
    assert.strictEqual((await repo.query("name = 'limited'")).results.length, 1);
    await assert.rejects(() => repo.updateMany("UPDATE SET uuid = 'x'"), /primary key/);
    await assert.rejects(() => repo.updateMany("UPDATE SET profile.__h = 'x'"), /private field/);
    // DELETE with LIMIT, with WHERE, without WHERE
    assert.strictEqual(await repo.deleteMany("DELETE WHERE count = ? LIMIT 2", [0]), 2);
    assert.strictEqual(await repo.deleteMany("DELETE WHERE count >= 3"), 3);
    assert.strictEqual(await repo.deleteMany("DELETE LIMIT 0"), 0);
    assert.strictEqual(await repo.deleteMany("DELETE"), 1);
    assert.strictEqual((await repo.query("")).results.length, 0);

    // Through the store repository: no per-object event, SET targets checked against the model fields
    const events = this.store.getRepository(useModel("Webda/OwnerModel"));
    const seen: string[] = [];
    for (const name of ["Delete", "Deleted", "Patch", "Patched", "Update", "Updated", "PartialUpdated"]) {
      events.on(name as any, () => seen.push(name));
    }
    await events.create({ uuid: "o1", _user: "alice" } as any);
    await events.create({ uuid: "o2", _user: "bob" } as any);
    seen.length = 0;
    assert.strictEqual(await events.updateMany("UPDATE SET public = TRUE WHERE _user = ?", ["alice"]), 1);
    assert.strictEqual(((await events.get("o1" as any)) as any).public, true);
    await assert.rejects(() => events.updateMany("UPDATE SET unknown = 1"), /Unknown assignment field/);
    assert.strictEqual(await events.deleteMany("DELETE WHERE public = TRUE"), 1);
    assert.deepStrictEqual(seen, [], "bulk statements emit no per-object event");
  }

  @test
  async aggregationStaysInTheModelHierarchy() {
    const client = this.client();
    await client.query("DROP TABLE IF EXISTS agg_iso");
    try {
      const a = this.repo(AggA, "agg_iso", "Test/AggA");
      const b = this.repo(AggB, "agg_iso", "Test/AggA");
      await a.setupTable();
      await a.create({ uuid: "x", kind: "k1" });
      await a.create({ uuid: "y", kind: "k2" });
      await b.create({ uuid: "z", kind: "k1" });
      await b.create({ uuid: "w", kind: "k3" });
      // Written before stamping: belongs to the table model
      await client.query(`INSERT INTO agg_iso(uuid,data) VALUES(?1, ?2)`, [
        "old",
        JSON.stringify({ uuid: "old", kind: "k1" })
      ]);
      for (const filter of [undefined, "uuid = 'x' OR uuid = 'z' OR uuid = 'old'"]) {
        const total = await a.aggregate({ filter, metrics: { n: { count: "*" } } } as any);
        assert.deepStrictEqual(total.rows, [{ n: filter ? 2 : 3 }], String(filter));
        const grouped = await a.aggregate({
          filter,
          groupBy: ["kind"],
          metrics: { n: { count: "*" } },
          orderBy: [{ key: "kind", direction: "ASC" }]
        } as any);
        assert.deepStrictEqual(
          grouped.rows,
          filter
            ? [{ kind: "k1", n: 2 }]
            : [
                { kind: "k1", n: 2 },
                { kind: "k2", n: 1 }
              ],
          String(filter)
        );
        assert.strictEqual(total.native, true);
      }
      const other = await b.aggregate({ metrics: { n: { count: "*" } } } as any);
      assert.deepStrictEqual(other.rows, [{ n: 2 }]);
    } finally {
      await client.query("DROP TABLE IF EXISTS agg_iso");
    }
  }

  @test
  async queryParityWithMemory() {
    const repo = this.repo(Row, "smoke_idents");
    const memory = new MemoryRepository<any>(Row as any, ["uuid"]);
    for (const row of PARITY_ROWS) {
      await repo.create({ ...row });
      await memory.create(new Row({ ...row }));
    }
    const uuids = async (r: any, q: string) => (await r.query(q)).results.map((o: any) => o.uuid).sort();
    for (const query of PARITY_QUERIES) {
      assert.deepStrictEqual(await uuids(repo, query), await uuids(memory, query), query);
    }
    // A bulk statement affects the same rows as the query
    assert.strictEqual(await repo.deleteMany("DELETE WHERE n < 2"), 1);
    assert.strictEqual(await repo.updateMany("UPDATE SET hit = TRUE WHERE b = FALSE"), 1);
  }

  @test
  async forgedStatementObjectsCannotInject() {
    const repo = this.repo(Row, "smoke_idents");
    for (const uuid of ["a", "b", "c"]) {
      await repo.create({ uuid, name: uuid });
    }
    const forged: [string, (q: any) => void][] = [
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.attribute = ["x}' IS NULL OR TRUE OR data ->> '$.y"])],
      ["DELETE WHERE uuid = 'nope'", q => (q.filter = { eval: () => true, toString: () => "TRUE" })],
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.value = { toString: () => "x' OR TRUE --" })],
      ["DELETE LIMIT 1", q => (q.limit = "1; DROP TABLE smoke_idents")],
      ["UPDATE SET name = 'x'", q => (q.assignments = [{ field: "na'me}", value: "x" }])]
    ];
    for (const [statement, change] of forged) {
      const q: any = parse(statement);
      change(q);
      await assert.rejects(
        () => (q.type === "DELETE" ? repo.deleteMany(q) : repo.updateMany(q)),
        WebdaQLError,
        `${statement} ${change}`
      );
      if (q.type === "DELETE") {
        await assert.rejects(() => repo.query({ ...q, type: "SELECT" } as any), WebdaQLError);
      }
    }
    assert.strictEqual((await repo.query("")).results.length, 3, "nothing was deleted");
    // LIMIT 0 affects nothing, also through PrependCondition
    assert.strictEqual(await repo.deleteMany(PrependCondition("DELETE LIMIT 0", "name = 'a'")), 0);
    assert.strictEqual(await repo.updateMany("UPDATE SET name = 'z' LIMIT 0"), 0);
    assert.strictEqual((await repo.query("name = 'z'")).results.length, 0);
  }

  @test
  async updateThroughAnArrayIndex() {
    const repo = this.repo(Row, "smoke_idents");
    await repo.create({ uuid: "t", tags: ["t1", "t2"], list: [{ v: 1 }, { v: 2 }] });
    assert.strictEqual(await repo.updateMany("UPDATE SET tags.0 = 'n', list.1.v = 3"), 1);
    const row: any = await repo.get("t");
    assert.deepStrictEqual(row.tags, ["n", "t2"]);
    assert.deepStrictEqual(row.list, [{ v: 1 }, { v: 3 }]);
  }

  @test
  async bulkStaysInTheModelHierarchy() {
    const client = this.client();
    const animals = this.repo(Animal, "smoke_idents");
    const dogs = this.repo(Dog, "smoke_idents");
    await animals.create(new Animal({ uuid: "a1", kind: "cat" }));
    await dogs.create(new Dog({ uuid: "d1", kind: "dog" }));
    assert.deepStrictEqual(
      (await dogs.query("")).results.map((r: any) => r.uuid),
      ["d1"]
    );
    assert.strictEqual(await dogs.updateMany("UPDATE SET kind = 'x'"), 1);
    assert.strictEqual(((await animals.get("a1")) as any).kind, "cat");
    assert.ok(!Object.keys(await animals.get("a1")).includes("__type"));
    assert.strictEqual(await dogs.deleteMany("DELETE"), 1);
    assert.strictEqual(await animals.exists("a1"), true);
    await dogs.create(new Dog({ uuid: "d2" }));
    assert.strictEqual((await animals.query("")).results.length, 2, "the parent sees its subclasses");
    assert.strictEqual(await animals.deleteMany("DELETE"), 2);
  }

  @test
  async legacyRowsBelongToTheTableModel() {
    const client = this.client();
    // Rows written before `__type` stamping: an Animal, a Dog and a Cat that nothing tells apart
    for (const uuid of ["a1", "d1", "c1"]) {
      await client.query(`INSERT INTO smoke_idents(uuid,data) VALUES(?1, ?2)`, [uuid, JSON.stringify({ uuid })]);
    }
    const animals = this.repo(Animal, "smoke_idents");
    const dogs = this.repo(Dog, "smoke_idents");
    const cats = this.repo(Cat, "smoke_idents");
    await dogs.create(new Dog({ uuid: "d2" }));
    await cats.create(new Cat({ uuid: "c2" }));
    const uuids = async (repo: any, q = "") => (await repo.query(q)).results.map((r: any) => r.uuid).sort();
    // Unstamped rows belong to the root model of the table only
    assert.deepStrictEqual(await uuids(animals), ["a1", "c1", "c2", "d1", "d2"]);
    assert.deepStrictEqual(await uuids(dogs), ["d2"]);
    assert.deepStrictEqual(await uuids(cats), ["c2"]);
    // A filter cannot reach them through precedence either
    assert.deepStrictEqual(await uuids(cats, "uuid = 'zz' OR uuid IS NOT NULL"), ["c2"]);
    // Subclass bulk statements never touch them
    assert.strictEqual(await cats.deleteMany("DELETE"), 1);
    assert.strictEqual(await dogs.updateMany("UPDATE SET x = 1"), 1);
    assert.deepStrictEqual(await uuids(animals, "x IS NULL"), ["a1", "c1", "d1"]);
    // The backfill stamps them with the table model, once
    assert.strictEqual(await animals.backfillTypes(), 3);
    assert.strictEqual(await animals.backfillTypes(), 0);
    assert.strictEqual(await dogs.backfillTypes(), 0, "only the table model backfills");
    const stamped = await client.query(`SELECT data ->> '$.__type' AS t FROM smoke_idents WHERE uuid = 'a1'`);
    assert.strictEqual(stamped.rows[0].t, "Test/Animal");
    assert.strictEqual(await animals.deleteMany("DELETE WHERE x IS NULL"), 3);
    // The store backfills each table with its declared model
    await client.query(`INSERT INTO smoke_idents(uuid,data) VALUES(?1, ?2)`, ["o1", JSON.stringify({ uuid: "o1" })]);
    assert.ok((await this.store.backfillTypes()) >= 1);
    const owner = await client.query(`SELECT data ->> '$.__type' AS t FROM smoke_idents WHERE uuid = 'o1'`);
    assert.strictEqual(owner.rows[0].t, this.store.resolveTableModel(useModel("Webda/OwnerModel")));
    assert.strictEqual(await this.store.backfillTypes(), 0);
  }

  @test
  async parentWritesKeepTheChildType() {
    const client = this.client();
    const animals = this.repo(Animal, "smoke_idents");
    const dogs = this.repo(Dog, "smoke_idents");
    await dogs.create(new Dog({ uuid: "d2" }));
    await dogs.create(new Dog({ uuid: "d3" }));
    await client.query(`INSERT INTO smoke_idents(uuid,data) VALUES(?1, ?2)`, ["c1", JSON.stringify({ uuid: "c1" })]);
    // An instance read through the parent, and plain data (ModelRef.update)
    await animals.update(await animals.get("d2"));
    await animals.update({ uuid: "d3", x: 1 });
    await animals.update({ uuid: "c1", x: 1, __type: "Test/Dog" });
    assert.deepStrictEqual((await dogs.query("")).results.map((r: any) => r.uuid).sort(), ["d2", "d3"]);
    const types = await client.query(`SELECT uuid, data ->> '$.__type' AS t FROM smoke_idents ORDER BY uuid`);
    assert.deepStrictEqual(
      types.rows.map((r: any) => [r.uuid, r.t]),
      [
        ["c1", null],
        ["d2", "Test/Dog"],
        ["d3", "Test/Dog"]
      ]
    );
    // An instance of a class writes its own type
    await animals.update(new Animal({ uuid: "d3" }));
    assert.deepStrictEqual(
      (await dogs.query("")).results.map((r: any) => r.uuid),
      ["d2"]
    );
  }

  @test
  async persistenceAcrossStopAndInit() {
    await this.repo().create({ uuid: "a" });
    await this.store.stop();
    await this.store.init();
    // A file keeps its rows, an in-memory database is dropped at the last release (like MemoryStore)
    assert.strictEqual(await this.repo().exists("a"), this.mode === "file");
  }

  @test
  async storesSharingADatabaseShareOneHandle() {
    const shared =
      this.mode === "file"
        ? this.connection("smoke")
        : ({ database: { name: "shared" } } as Partial<SQLiteStoreParameters>);
    const a = await this.makeStore("a", { ...shared, table: "t", models: ["Webda/OwnerModel"] });
    const b = await this.makeStore("b", { ...shared, table: "t", models: ["Webda/OwnerModel"] });
    assert.strictEqual(a.getHandle(), b.getHandle());
    if (this.mode === "file") {
      assert.strictEqual(a.getHandle(), this.store.getHandle());
    }
    await new SQLRepository<any>(
      Row,
      ["uuid"],
      a.getClient()!,
      "t",
      undefined,
      undefined,
      undefined,
      new SQLiteDialect()
    ).create({
      uuid: "x"
    });
    assert.strictEqual((await b.getClient()!.query("SELECT uuid FROM t")).rowCount, 1);
    await a.stop();
    await b.stop();
  }
}

@suite
class SQLiteStoreMemoryTest extends SQLiteStoreSuite {
  readonly mode = "memory" as const;

  connection() {
    return {};
  }
}

@suite
class SQLiteStoreFileTest extends SQLiteStoreSuite {
  readonly mode = "file" as const;
  dir = mkdtempSync(join(tmpdir(), "webda-sqlite-store-"));

  connection(name: string) {
    return { persistence: { path: join(this.dir, `${name}.sqlite`) } };
  }

  async afterAll() {
    rmSync(this.dir, { recursive: true, force: true });
    await super.afterAll();
  }
}
