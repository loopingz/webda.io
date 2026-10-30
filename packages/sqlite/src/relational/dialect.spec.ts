import type { ColumnPlan, TablePlan } from "@webda/sql-schema";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { SQLiteRelationalDialect } from "./dialect.js";

const column = (name: string, type: ColumnPlan["type"], extra: Partial<ColumnPlan> = {}): ColumnPlan => ({
  name,
  field: name,
  role: "field",
  type,
  nullable: true,
  ...extra
});

const table: TablePlan = {
  name: "rel_post",
  root: "Rel/Post",
  models: ["Rel/Post"],
  primaryKey: ["uuid"],
  columns: [
    column("uuid", { kind: "uuid" }),
    column("title", { kind: "varchar", length: 200 }),
    column("views", { kind: "bigint" }),
    column("score", { kind: "double" }),
    column("price", { kind: "decimal" }),
    column("published", { kind: "boolean" }),
    column("day", { kind: "date" }),
    column("_creationDate", { kind: "timestamptz" }),
    column("meta", { kind: "json" }),
    column("status", { kind: "text" }, { enum: ["draft", "it's"] }),
    column("author", { kind: "uuid" }, { role: "reference" })
  ]
};

/**
 * Rendering tests: no database needed
 */
@suite
export class SQLiteRelationalDialectTest {
  dialect = new SQLiteRelationalDialect();

  @test
  quotesIdentifiersAndDeclaresInlineForeignKeys() {
    assert.strictEqual(this.dialect.quote("order"), '"order"');
    assert.strictEqual(this.dialect.quote('a"b'), '"a""b"');
    assert.strictEqual(this.dialect.inlineForeignKeys, true);
    assert.strictEqual(this.dialect.schemaLock("x"), undefined);
  }

  @test
  mapsColumnTypesBothWays() {
    const types: [ColumnPlan["type"], string][] = [
      [{ kind: "text" }, "TEXT"],
      [{ kind: "varchar", length: 50 }, "VARCHAR(50)"],
      [{ kind: "timestamptz" }, "TIMESTAMPTZ"],
      [{ kind: "date" }, "DATE"],
      [{ kind: "uuid" }, "TEXT"],
      [{ kind: "bigint" }, "BIGINT"],
      [{ kind: "double" }, "REAL"],
      [{ kind: "decimal" }, "DECIMAL"],
      [{ kind: "boolean" }, "BOOLEAN"],
      [{ kind: "json" }, "JSON"]
    ];
    for (const [type, ddl] of types) {
      assert.strictEqual(this.dialect.columnType(type), ddl);
      // The declared name round-trips through PRAGMA table_info (uuid is TEXT: compatible by the planner)
      assert.deepStrictEqual(this.dialect.liveType(ddl), type.kind === "uuid" ? { kind: "text" } : type);
    }
    assert.deepStrictEqual(this.dialect.liveType("INTEGER"), { kind: "bigint" });
    assert.deepStrictEqual(this.dialect.liveType("int"), { kind: "bigint" });
    assert.deepStrictEqual(this.dialect.liveType("DOUBLE PRECISION"), { kind: "double" });
    assert.deepStrictEqual(this.dialect.liveType("FLOAT"), { kind: "double" });
    assert.deepStrictEqual(this.dialect.liveType("NUMERIC"), { kind: "decimal" });
    assert.deepStrictEqual(this.dialect.liveType("varchar(10)"), { kind: "varchar", length: 10 });
    assert.deepStrictEqual(this.dialect.liveType("CHARACTER(3)"), { kind: "text" });
    assert.strictEqual(this.dialect.liveType("BLOB"), undefined);
    assert.strictEqual(this.dialect.liveType(""), undefined);
    assert.strictEqual(this.dialect.liveType(undefined as any), undefined);
    assert.deepStrictEqual(this.dialect.liveType("CHARACTER VARYING(5)"), { kind: "varchar", length: 5 });
    assert.deepStrictEqual(this.dialect.liveType("character varying"), { kind: "text" });
  }

  @test
  createTableRendersColumnsKeysChecksAndInlineForeignKeys() {
    const [sql] = this.dialect.renderStep({
      kind: "createTable",
      table,
      foreignKeys: [
        {
          name: "fk_rel_post_author",
          table: "rel_post",
          columns: ["author"],
          references: { table: "rel_user", columns: ["uuid"] },
          onDelete: "NO ACTION"
        }
      ]
    });
    assert.strictEqual(
      sql,
      'CREATE TABLE IF NOT EXISTS "rel_post" ("uuid" TEXT, "title" VARCHAR(200), "views" BIGINT, "score" REAL, ' +
        '"price" DECIMAL, "published" BOOLEAN, "day" DATE, "_creationDate" TIMESTAMPTZ, "meta" JSON, "status" TEXT, "author" TEXT, ' +
        'CONSTRAINT "rel_post_pkey" PRIMARY KEY ("uuid"), CONSTRAINT "ck_rel_post_status" CHECK ("status" IN (\'draft\', \'it\'\'s\')), ' +
        'CONSTRAINT "fk_rel_post_author" FOREIGN KEY ("author") REFERENCES "rel_user" ("uuid") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED)'
    );
    assert.ok(!sql.includes("NOT NULL"));
  }

