import { suite, test } from "@webda/test";
import type { ColumnPlan, TablePlan } from "@webda/sql-schema";
import * as assert from "node:assert";
import { PostgresRelationalDialect } from "./dialect.js";

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
    column("status", { kind: "text" }, { enum: ["draft", "it's"] })
  ]
};

/**
 * Rendering tests: no database needed
 */
@suite
export class PostgresRelationalDialectTest {
  dialect = new PostgresRelationalDialect();

  @test
  quotesIdentifiers() {
    assert.strictEqual(this.dialect.quote("order"), '"order"');
    assert.strictEqual(this.dialect.quote('a"b'), '"a""b"');
  }

  @test
  mapsColumnTypes() {
    const types: [ColumnPlan["type"], string][] = [
      [{ kind: "text" }, "TEXT"],
      [{ kind: "varchar", length: 50 }, "VARCHAR(50)"],
      [{ kind: "timestamptz" }, "TIMESTAMPTZ"],
      [{ kind: "date" }, "DATE"],
      [{ kind: "uuid" }, "TEXT"],
      [{ kind: "bigint" }, "BIGINT"],
      [{ kind: "double" }, "DOUBLE PRECISION"],
      [{ kind: "decimal" }, "NUMERIC"],
      [{ kind: "boolean" }, "BOOLEAN"],
      [{ kind: "json" }, "JSONB"]
    ];
    for (const [type, ddl] of types) {
      assert.strictEqual(this.dialect.columnType(type), ddl);
    }
  }

  @test
  createTableRendersColumnsKeyAndChecks() {
    const [sql] = this.dialect.renderStep({ kind: "createTable", table, foreignKeys: [] });
    assert.strictEqual(this.dialect.inlineForeignKeys, false);
    assert.strictEqual(
      sql,
      'CREATE TABLE IF NOT EXISTS "rel_post" ("uuid" TEXT, "title" VARCHAR(200), "views" BIGINT, "score" DOUBLE PRECISION, ' +
        '"price" NUMERIC, "published" BOOLEAN, "day" DATE, "_creationDate" TIMESTAMPTZ, "meta" JSONB, "status" TEXT, ' +
        'CONSTRAINT "rel_post_pkey" PRIMARY KEY ("uuid"), CONSTRAINT "ck_rel_post_status" CHECK ("status" IN (\'draft\', \'it\'\'s\')))'
    );
    assert.ok(!sql.includes("NOT NULL"), "every column is nullable");
  }

  @test
  quotesReservedWords() {
    const [sql] = this.dialect.renderStep({
      kind: "createTable",
      table: {
        name: "t",
        models: [],
        primaryKey: ["order", "user"],
        columns: [column("order", { kind: "text" }), column("user", { kind: "text" })]
      },
      foreignKeys: []
    });
    assert.strictEqual(
      sql,
      'CREATE TABLE IF NOT EXISTS "t" ("order" TEXT, "user" TEXT, CONSTRAINT "t_pkey" PRIMARY KEY ("order", "user"))'
    );
  }

  @test
  rendersOnlineAndContractSteps() {
    const foreignKey = {
      name: "fk_rel_comment_post",
      table: "rel_comment",
      columns: ["post"],
      references: { table: "rel_post", columns: ["uuid"] },
      onDelete: "CASCADE" as const
    };
    const index = { name: "uq_rel_post_slug", table: "rel_post", columns: ["slug"], unique: true };
    assert.deepStrictEqual(this.dialect.renderOnlineStep({ kind: "createIndex", index, online: true }), {
      inside: [],
      after: ['CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "uq_rel_post_slug" ON "rel_post" ("slug")'],
      onFailure: ['DROP INDEX IF EXISTS "uq_rel_post_slug"']
    });
    const online = this.dialect.renderOnlineStep({ kind: "addForeignKey", foreignKey, online: true });
    assert.ok(online.inside[0].includes("DEFERRABLE INITIALLY DEFERRED NOT VALID; END IF; END $$"));
    assert.deepStrictEqual(online.after, ['ALTER TABLE "rel_comment" VALIDATE CONSTRAINT "fk_rel_comment_post"']);
    const step = { kind: "addColumn" as const, table: "rel_post", column: column("summary", { kind: "text" }) };
    assert.deepStrictEqual(this.dialect.renderOnlineStep(step), { inside: this.dialect.renderStep(step), after: [] });
    assert.deepStrictEqual(
      [
        { kind: "dropColumn" as const, table: "rel_post", column: "legacy" },
        { kind: "dropTable" as const, table: "rel_old" },
        { kind: "setNotNull" as const, table: "rel_post", column: "title" },
        { kind: "validateForeignKey" as const, table: "rel_comment", constraint: "fk_rel_comment_post" }
      ].flatMap(s => this.dialect.renderContractStep(s)),
      [
        'ALTER TABLE "rel_post" DROP COLUMN IF EXISTS "legacy"',
        'DROP TABLE IF EXISTS "rel_old"',
        'ALTER TABLE "rel_post" ALTER COLUMN "title" SET NOT NULL',
        'ALTER TABLE "rel_comment" VALIDATE CONSTRAINT "fk_rel_comment_post"'
      ]
    );
  }

