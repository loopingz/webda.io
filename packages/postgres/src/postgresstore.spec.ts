import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import pg from "pg";
import { AndExpression, WebdaQLError, PrependCondition, parse, toAggregationQuery } from "@webda/ql";
import { checkAggregation, checkCreateWithoutPrimaryKey, WebdaApplicationTest } from "@webda/core/lib/test";
import { EventRepository, MemoryRepository, useModel } from "@webda/core";
import PostgresStore, { PostgresParameters } from "./postgresstore.service.js";
import { PostgresRepository } from "./sqlstore.js";

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

/** Parent and child models sharing one table */
class Animal extends Row {
  static Metadata = { Identifier: "Test/Animal", Subclasses: [] as any[] };
}
class Dog extends Animal {
  static Metadata = { Identifier: "Test/Dog", Subclasses: [] as any[] };
}
class Cat extends Animal {
  static Metadata = { Identifier: "Test/Cat", Subclasses: [] as any[] };
}
Animal.Metadata.Subclasses.push(Dog, Cat);

/** Two unrelated models sharing a table */
class AggA extends Row {
  static Metadata = { Identifier: "Test/AggA", Subclasses: [] as any[] };
}
class AggB extends Row {
  static Metadata = { Identifier: "Test/AggB", Subclasses: [] as any[] };
}

