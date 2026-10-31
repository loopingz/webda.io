import { buildSchemaPlan } from "@webda/sql-schema";
import type { ColumnType, SchemaModelMetadata } from "@webda/sql-schema";
import { describe, expect, it } from "vitest";
import type { LiveSchema, LiveTable, SchemaStep } from "./dialect.js";
import { SchemaDriftError, compatibleType, describeStep, planSchemaChanges } from "./sync.js";

/**
 * Model metadata as compiled in webda.module.json
 * @param Identifier - the model identifier
 * @param properties - the stored properties
 * @param extra - other metadata
 * @returns the metadata
 */
function model(
  Identifier: string,
  properties: { [name: string]: any },
  extra: Partial<SchemaModelMetadata> = {}
): SchemaModelMetadata {
  return {
    Identifier,
    PrimaryKey: ["uuid"],
    Ancestors: [],
    Subclasses: [],
    Relations: {},
    Reflection: {},
    Schemas: { Stored: { type: "object", properties, required: Object.keys(properties) } },
    ...extra
  };
}

const plan = buildSchemaPlan([
  model(
    "App/Post",
    { uuid: { type: "string" }, title: { type: "string" }, views: { type: "integer" }, author: { type: "string" } },
    { Relations: { links: [{ attribute: "author", model: "App/User", type: "LINK" }] } }
  ),
  model("App/User", { uuid: { type: "string" }, name: { type: "string" }, email: { type: "string", maxLength: 100 } })
]);
const emptyLive: LiveSchema = { tables: {} };

/**
 * A live table with the given column types, every index and constraint present
 * @param columns - column name to type
 * @param full - whether the indexes and constraints of the plan table are present
 * @returns the live table
 */
function live(table: string, columns: { [name: string]: ColumnType | undefined }, full = true): LiveTable {
  return {
    columns: Object.fromEntries(
      Object.entries(columns).map(([name, type]) => [name, { type, nullable: true, raw: type?.kind ?? "money" }])
    ),
    indexes: new Set(full ? plan.indexes.filter(i => i.table === table).map(i => i.name) : []),
    constraints: new Set(full ? plan.foreignKeys.filter(f => f.table === table).map(f => f.name) : [])
  };
}

/**
 * @param table - a plan table name
 * @returns its columns as live columns of the planned type
 */
function planned(table: string): { [name: string]: ColumnType } {
  return Object.fromEntries(plan.tables.find(t => t.name === table)!.columns.map(c => [c.name, c.type]));
}

const kinds = (steps: SchemaStep[]) => steps.map(s => s.kind);