  @test
  rendersAdditiveSteps() {
    assert.deepStrictEqual(
      this.dialect.renderStep({ kind: "addColumn", table: "rel_post", column: column("summary", { kind: "text" }) }),
      ['ALTER TABLE "rel_post" ADD COLUMN IF NOT EXISTS "summary" TEXT']
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
        kind: "createIndex",
        index: { name: "uq_rel_post_slug", table: "rel_post", columns: ["slug", "lang"], unique: true }
      }),
      ['CREATE UNIQUE INDEX IF NOT EXISTS "uq_rel_post_slug" ON "rel_post" ("slug", "lang")']
    );
    assert.deepStrictEqual(
      this.dialect.renderStep({
        kind: "addForeignKey",
        foreignKey: {
          name: "fk_rel_comment_post",
          table: "rel_comment",
          columns: ["post"],
          references: { table: "rel_post", columns: ["uuid"] },
          onDelete: "CASCADE"
        }
      }),
      [
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid " +
          "JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relname = 'rel_comment' " +
          "AND con.conname = 'fk_rel_comment_post') THEN " +
          'ALTER TABLE "rel_comment" ADD CONSTRAINT "fk_rel_comment_post" FOREIGN KEY ("post") REFERENCES "rel_post" ("uuid") ' +
          "ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED; END IF; END $$"
      ]
    );
  }

  @test
  jsonColumnOperations() {
    const d = this.dialect;
    assert.strictEqual(d.schemaLock("my store"), "SELECT pg_advisory_xact_lock(hashtext('my store'))");
    assert.strictEqual(d.castText('"n"'), 'CAST("n" AS TEXT)');
    assert.strictEqual(d.toJson('"n"', { kind: "bigint" }), 'to_jsonb("n")');
    assert.strictEqual(
      d.toJson('"at"', { kind: "timestamptz" }),
      `to_jsonb(to_char("at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`
    );
    assert.strictEqual(d.columnJsonText("m", ["a", "b"]), `"m"#>>'{a,b}'`);
    assert.strictEqual(d.columnJsonText("m", []), `"m"#>>'{}'`);
    assert.strictEqual(d.columnJsonValue("m", ["a"]), `"m"#>'{a}'`);
    assert.strictEqual(d.columnJsonValueOrNull("m", ["a"]), `NULLIF("m"#>'{a}', 'null'::jsonb)`);
    const mergeArgs: unknown[] = ["x", "y"];
    assert.strictEqual(d.columnJsonMerge("e", { k: 1 }, mergeArgs), `COALESCE("e", '{}'::jsonb) || $3::jsonb`);
    assert.deepStrictEqual(mergeArgs, ["x", "y", JSON.stringify({ k: 1 })]);
    assert.strictEqual(d.columnJsonRemoveKey("e", 3), `"e" - $3`);
    assert.strictEqual(
      d.columnJsonSetPath("m", ["a"], 3),
      `jsonb_set(COALESCE("m", '{}'::jsonb), '{a}', $3::jsonb, true)`
    );
    const nested = d.columnJsonSetPath("m", ["a", "b"], 3);
    assert.ok(nested.endsWith(`, '{a,b}', $3::jsonb, true)`));
    assert.ok(nested.includes(`CASE WHEN jsonb_typeof(COALESCE("m", '{}'::jsonb) #> '{a}') IN ('object', 'array')`));
    assert.strictEqual(
      d.columnJsonSetItem("files", 2, undefined),
      `COALESCE("files", '[]'::jsonb) || jsonb_build_array($2::jsonb)`
    );
    assert.strictEqual(
      d.columnJsonSetItem("files", 2, 1),
      `jsonb_set(COALESCE("files", '[]'::jsonb), '{1}', $2::jsonb)`
    );
    assert.strictEqual(d.columnJsonRemoveItem("files", 1), `COALESCE("files" - 1, '[]'::jsonb)`);
    assert.strictEqual(d.columnJsonItemCondition("files", 1, "hash", 3), `"files"#>>'{1,hash}' = $3`);
    assert.throws(() => d.keyText("a' OR 1=1--"), /Invalid attribute/);
    assert.throws(() => d.jsonText(["a", "b'}--"]), /Invalid attribute/);
    assert.throws(() => d.setCollectionItem("items", 1, -1, "2026-01-01"), /Invalid index/);
    assert.throws(() => d.columnJsonSetPath("m", ["a", "b'}--"], 1), /Invalid attribute/);
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

  @test
  classifiesForeignKeyErrors() {
    assert.deepStrictEqual(this.dialect.isForeignKeyViolation({ code: "23503", constraint: "fk_x" }), {
      constraint: "fk_x"
    });
    assert.strictEqual(this.dialect.isForeignKeyViolation({ code: "23505" }), undefined);
    assert.strictEqual(this.dialect.isForeignKeyViolation(new Error("x")), undefined);
    assert.strictEqual(this.dialect.isForeignKeyViolation(undefined), undefined);
  }

  @test
  mapsLiveTypes() {
    const map = (data_type: string, length?: number) =>
      this.dialect.liveType({ data_type, character_maximum_length: length ?? null });
    assert.deepStrictEqual(map("text"), { kind: "text" });
    assert.deepStrictEqual(map("character varying", 100), { kind: "varchar", length: 100 });
    assert.deepStrictEqual(map("character varying"), { kind: "text" });
    assert.deepStrictEqual(map("timestamp with time zone"), { kind: "timestamptz" });
    assert.deepStrictEqual(map("date"), { kind: "date" });
    assert.deepStrictEqual(map("bigint"), { kind: "bigint" });
    assert.deepStrictEqual(map("integer"), { kind: "bigint" });
    assert.deepStrictEqual(map("smallint"), { kind: "bigint" });
    assert.deepStrictEqual(map("double precision"), { kind: "double" });
    assert.deepStrictEqual(map("real"), { kind: "double" });
    assert.deepStrictEqual(map("numeric"), { kind: "decimal" });
    assert.deepStrictEqual(map("boolean"), { kind: "boolean" });
    assert.deepStrictEqual(map("jsonb"), { kind: "json" });
    assert.deepStrictEqual(map("json"), { kind: "json" });
    assert.deepStrictEqual(map("uuid"), { kind: "uuid" });
    assert.strictEqual(map("money"), undefined);
  }

  @test
  timeTextAndUniqueViolation() {
    const d = this.dialect;
    assert.strictEqual(d.timeText('"d"', { kind: "date" }), `to_char("d", 'YYYY-MM-DD')`);
    assert.strictEqual(
      d.timeText('"d"', { kind: "timestamptz" }),
      `to_char("d" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
    );
    assert.deepStrictEqual(d.uniqueViolation({ code: "23505", table: "rel_post", constraint: "rel_post_pkey" }), {
      table: "rel_post",
      constraint: "rel_post_pkey",
      primaryKey: true
    });
    assert.deepStrictEqual(d.uniqueViolation({ code: "23505", table: "rel_user", constraint: "uq_rel_user_email" }), {
      table: "rel_user",
      constraint: "uq_rel_user_email",
      primaryKey: false
    });
    assert.strictEqual(d.uniqueViolation({ code: "23503" }), undefined);
  }
}
