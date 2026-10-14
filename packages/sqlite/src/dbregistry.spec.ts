import { WebdaError } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __setSQLiteLoader, bindable, SQLiteClient } from "./connection.js";
import { __resetDatabases, acquireDatabase, databaseKey, releaseDatabase } from "./dbregistry.js";

@suite
class DbRegistryTest {
  dir = mkdtempSync(join(tmpdir(), "webda-sqlite-"));

  afterEach() {
    __resetDatabases();
    __setSQLiteLoader();
  }

  afterAll() {
    rmSync(this.dir, { recursive: true, force: true });
  }

  @test
  keys() {
    assert.strictEqual(databaseKey({}, "store"), "memory:store");
    assert.strictEqual(databaseKey({ database: { name: "shared" } }, "store"), "name:shared");
    assert.ok(databaseKey({ persistence: { path: "./x.sqlite" } }, "store").startsWith("file:/"));
  }

  @test
  async sameKeySharesTheHandleAndRefCounts() {
    const a = await acquireDatabase({ database: { name: "t" } }, "a");
    const b = await acquireDatabase({ database: { name: "t" } }, "b");
    assert.strictEqual(a, b);
    assert.strictEqual(a.refCount, 2);
    a.db.exec("CREATE TABLE x (v)");
    releaseDatabase(a);
    const tables = await b.client.query("SELECT name FROM sqlite_master WHERE type='table'");
    assert.deepStrictEqual(
      tables.rows.map(r => r.name),
      ["x"]
    );
    releaseDatabase(b);
    const c = await acquireDatabase({ database: { name: "t" } }, "c");
    assert.notStrictEqual(c, a, "closed at the last release: a new database");
    assert.strictEqual((await c.client.query("SELECT name FROM sqlite_master WHERE type='table'")).rowCount, 0);
  }

  @test
  async inMemoryDatabasesAreIsolatedByName() {
    const a = await acquireDatabase({}, "a");
    const b = await acquireDatabase({}, "b");
    assert.notStrictEqual(a, b);
    a.db.exec("CREATE TABLE only_a (v)");
    assert.strictEqual((await b.client.query("SELECT name FROM sqlite_master WHERE name='only_a'")).rowCount, 0);
  }

  @test
  async createsMissingParentDirectory() {
    const path = join(this.dir, "deep", "er", "app.sqlite");
    const handle = await acquireDatabase({ persistence: { path } }, "s");
    assert.ok(existsSync(path));
    assert.strictEqual((await handle.client.query("PRAGMA journal_mode")).rows[0].journal_mode, "wal");
    releaseDatabase(handle);
  }

  @test
  async unsupportedPersistenceOptionsFailLoudly() {
    for (const extra of [{ key: "k" }, { cipher: "aes-256-ctr" }, { compressionLevel: 9 }]) {
      await assert.rejects(
        () => acquireDatabase({ persistence: { path: join(this.dir, "x.sqlite"), ...extra } as any }, "s"),
        (err: any) => err instanceof WebdaError.CodeError && err.getCode() === "SQLITE_UNSUPPORTED_PERSISTENCE"
      );
    }
  }

  @test
  async readOnlyRejectsWrites() {
    const path = join(this.dir, "ro.sqlite");
    const rw = await acquireDatabase({ persistence: { path } }, "rw");
    rw.db.exec("CREATE TABLE t (v)");
    releaseDatabase(rw);
    const ro = await acquireDatabase({ persistence: { path, readOnly: true }, database: { name: "ro" } }, "ro");
    await assert.rejects(
      () => ro.client.query("INSERT INTO t VALUES (1)"),
      (err: any) => err instanceof WebdaError.CodeError && err.getCode() === "SQLITE_READONLY"
    );
    releaseDatabase(ro);
  }

  @test
  async missingNodeSqliteIsAClearError() {
    __setSQLiteLoader(async () => {
      throw new Error("No such built-in module: node:sqlite");
    });
    await assert.rejects(
      () => acquireDatabase({}, "s"),
      (err: any) =>
        err instanceof WebdaError.CodeError &&
        err.getCode() === "SQLITE_UNAVAILABLE" &&
        /Node >= 22.13/.test(err.message)
    );
  }