describe("planSchemaChanges", () => {
  it("createFromEmptyEmitsTablesIndexesThenForeignKeys", () => {
    const { steps, drift } = planSchemaChanges(plan, emptyLive, "create");
    expect(kinds(steps)).toEqual([
      ...plan.tables.map(() => "createTable"),
      ...plan.indexes.map(() => "createIndex"),
      ...plan.foreignKeys.map(() => "addForeignKey")
    ]);
    expect(plan.foreignKeys.length).toBeGreaterThan(0);
    expect(steps.filter(s => s.kind === "createTable").map(s => (s as any).table.name)).toEqual(
      plan.tables.map(t => t.name)
    );
    expect(drift).toEqual([]);
  });

  it("alterOnlyAddsOnExistingTables", () => {
    const partial: LiveSchema = {
      tables: { app_post: live("app_post", { uuid: { kind: "text" }, title: { kind: "text" } }, false) }
    };
    const alter = planSchemaChanges(plan, partial, "alter");
    expect(kinds(alter.steps).filter(k => k === "createTable")).toEqual(["createTable"]);
    expect((alter.steps.find(s => s.kind === "createTable") as any).table.name).toBe("app_user");
    const added = alter.steps
      .filter(s => s.kind === "addColumn")
      .map(s => (s as any).column.name)
      .sort();
    expect(added).toEqual(
      plan.tables
        .find(t => t.name === "app_post")!
        .columns.map(c => c.name)
        .filter(c => !["uuid", "title"].includes(c))
        .sort()
    );
    expect(kinds(alter.steps).filter(k => k === "addForeignKey")).toEqual(plan.foreignKeys.map(() => "addForeignKey"));
    expect(alter.drift).toEqual([]);
    const create = planSchemaChanges(plan, partial, "create");
    expect(kinds(create.steps)).toEqual([
      "createTable",
      ...plan.indexes.filter(i => i.table === "app_user").map(() => "createIndex")
    ]);
    expect(create.drift.map(d => d.message)).toContain("column app_post.views is missing (schemaSync: alter adds it)");
    expect(
      create.drift.some(d => d.message.startsWith("add foreign key") || d.message.startsWith("create index"))
    ).toBe(true);
  });

  it("driftReportsTypeMismatchUnknownAndExtraColumns", () => {
    const columns = planned("app_post");
    const drifted: LiveSchema = {
      tables: {
        app_post: live("app_post", {
          ...columns,
          title: { kind: "bigint" },
          views: undefined,
          legacy: { kind: "text" }
        }),
        app_user: live("app_user", planned("app_user"))
      }
    };
    const { steps, drift } = planSchemaChanges(plan, drifted, "alter");
    expect(steps).toEqual([]);
    expect(drift.map(d => d.message).sort()).toEqual([
      "column app_post.legacy is not in the plan (DROP COLUMN is never run)",
      "column app_post.title is bigint, expected text",
      "column app_post.views is money, expected bigint"
    ]);
    expect(drift.every(d => d.table === "app_post")).toBe(true);
  });

  it("wideningIsNotDrift", () => {
    const user = planned("app_user");
    expect(user.email).toEqual({ kind: "varchar", length: 100 });
    const wider: LiveSchema = {
      tables: {
        app_post: live("app_post", planned("app_post")),
        app_user: live("app_user", { ...user, email: { kind: "text" } })
      }
    };
    expect(planSchemaChanges(plan, wider, "alter")).toEqual({ steps: [], drift: [] });
  });

  it("uuidAndTextAreTheSame", () => {
    expect(compatibleType({ kind: "uuid" }, { kind: "text" })).toBe(true);
    expect(compatibleType({ kind: "text" }, { kind: "uuid" })).toBe(true);
    expect(compatibleType({ kind: "text" }, { kind: "bigint" })).toBe(false);
    expect(compatibleType({ kind: "varchar", length: 10 }, { kind: "varchar", length: 5 })).toBe(true);
    expect(compatibleType({ kind: "varchar", length: 5 }, { kind: "varchar", length: 10 })).toBe(false);
  });

  it("inlineForeignKeysSkipStepsAndReportDrift", () => {
    const fresh = planSchemaChanges(plan, emptyLive, "create", { inlineForeignKeys: true });
    expect(fresh.steps.some(s => s.kind === "addForeignKey")).toBe(false);
    const post = fresh.steps.find(s => s.kind === "createTable" && s.table.name === "app_post") as any;
    expect(post.foreignKeys).toEqual(plan.foreignKeys.filter(fk => fk.table === "app_post"));
    expect(post.foreignKeys.length).toBeGreaterThan(0);
    const existing: LiveSchema = {
      tables: {
        app_post: live("app_post", planned("app_post"), false),
        app_user: live("app_user", planned("app_user"))
      }
    };
    const alter = planSchemaChanges(plan, existing, "alter", { inlineForeignKeys: true });
    expect(alter.steps.some(s => s.kind === "addForeignKey")).toBe(false);
    expect(alter.drift.map(d => d.message)).toContain(
      `foreign key ${plan.foreignKeys[0].name} cannot be added to app_post: recreate the table`
    );
    // Without the option the step is planned, as before
    expect(planSchemaChanges(plan, existing, "alter").steps.some(s => s.kind === "addForeignKey")).toBe(true);
  });

  it("schemaDriftErrorListsEverything", () => {
    const steps: SchemaStep[] = [
      { kind: "createTable", table: plan.tables[0], foreignKeys: [] },
      { kind: "addColumn", table: "app_post", column: plan.tables[0].columns[0] },
      { kind: "createIndex", index: plan.indexes[0] },
      { kind: "addForeignKey", foreignKey: plan.foreignKeys[0] }
    ];
    const drift = [{ table: "app_post", column: "x", message: "column app_post.x is money, expected text" }];
    const error = new SchemaDriftError(steps, drift);
    expect(error.code).toBe("SCHEMA_DRIFT");
    expect(error.steps).toBe(steps);
    expect(error.drift).toBe(drift);
    for (const step of steps) {
      expect(error.message).toContain(describeStep(step));
    }
    expect(error.message).toContain(drift[0].message);
    expect(describeStep(steps[0])).toBe(`create table ${plan.tables[0].name}`);
    expect(describeStep(steps[1])).toBe(`add column app_post.${plan.tables[0].columns[0].name}`);
    expect(describeStep(steps[2])).toBe(`create index ${plan.indexes[0].name}`);
    expect(describeStep(steps[3])).toBe(`add foreign key ${plan.foreignKeys[0].name}`);
  });
});