  @test
  rendersAdditiveStepsAndNoLateForeignKey() {
    assert.deepStrictEqual(
      this.dialect.renderStep({ kind: "addColumn", table: "rel_post", column: column("summary", { kind: "text" }) }),
      ['ALTER TABLE "rel_post" ADD COLUMN "summary" TEXT']
    );
    assert.deepStrictEqual(
      this.dialect.renderStep({
        kind: "createIndex",
        index: { name: "uq_rel_post_slug", table: "rel_post", columns: ["slug", "lang"], unique: true }
      }),
      ['CREATE UNIQUE INDEX IF NOT EXISTS "uq_rel_post_slug" ON "rel_post" ("slug", "lang")']
    );
    assert.deepStrictEqual(
      this.dialect.renderStep({
        kind: "createIndex",
        index: { name: "idx_rel_post_author", table: "rel_post", columns: ["author"], unique: false }
      }),
      ['CREATE INDEX IF NOT EXISTS "idx_rel_post_author" ON "rel_post" ("author")']
    );
    assert.deepStrictEqual(
      this.dialect.renderStep({
        kind: "addForeignKey",
        foreignKey: {
          name: "fk",
          table: "t",
          columns: ["c"],
          references: { table: "r", columns: ["rc"] },
          onDelete: "CASCADE"
        }
      }),
      []
    );
  }

  @test
  jsonColumnOperations() {
    const d = this.dialect;
    assert.strictEqual(d.castText('"n"'), 'CAST("n" AS TEXT)');
    assert.strictEqual(d.toJson('"n"', { kind: "bigint" }), 'CASE WHEN "n" IS NULL THEN NULL ELSE json_quote("n") END');
    assert.strictEqual(
      d.toJson('"b"', { kind: "boolean" }),
      `CASE WHEN "b" IS NULL THEN NULL WHEN "b" THEN json('true') ELSE json('false') END`
    );
    assert.strictEqual(
      d.columnJsonText("m", ["a", "b"]),
      `(CASE json_type("m", '$.a.b') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE CAST("m" ->> '$.a.b' AS TEXT) END)`
    );
    assert.strictEqual(
      d.columnJsonText("m", []),
      `(CASE json_type("m", '$') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE CAST("m" ->> '$' AS TEXT) END)`
    );
    assert.strictEqual(d.columnJsonValue("m", ["a"]), `"m" -> '$.a'`);
    assert.strictEqual(d.columnJsonValueOrNull("m", ["a"]), `NULLIF("m" -> '$.a', 'null')`);
    const args: unknown[] = ["x"];
    assert.strictEqual(
      d.columnJsonMerge("e", { k: 1, s: "v" }, args),
      `json_set(COALESCE("e", '{}'), '$.k', json(?2), '$.s', json(?3))`
    );
    assert.deepStrictEqual(args, ["x", "1", '"v"']);
    assert.strictEqual(d.columnJsonMerge("e", {}, []), `COALESCE("e", '{}')`);
    assert.strictEqual(d.columnJsonMerge("e", { skipped: undefined }, []), `COALESCE("e", '{}')`);
    assert.strictEqual(d.columnJsonRemoveKey("e", 3), `json_remove("e", '$.' || ?3)`);
    assert.strictEqual(d.columnJsonSetPath("m", ["a"], 3), `json_set(COALESCE("m", '{}'), '$.a', json(?3))`);
    assert.strictEqual(
      d.columnJsonSetPath("m", ["a", "b"], 3),
      `json_set(COALESCE("m", '{}'), '$.a', json(COALESCE(CASE WHEN json_type(COALESCE("m", '{}'), '$.a') IN ('object', 'array') THEN COALESCE("m", '{}') -> '$.a' END, '{}')), '$.a.b', json(?3))`
    );
    assert.strictEqual(
      d.columnJsonSetItem("files", 2, undefined),
      `json_insert(COALESCE("files", '[]'), '$[#]', json(?2))`
    );
    assert.strictEqual(
      d.columnJsonSetItem("files", 2, 1),
      `CASE WHEN json_array_length(COALESCE("files", '[]')) > 1 THEN json_set(COALESCE("files", '[]'), '$[1]', json(?2)) ELSE json_insert(COALESCE("files", '[]'), '$[#]', json(?2)) END`
    );
    assert.strictEqual(d.columnJsonRemoveItem("files", 1), `json_remove(COALESCE("files", '[]'), '$[1]')`);
    assert.strictEqual(d.columnJsonItemCondition("files", 1, "hash", 3), `"files" ->> '$[1].hash' = ?3`);
    assert.strictEqual(d.columnJsonItemCondition("files", undefined, "hash", 3), `0 = ?3`);
    assert.throws(() => d.columnJsonText("m", ["a'b"]), /Invalid attribute/);
    assert.throws(() => d.columnJsonRemoveItem("files", -1), /Invalid index/);
  }

  @test
  classifiesForeignKeyErrors() {
    assert.deepStrictEqual(this.dialect.isForeignKeyViolation({ code: "ERR_SQLITE_ERROR", errcode: 787 }), {});
    assert.strictEqual(this.dialect.isForeignKeyViolation({ code: "ERR_SQLITE_ERROR", errcode: 1555 }), undefined);
    assert.strictEqual(this.dialect.isForeignKeyViolation(new Error("x")), undefined);
    assert.strictEqual(this.dialect.isForeignKeyViolation(undefined), undefined);
    assert.strictEqual(this.dialect.isForeignKeyViolation(null), undefined);
    assert.strictEqual(this.dialect.isForeignKeyViolation({ code: "OTHER", errcode: 787 }), undefined);
  }

  @test
  async describeSchemaWithoutTablesNeverQueries() {
    const client = {
      query: async () => {
        throw new Error("no query expected");
      }
    };
    assert.deepStrictEqual(await this.dialect.describeSchema(client, []), { tables: {} });
  }
}