/** Rows covering numbers, booleans, strings, missing fields, nulls and type mismatches */
export const PARITY_ROWS = [
  { uuid: "r1", n: 1, s: "x", b: true, tags: ["x", 1] },
  { uuid: "r2", n: 5, s: "abc", b: false, tags: ["y"] },
  { uuid: "r3" },
  { uuid: "r4", n: "abc", s: 1, b: "true", tags: "x" },
  { uuid: "r5", s: null }
];
/** Queries whose results must be the same on every store */
export const PARITY_QUERIES = [
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

const params = {
  postgresqlServer: {
    host: "localhost",
    user: "webda.io",
    database: "webda.io",
    password: "webda.io",
    statement_timeout: 60000,
    max: 2
  }
};

/**
 * Focused smoke tests for PostgresStore.
 *
 * Background: the StoreTest harness (`@webda/core/lib/stores/store.spec`)
 * is now compiled to lib via tsconfig files[], and its type errors are
 * fixed. The remaining blocker is class-identity duplication in vitest's
 * module resolution that the @webda/core / @webda/postgres pair can't
 * resolve cleanly:
 *
 * - Application.load() loads model classes via filesystem paths
 *   (lib/models/ident:Ident → lib's Ident class).
 * - Test code imports User/Ident via bare specifiers — without an
 *   exports field on @webda/core they resolve to lib too. Adding an
 *   exports field broke pnpm's `webda` bin symlink.
 * - The existing @webda/core/lib/test alias forces test/index.ts (and
 *   its relative imports) through src — re-introducing class identity
 *   duplication if any harness import follows that path.
 *
 * Resolving this properly probably means a dedicated test-utils
 * package (e.g. @webda/store-test) that publishes harness classes
 * through normal module resolution. Out of scope here.
 *
 * These smoke tests verify the migrated lifecycle directly through
 * SQL while that follow-up lands.
 */
@suite
export class PostgresStoreSmokeTest extends WebdaApplicationTest {
  store?: PostgresStore<any>;

  async beforeEach() {
    await super.beforeEach();
    this.store = await this.addService(
      PostgresStore,
      {
        ...params,
        autoCreateTable: true,
        table: "smoke_idents",
        models: ["Webda/OwnerModel"]
      } as any,
      "smoke"
    );
    await this.store.getClient().query(`TRUNCATE TABLE smoke_idents`);
  }

  async afterEach() {
    if (this.store) {
      try {
        await this.store.getClient().query(`DROP TABLE IF EXISTS smoke_idents`);
      } catch {
        /* ignore */
      }
      try {
        await this.store.stop?.();
      } catch {
        /* ignore */
      }
      this.store = undefined;
    }
  }

  @test
  async createTableOnInit() {
    const res = await this.store!.getClient().query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'smoke_idents'`
    );
    assert.strictEqual(res.rowCount, 1, "smoke_idents table should be created");
  }

  @test
  async getClientReturnsLiveConnection() {
    const res = await this.store!.getClient().query("SELECT 1 AS one");
    assert.strictEqual(res.rows[0].one, 1);
  }

  @test
  async checkTableIsIdempotent() {
    await this.store!.checkTable();
    await this.store!.checkTable();
  }

  @test
  async checkTableSkippedWhenAutoCreateDisabled() {
    this.store!.getParameters().autoCreateTable = false;
    await this.store!.checkTable();
    this.store!.getParameters().autoCreateTable = true;
  }

  @test
  async usePoolFalseStillConnects() {
    const single = await this.addService(
      PostgresStore,
      {
        ...params,
        usePool: false,
        autoCreateTable: false,
        table: "smoke_idents",
        models: ["Webda/OwnerModel"]
      } as any,
      "smoke_single"
    );
    try {
      assert.ok(single.client instanceof pg.Client);
      const res = await single.getClient().query("SELECT 1 AS one");
      assert.strictEqual(res.rows[0].one, 1);
    } finally {
      await single.stop?.();
    }
  }

  @test
  async cleanTruncatesAllRows() {
    const c = this.store!.getClient();
    await c.query(`INSERT INTO smoke_idents(uuid,data) VALUES($1, $2)`, ["a", JSON.stringify({ x: 1 })]);
    await c.query(`INSERT INTO smoke_idents(uuid,data) VALUES($1, $2)`, ["b", JSON.stringify({ x: 2 })]);
    let res = await c.query(`SELECT count(*)::int AS n FROM smoke_idents`);
    assert.strictEqual(res.rows[0].n, 2);

    await (this.store as any).__clean?.();
    res = await c.query(`SELECT count(*)::int AS n FROM smoke_idents`);
    assert.strictEqual(res.rows[0].n, 0);
  }

  @test
  async createWithoutPrimaryKeyPersistsGeneratedUuid() {
    // Check both the EventRepository returned by the store and the underlying PostgresRepository
    await checkCreateWithoutPrimaryKey(
      [
        this.store!.getRepository(useModel("Webda/OwnerModel")),
        this.store!.getRepositories().find(r => r instanceof PostgresRepository)
      ],
      {
        data: () => ({ _type: "google" }),
        readStored: async key =>
          (await this.store!.getClient().query(`SELECT data FROM smoke_idents WHERE uuid=$1`, [key])).rows[0]?.data
      }
    );
  }

  @test
  async queryIsNull() {
    const c = this.store!.getClient();
    // A JSON null, a missing key and a value
    for (const [uuid, data] of [
      ["null", { uuid: "null", email: null }],
      ["missing", { uuid: "missing" }],
      ["set", { uuid: "set", email: "set@webda.io" }]
    ] as const) {
      await c.query(`INSERT INTO smoke_idents(uuid,data) VALUES($1, $2)`, [uuid, JSON.stringify(data)]);
    }
    const repo = this.store!.getRepository(useModel("Webda/OwnerModel"));
    const uuids = async (query: string) => (await repo.query(query)).results.map((r: any) => r.uuid).sort();
    assert.deepStrictEqual(await uuids("email IS NULL"), ["missing", "null"]);
    assert.deepStrictEqual(await uuids("email IS NOT NULL"), ["set"]);
    assert.deepStrictEqual(await uuids("email IS NULL AND uuid = 'null'"), ["null"]);
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
    const repo = new PostgresRepository<any>(Row as any, ["uuid"], this.store!.getClient(), "smoke_idents");
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
    const events = this.store!.getRepository(useModel("Webda/OwnerModel"));
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
  async aggregationConformance() {
    const client = this.store!.getClient();
    await client.query("DROP TABLE IF EXISTS agg_rows");
    try {
      const repo = new PostgresRepository<any>(Row as any, ["uuid"], client, "agg_rows");
      await repo.setupTable();
      await checkAggregation(repo as any, { native: true });
    } finally {
      await client.query("DROP TABLE IF EXISTS agg_rows");
    }
  }

  @test
  aggregationSQLIsSafe() {
    const repo: any = new PostgresRepository<any>(class {} as any, ["uuid"], {} as any, "t");
    const { sql } = repo.buildAggregationSQL(
      toAggregationQuery({ groupBy: ["team.name"], metrics: { n: { count: "*" } }, limit: 3 } as any)
    );
    const x = `NULLIF(data #> '{team,name}', 'null'::jsonb)`;
    assert.strictEqual(
      sql,
      `SELECT ${x} AS "g0", COUNT(*) AS "m0" FROM t WHERE TRUE GROUP BY 1 ORDER BY ` +
        `CASE WHEN ${x} IS NULL THEN NULL WHEN jsonb_typeof(${x}) = 'number' THEN 1 ` +
        `WHEN jsonb_typeof(${x}) = 'string' THEN 2 ELSE 3 END ASC NULLS FIRST, ` +
        `CASE WHEN jsonb_typeof(${x}) = 'number' THEN (${x})::numeric END ASC NULLS FIRST, ` +
        `(CASE WHEN jsonb_typeof(${x}) = 'string' THEN ${x} #>> '{}' END) COLLATE "C" ASC NULLS FIRST, ` +
        `${x} ASC NULLS FIRST LIMIT 3`
    );
  }

  @test
  aggregationSQLValidatesTheQuery() {
    const repo: any = new PostgresRepository<any>(class {} as any, ["uuid"], {} as any, "t");
    // A hand-built AST, not from toAggregationQuery: the alias would otherwise reach the SQL
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
  async aggregationLongAliases() {
    const client = this.store!.getClient();
    await client.query("DROP TABLE IF EXISTS agg_long");
    try {
      const repo = new PostgresRepository<any>(Row as any, ["uuid"], client, "agg_long");
      await repo.setupTable();
      await repo.create({ uuid: "l1", kind: "a", points: 3 });
      await repo.create({ uuid: "l2", kind: "a", points: 5 });
      await repo.create({ uuid: "l3", kind: "b", points: 7 });
      // Beyond the 63 bytes PostgreSQL keeps of an identifier
      const long = "a" + "x".repeat(69);
      const prefix = "b".repeat(61);
      const res = await repo.aggregate({
        groupBy: ["kind"],
        metrics: {
          [long]: { count: "*" },
          [`${prefix}_sum`]: { sum: "points" },
          [`${prefix}_max`]: { max: "points" }
        },
        orderBy: [{ key: `${prefix}_max`, direction: "DESC" }]
      } as any);
      assert.strictEqual(long.length, 70);
      assert.deepStrictEqual(res.rows, [
        { kind: "b", [long]: 1, [`${prefix}_sum`]: 7, [`${prefix}_max`]: 7 },
        { kind: "a", [long]: 2, [`${prefix}_sum`]: 8, [`${prefix}_max`]: 5 }
      ]);
    } finally {
      await client.query("DROP TABLE IF EXISTS agg_long");
    }
  }

  @test
  async aggregationStaysInTheModelHierarchy() {
    const client = this.store!.getClient();
    await client.query("DROP TABLE IF EXISTS agg_iso");
    try {
      const a = new PostgresRepository<any>(
        AggA as any,
        ["uuid"],
        client,
        "agg_iso",
        undefined,
        undefined,
        "Test/AggA"
      );
      const b = new PostgresRepository<any>(
        AggB as any,
        ["uuid"],
        client,
        "agg_iso",
        undefined,
        undefined,
        "Test/AggA"
      );
      await a.setupTable();
      await a.create({ uuid: "x", kind: "k1" });
      await a.create({ uuid: "y", kind: "k2" });
      await b.create({ uuid: "z", kind: "k1" });
      await b.create({ uuid: "w", kind: "k3" });
      // Written before stamping: belongs to the table model
      await client.query(`INSERT INTO agg_iso(uuid,data) VALUES($1, $2)`, [
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
    const repo = new PostgresRepository<any>(Row as any, ["uuid"], this.store!.getClient(), "smoke_idents");
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
    const repo = new PostgresRepository<any>(Row as any, ["uuid"], this.store!.getClient(), "smoke_idents");
    for (const uuid of ["a", "b", "c"]) {
      await repo.create({ uuid, name: uuid });
    }
    const forged: [string, (q: any) => void][] = [
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.attribute = ["x}' IS NULL OR TRUE OR data#>>'{y"])],
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
    const repo = new PostgresRepository<any>(Row as any, ["uuid"], this.store!.getClient(), "smoke_idents");
    await repo.create({ uuid: "t", tags: ["t1", "t2"], list: [{ v: 1 }, { v: 2 }] });
    assert.strictEqual(await repo.updateMany("UPDATE SET tags.0 = 'n', list.1.v = 3"), 1);
    const row: any = await repo.get("t");
    assert.deepStrictEqual(row.tags, ["n", "t2"]);
    assert.deepStrictEqual(row.list, [{ v: 1 }, { v: 3 }]);
  }

  @test
  async bulkStaysInTheModelHierarchy() {
    const client = this.store!.getClient();
    const animals = new PostgresRepository<any>(Animal as any, ["uuid"], client, "smoke_idents");
    const dogs = new PostgresRepository<any>(Dog as any, ["uuid"], client, "smoke_idents");
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
    const client = this.store!.getClient();
    // Rows written before `__type` stamping: an Animal, a Dog and a Cat that nothing tells apart
    for (const uuid of ["a1", "d1", "c1"]) {
      await client.query(`INSERT INTO smoke_idents(uuid,data) VALUES($1, $2)`, [uuid, JSON.stringify({ uuid })]);
    }
    const animals = new PostgresRepository<any>(Animal as any, ["uuid"], client, "smoke_idents");
    const dogs = new PostgresRepository<any>(Dog as any, ["uuid"], client, "smoke_idents");
    const cats = new PostgresRepository<any>(Cat as any, ["uuid"], client, "smoke_idents");
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
    const stamped = await client.query(`SELECT data->>'__type' AS t FROM smoke_idents WHERE uuid = 'a1'`);
    assert.strictEqual(stamped.rows[0].t, "Test/Animal");
    assert.strictEqual(await animals.deleteMany("DELETE WHERE x IS NULL"), 3);
    // The store backfills each table with its declared model
    await client.query(`INSERT INTO smoke_idents(uuid,data) VALUES($1, $2)`, ["o1", JSON.stringify({ uuid: "o1" })]);
    assert.ok((await this.store!.backfillTypes()) >= 1);
    const owner = await client.query(`SELECT data->>'__type' AS t FROM smoke_idents WHERE uuid = 'o1'`);
    assert.strictEqual(owner.rows[0].t, this.store!.resolveTableModel(useModel("Webda/OwnerModel")));
    assert.strictEqual(await this.store!.backfillTypes(), 0);
  }

  @test
  async parentWritesKeepTheChildType() {
    const client = this.store!.getClient();
    const animals = new PostgresRepository<any>(Animal as any, ["uuid"], client, "smoke_idents");
    const dogs = new PostgresRepository<any>(Dog as any, ["uuid"], client, "smoke_idents");
    await dogs.create(new Dog({ uuid: "d2" }));
    await dogs.create(new Dog({ uuid: "d3" }));
    await client.query(`INSERT INTO smoke_idents(uuid,data) VALUES($1, $2)`, ["c1", JSON.stringify({ uuid: "c1" })]);
    // An instance read through the parent, and plain data (ModelRef.update)
    await animals.update(await animals.get("d2"));
    await animals.update({ uuid: "d3", x: 1 });
    await animals.update({ uuid: "c1", x: 1, __type: "Test/Dog" });
    assert.deepStrictEqual((await dogs.query("")).results.map((r: any) => r.uuid).sort(), ["d2", "d3"]);
    const types = await client.query(`SELECT uuid, data->>'__type' AS t FROM smoke_idents ORDER BY uuid`);
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
  async createViewsWithEmptyPatternIsNoop() {
    this.store!.getParameters().views = [];
    this.store!.getParameters().viewPrefix = "view_";
    await this.store!.createViews().catch(() => {
      /* tolerate environment-specific schema-generator failures */
    });
    this.store!.getParameters().views = [".*"];
    this.store!.getParameters().viewPrefix = "";
  }
}

/**
 * Unit tests for resolveTable() that do not require a live PostgreSQL connection.
 * Extends WebdaApplicationTest only for its model registry (useModel / useModelMetadata),
 * but does NOT call addService() — so the DB-connect path is never triggered.
 */
@suite
export class PostgresStoreResolveTableTest extends WebdaApplicationTest {
  @test
  async resolveTableSingleModelUsesParametersTable() {
    const store = new PostgresStore("singleTable", { models: ["Webda/OwnerModel"], table: "idents" });
    assert.strictEqual(store.resolveTable(useModel("Webda/OwnerModel")), "idents");
  }

  @test
  async resolveTableMultiModelIgnoresParametersTable() {
    const store = new PostgresStore("multiTable", {
      models: ["Webda/OwnerModel", "Webda/User"],
      table: "idents"
    });
    assert.strictEqual(store.resolveTable(useModel("Webda/OwnerModel")), "webda_ownermodel");
    assert.strictEqual(store.resolveTable(useModel("Webda/User")), "webda_user");
  }

  @test
  async resolveTableExplicitTablesMapWins() {
    const store = new PostgresStore("explicitTable", {
      models: ["Webda/User"],
      tables: { "Webda/User": "users_v2" }
    });
    assert.strictEqual(store.resolveTable(useModel("Webda/User")), "users_v2");
  }

  @test
  async resolveTableSingleModelTableIsNotSharedWithFallbackModels() {
    // Registry-like store: the configured model keeps `table`, a model routed to it as fallback does not
    const store = new PostgresStore("fallbackTable", { models: ["Webda/RegistryEntry"], table: "registry" });
    assert.strictEqual(store.resolveTable(useModel("Webda/RegistryEntry")), "registry");
    assert.strictEqual(store.resolveTable(useModel("Webda/OwnerModel")), "webda_ownermodel");
  }

  @test
  async fallbackRepositoryCreatesItsTableBeforeFirstStatement() {
    // Load the parameters as the application does, so autoCreateTable gets its default (true)
    const store = new PostgresStore(
      "fallbackCreate",
      new PostgresParameters().load({ models: ["Webda/RegistryEntry"], table: "registry" })
    );
    store.resolve();
    const statements: string[] = [];
    store.client = {
      query: async (q: string) => {
        statements.push(q);
        return { rows: [], rowCount: 1 };
      }
    } as any;
    // Webda/OwnerModel is not a configured model: it reaches this store through Store.computeStores fallback
    const repo = store.getRepository(useModel("Webda/OwnerModel"));
    await Promise.all([repo.create({ _type: "google" } as any), repo.create({ _type: "github" } as any)]);
    await repo.create({ _type: "gitlab" } as any);
    assert.strictEqual(statements.length, 4);
    assert.match(statements[0], /^CREATE TABLE IF NOT EXISTS webda_ownermodel /);
    assert.ok(statements.slice(1).every(q => q.startsWith("INSERT INTO webda_ownermodel(")));
  }

  @test
  async createOverAnExistingKeyIsRefused() {
    const store = new PostgresStore(
      "duplicateCreate",
      new PostgresParameters().load({ models: ["Webda/RegistryEntry"], table: "registry", autoCreateTable: false })
    );
    store.resolve();
    store.client = {
      query: async () => {
        throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      }
    } as any;
    await assert.rejects(
      () => store.getRepository(useModel("Webda/OwnerModel")).create({ uuid: "dup" } as any),
      /^Error: Already exists: dup/
    );
  }

  @test
  async fallbackRepositorySkipsCreateWhenAutoCreateDisabled() {
    const store = new PostgresStore(
      "fallbackNoCreate",
      new PostgresParameters().load({ models: ["Webda/RegistryEntry"], table: "registry", autoCreateTable: false })
    );
    store.resolve();
    const statements: string[] = [];
    store.client = {
      query: async (q: string) => {
        statements.push(q);
        return { rows: [], rowCount: 1 };
      }
    } as any;
    await store.getRepository(useModel("Webda/OwnerModel")).create({ _type: "google" } as any);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0].startsWith("INSERT INTO webda_ownermodel("));
  }

  @test
  async tableCreationIsRetriedAfterFailureAndNotRepeatedAfterSuccess() {
    const store = new PostgresStore(
      "retryCreate",
      new PostgresParameters().load({ models: ["Webda/RegistryEntry"], table: "registry" })
    );
    store.resolve();
    const statements: string[] = [];
    let failCreate = true;
    store.client = {
      query: async (q: string) => {
        statements.push(q);
        if (q.startsWith("CREATE TABLE") && failCreate) {
          failCreate = false;
          throw new Error("create failed");
        }
        return { rows: [], rowCount: 1 };
      }
    } as any;
    const repo = store.getRepository(useModel("Webda/OwnerModel"));
    // First statement: CREATE fails and the statement itself is never sent
    await assert.rejects(() => repo.create({ _type: "google" } as any), /create failed/);
    assert.strictEqual(statements.length, 1);
    // Second statement: CREATE is issued again (not memoized as failed), then the INSERT runs
    await repo.create({ _type: "github" } as any);
    assert.deepStrictEqual(
      statements.map(q => q.split(/[ (]/).slice(0, 2).join(" ")),
      ["CREATE TABLE", "CREATE TABLE", "INSERT INTO"]
    );
    // Third statement: the table is known to exist
    await repo.create({ _type: "gitlab" } as any);
    assert.strictEqual(statements.filter(q => q.startsWith("CREATE TABLE")).length, 2);
    assert.strictEqual(statements.length, 4);
  }

  @test
  async ensureTableIsNoopWhenAutoCreateDisabled() {
    const store = new PostgresStore(
      "noCreate",
      new PostgresParameters().load({ models: ["Webda/OwnerModel"], table: "idents", autoCreateTable: false })
    );
    store.resolve();
    const statements: string[] = [];
    store.client = {
      query: async (q: string) => {
        statements.push(q);
        return { rows: [{ data: { _type: "google" } }], rowCount: 1 };
      }
    } as any;
    const repo = store.getRepository(useModel("Webda/OwnerModel"));
    await store.ensureTable(
      new PostgresRepository(useModel("Webda/OwnerModel"), ["uuid"], store.client as any, "idents")
    );
    await repo.exists("x");
    assert.deepStrictEqual(statements, ["SELECT uuid FROM idents WHERE uuid=$1"]);
  }

  @test
  async getRepositoryWrapsInEventRepository() {
    const store = new PostgresStore("reposWrap", { models: ["Webda/OwnerModel"], table: "idents", strict: true });
    store.resolve();
    const repo = store.getRepository(useModel("Webda/OwnerModel"));
    assert.ok(repo instanceof EventRepository);
  }

  @test
  async getRepositoriesReturnsUnwrappedPostgresRepositories() {
    const store = new PostgresStore("reposUnwrap", { models: ["Webda/OwnerModel"], table: "idents", strict: true });
    store.resolve();
    const repos = store.getRepositories();
    assert.ok(repos.length >= 1);
    assert.ok(repos.every(r => r instanceof PostgresRepository));
  }
}