  @test
  async concurrentAcquiresShareOneDatabase() {
    const [a, b] = await Promise.all([
      acquireDatabase({ database: { name: "race" } }, "a"),
      acquireDatabase({ database: { name: "race" } }, "b")
    ]);
    assert.strictEqual(a, b);
    assert.strictEqual(a.refCount, 2);
  }

  @test
  async conflictingParametersOnASharedNameAreRefused() {
    const memory = await acquireDatabase({ database: { name: "conflict" } }, "a");
    await assert.rejects(
      () => acquireDatabase({ database: { name: "conflict" }, persistence: { path: join(this.dir, "c.sqlite") } }, "b"),
      (err: any) => err instanceof WebdaError.CodeError && err.getCode() === "SQLITE_CONFLICTING_DATABASE"
    );
    releaseDatabase(memory);
    const path = join(this.dir, "rw.sqlite");
    const rw = await acquireDatabase({ persistence: { path } }, "rw");
    await assert.rejects(
      () => acquireDatabase({ persistence: { path, readOnly: true } }, "ro"),
      (err: any) => err instanceof WebdaError.CodeError && err.getCode() === "SQLITE_CONFLICTING_DATABASE"
    );
    assert.strictEqual(await acquireDatabase({ persistence: { path } }, "rw2"), rw);
  }

  @test
  async customPragmasAreValidated() {
    const handle = await acquireDatabase({ pragmas: { cache_size: -2000 } }, "s");
    assert.strictEqual((await handle.client.query("PRAGMA cache_size")).rows[0].cache_size, -2000);
    releaseDatabase(handle);
    await assert.rejects(() => acquireDatabase({ pragmas: { "x; DROP": 1 } }, "bad"), /Invalid pragma/);
    await assert.rejects(
      () => acquireDatabase({ persistence: { path: join(this.dir, "sync.sqlite"), synchronous: "NO" as any } }, "bad2"),
      /Invalid synchronous mode/
    );
  }

  @test
  async bindsBooleansDatesAndObjects() {
    assert.strictEqual(bindable(true), 1);
    assert.strictEqual(bindable(false), 0);
    assert.strictEqual(bindable(undefined), null);
    assert.strictEqual(bindable(new Date("2026-01-01T00:00:00.000Z")), "2026-01-01T00:00:00.000Z");
    assert.strictEqual(bindable({ a: 1 }), '{"a":1}');
    assert.strictEqual(bindable("s"), "s");
    const handle = await acquireDatabase({}, "s");
    const res = await handle.client.query("SELECT ?1 AS b, ?2 AS d", [true, new Date(0)]);
    assert.deepStrictEqual({ ...res.rows[0] }, { b: 1, d: "1970-01-01T00:00:00.000Z" });
  }

  @test
  async clientClassifiesStatements() {
    const handle = await acquireDatabase({}, "s");
    const client = new SQLiteClient(handle.db, 2);
    await client.query("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    assert.deepStrictEqual(await client.query("INSERT INTO t(v) VALUES (?1)", ["a"]), { rows: [], rowCount: 1 });
    assert.strictEqual((await client.rows("insert into t(v) values (?1) returning id", ["b"]))[0].id, 2);
    assert.strictEqual((await client.query("UPDATE t SET v = 'c'")).rowCount, 2);
    assert.strictEqual((await client.query("  SELECT v FROM t")).rowCount, 2);
    assert.strictEqual((await client.query("WITH x AS (SELECT 1 AS one) SELECT one FROM x")).rows[0].one, 1);
    assert.strictEqual((await client.query("  SELECT v FROM t")).rowCount, 2, "statement evicted and re-prepared");
    // The statement kind comes from its first keyword, never from a value
    assert.strictEqual((await client.query("UPDATE t SET v = 'returning' WHERE v = 'c'")).rowCount, 2);
    assert.strictEqual((await client.query("DELETE FROM t WHERE v = 'RETURNING' OR v = 'returning'")).rowCount, 2);
  }
}
